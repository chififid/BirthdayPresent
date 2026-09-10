"""Check finale state and interactions over CDP. No screenshots or visual checks."""
import argparse
import json
import time
import urllib.request
import websocket

parser = argparse.ArgumentParser()
parser.add_argument('--debug-port', type=int, default=9348)
parser.add_argument('--url', default='http://127.0.0.1:4180/')
args = parser.parse_args()
pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{args.debug_port}/json/list'))
page = next(p for p in pages if p['type'] == 'page')
ws = websocket.create_connection(page['webSocketDebuggerUrl'], suppress_origin=True)
request_id = 0
errors = []


def send(method, params=None):
    global request_id
    request_id += 1
    ws.send(json.dumps({'id': request_id, 'method': method, 'params': params or {}}))
    while True:
        result = json.loads(ws.recv())
        if result.get('method') == 'Runtime.exceptionThrown':
            errors.append(result['params'])
        if result.get('id') == request_id:
            assert 'error' not in result, result
            return result.get('result', {})


def js(expression):
    result = send('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    assert 'exceptionDetails' not in result, result
    return result['result'].get('value')


def state():
    return js("import('./app.js').then(m=>m.playbackState())")


def click(selector):
    js(f'document.querySelector({json.dumps(selector)}).click()')


def navigate(scene):
    send('Page.navigate', {'url': args.url + '?scene=' + scene})
    for _ in range(120):
        if js("document.querySelector('#explore')?.disabled===false && document.querySelector('#error')?.hidden===true"):
            return
        time.sleep(.1)
    raise AssertionError('App did not load')


def until(predicate, seconds=12):
    end = time.time()+seconds
    while time.time()<end:
        value=state()
        if predicate(value):
            return value
        time.sleep(.1)
    raise AssertionError('Timed out waiting for scene state')


def space():
    for kind in ['keyDown','keyUp']:
        send('Input.dispatchKeyEvent', {'type':kind,'key':' ','code':'Space'})


def mouse(x,y,click=False):
    send('Input.dispatchMouseEvent', {'type':'mouseMoved','x':x,'y':y})
    if click:
        for kind in ['mousePressed','mouseReleased']:
            send('Input.dispatchMouseEvent', {'type':kind,'x':x,'y':y,'button':'left','clickCount':1})


def action_click(action):
    camera=state()['camera']
    mouse(camera['x']+(action['x']+action['w']/2)*camera['scale'],
          camera['y']+(action['y']+action['h']/2)*camera['scale'],True)


send('Runtime.enable')
navigate('gifts')
s=until(lambda s:s['mode']=='gifts' and len(s['tiles'])>0)
assert s['giftChoice']['stage']=='unpacking'
assert s['giftChoice']['labels']==[]
space();time.sleep(.15);a=state();time.sleep(.25);b=state()
assert a['mode']==b['mode']=='paused' and a['tiles']==b['tiles']
assert a['giftChoice']['time']==b['giftChoice']['time']
space()
s=until(lambda s:s['giftChoice']['stage']=='options')
assert [t['giftId'] for t in s['tiles'] if t['kind']=='gift-image']==['horses','underwater']
card=next(a for a in s['giftChoice']['actions'] if a['type']=='choose')
cam=s['camera']
mouse(cam['x']+(card['x']+card['w']/2)*cam['scale'],cam['y']+(card['y']+card['h']/2)*cam['scale'])
time.sleep(.3)
assert state()['giftChoice']['hover'][0]>.5
assert any(t['kind']=='choice-cursor' for t in state()['tiles'])
space();time.sleep(.1);a=state()
mouse(45,45);click('#zoom-in');time.sleep(.45);b=state()
assert a['tiles']==b['tiles'], 'Paused geometry changed during pointer motion or zoom'
assert a['giftChoice']['labels']==b['giftChoice']['labels']
assert a['giftChoice']['time']==b['giftChoice']['time']
assert b['camera']['scale']>a['camera']['scale']
cursor=next(t for t in reversed(b['tiles']) if t['kind']=='choice-cursor')
cam=b['camera']
mouse(cam['x']+(cursor['x']+cursor['size']/2)*cam['scale'],cam['y']+(cursor['y']+cursor['size']/2)*cam['scale'],True)
time.sleep(.2)
assert js("document.querySelector('#viewer').open"), 'Frozen cursor photo did not open'
space();time.sleep(.5)
assert state()['mode']=='gifts' and not js("document.querySelector('#viewer').open")
js("window.__openedGift=null;window.open=(url)=>{window.__openedGift=url;return null;}")
link=next(a for a in state()['giftChoice']['actions'] if a['type']=='link' and a['giftId']=='horses')
action_click(link)
assert js('window.__openedGift')=='https://avanpost-bezpovoda.ru/romantika'
assert state()['giftChoice']['selected'] is None
card=next(a for a in state()['giftChoice']['actions'] if a['type']=='choose' and a['giftId']=='underwater')
action_click(card);time.sleep(.4)
s=state()
assert s['giftChoice']['selected']=='underwater'
assert [t['giftId'] for t in s['tiles'] if t['kind']=='gift-image']==['underwater']
assert not any(t['kind']=='choice-confetti' for t in s['tiles']), 'Burst started during centering'
space();time.sleep(.1);a=state();time.sleep(.3);b=state()
assert a['tiles']==b['tiles'], 'Centering did not freeze'
assert not any(t['kind']=='choice-confetti' for t in b['tiles'])
space()
s=until(lambda s:any(t['kind']=='choice-confetti' for t in s['tiles']))
centered=next(t for t in s['tiles'] if t['kind']=='gift-image')
assert abs(centered['x']+centered['width']/2-2000)<1e-7, 'Confetti started before centering completed'
assert max(i for i,t in enumerate(s['tiles']) if t['kind']=='choice-confetti')<next(i for i,t in enumerate(s['tiles']) if t['kind']=='gift-image')
assert s['giftChoice']['labels']==[]
space();time.sleep(.1);a=state();time.sleep(.25);b=state()
assert a['tiles']==b['tiles'] and a['giftChoice']['time']==b['giftChoice']['time']
space();time.sleep(.2)
click('#back');time.sleep(.2)
assert state()['mode']=='heart' and not state()['greetingsStarted']
assert not errors, errors
ws.close()
print('Passed: unpacking pause, two simultaneous gifts, hover, frozen photo cursor, zoom, original opening, clip link, centering before confetti, frozen confetti and reset. No visual checks.')
