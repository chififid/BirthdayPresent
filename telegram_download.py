#!/usr/bin/env python3
"""Durable Telegram photo inbox. No outgoing Telegram messages."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
STATE = ROOT / '.telegram'

def db():
    con = sqlite3.connect(STATE / 'queue.sqlite', timeout=30)
    con.execute('PRAGMA journal_mode=WAL')
    return con

def log(message):
    print(time.strftime('%Y-%m-%d %H:%M:%S'), message, flush=True)

def api(method, **params):
    token = (STATE / 'token').read_text().strip()
    req = urllib.request.Request('https://api.telegram.org/bot' + token + '/' + method,
        data=json.dumps(params).encode(), headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=70) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        # Never log exception URLs: they contain the secret token.
        raise RuntimeError('Telegram HTTP ' + str(exc.code)) from None
    if not data.get('ok'):
        raise RuntimeError('Telegram API failure')
    return data['result']

def media(message):
    if message.get('photo'):
        item = max(message['photo'], key=lambda p: p.get('file_size', p['width'] * p['height']))
        return item, '.jpg'
    item = message.get('document', {})
    suffix = Path(item.get('file_name', '')).suffix.lower()
    if item and (item.get('mime_type', '').startswith('image/') or suffix in
                 {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.gif', '.tif', '.tiff', '.dng'}):
        return item, suffix if re.fullmatch(r'\.[a-z0-9]{1,8}', suffix) else '.img'
    return None

def poll():
    con = db()
    while True:
        try:
            row = con.execute("SELECT value FROM settings WHERE key='offset'").fetchone()
            updates = api('getUpdates', offset=int(row[0]) if row else 0,
                          timeout=45, allowed_updates=['message'])
            with con:
                for update in updates:
                    msg = update.get('message', {})
                    found = media(msg)
                    if found and msg.get('chat', {}).get('type') == 'private':
                        item, suffix = found
                        key = str(msg['chat']['id']) + '_' + str(msg['message_id'])
                        con.execute('INSERT OR IGNORE INTO jobs (id, payload, suffix) VALUES (?, ?, ?)',
                                    (key, json.dumps({'message': msg, 'file': item}, ensure_ascii=False), suffix))
                    con.execute("INSERT OR REPLACE INTO settings VALUES ('offset', ?)",
                                (str(update['update_id'] + 1),))
        except Exception as exc:
            log('Polling retry: ' + (str(exc) if type(exc) is RuntimeError else type(exc).__name__))
            time.sleep(5)

def download_job(job):
    key, payload, suffix = job
    data = json.loads(payload)
    item = data['file']
    info = api('getFile', file_id=item['file_id'])
    filename = key + suffix
    target = ROOT / 'photos' / filename
    partial = target.with_suffix(target.suffix + '.part')
    token = (STATE / 'token').read_text().strip()
    digest = hashlib.sha256()
    size = 0
    with urllib.request.urlopen('https://api.telegram.org/file/bot' + token + '/' + info['file_path'], timeout=90) as response, partial.open('wb') as output:
        while True:
            chunk = response.read(256 * 1024)
            if not chunk:
                break
            output.write(chunk)
            digest.update(chunk)
            size += len(chunk)
    expected = info.get('file_size') or item.get('file_size')
    if expected and size != expected:
        raise RuntimeError('Incomplete download')
    os.replace(partial, target)
    data.update({'local_file': 'photos/' + filename, 'sha256': digest.hexdigest(), 'bytes': size})
    metadata = ROOT / 'metadata' / (key + '.json')
    temp = metadata.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    os.replace(temp, metadata)
    return filename

def run():
    lock = (STATE / 'lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    con = db()
    con.executescript('''CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, payload TEXT, suffix TEXT,
        status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, retry_at REAL DEFAULT 0,
        error TEXT);''')
    con.commit()
    log('Photo downloader started')
    threading.Thread(target=poll, daemon=True).start()
    while True:
        job = con.execute("SELECT id, payload, suffix FROM jobs WHERE status='pending' AND retry_at<=? ORDER BY rowid LIMIT 1", (time.time(),)).fetchone()
        if not job:
            time.sleep(1)
            continue
        try:
            filename = download_job(job)
            with con:
                con.execute("UPDATE jobs SET status='done', error=NULL WHERE id=?", (job[0],))
            log('Saved ' + filename)
        except Exception as exc:
            error = str(exc) if type(exc) is RuntimeError else type(exc).__name__
            with con:
                con.execute("UPDATE jobs SET attempts=attempts+1, retry_at=?, error=? WHERE id=?",
                            (time.time() + 60, error, job[0]))
            log('Download queued for retry: ' + job[0] + ' (' + error + ')')

if __name__ == '__main__':
    os.umask(0o077)
    STATE.mkdir(exist_ok=True, mode=0o700)
    for folder in ['photos', 'metadata']:
        (ROOT / folder).mkdir(exist_ok=True)
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--status', action='store_true')
    args = parser.parse_args()
    if args.check:
        try:
            me = api('getMe')
            webhook = api('getWebhookInfo')
            print(json.dumps({'username': me['username'], 'webhook_active': bool(webhook.get('url'))}))
        except Exception as exc:
            print(str(exc) if type(exc) is RuntimeError else type(exc).__name__)
            raise SystemExit(1)
    elif args.status:
        con = db()
        print(json.dumps(dict(con.execute('SELECT status, count(*) FROM jobs GROUP BY status'))))
        for row in con.execute('SELECT id, error FROM jobs WHERE error IS NOT NULL LIMIT 10'):
            print(row)
    else:
        run()
