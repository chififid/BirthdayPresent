"""Assemble the static website and its original photos for GitHub Pages."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '_site'


def build():
    manifest = json.loads((ROOT / 'site/assets/photos.json').read_text())
    portrait = json.loads((ROOT / 'site/assets/portrait.json').read_text())
    photos = manifest['photos']
    if len(photos) != portrait['sourceCount']:
        raise ValueError('Photo count does not match portrait geometry')
    sources = []
    for photo in photos:
        filename = photo['file']
        if Path(filename).name != filename:
            raise ValueError('Photo filename must not contain a directory')
        source = ROOT / 'photos' / filename
        if not source.is_file():
            raise FileNotFoundError(source)
        sources.append(source)
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(ROOT / 'site', OUT)
    (OUT / 'photos').mkdir()
    for source in sources:
        shutil.copy2(source, OUT / 'photos' / source.name)
    (OUT / '.nojekyll').touch()
    size = sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file())
    print(f'Built {OUT}: {len(sources)} photos, {size / 1024**2:.1f} MiB')


if __name__ == '__main__':
    build()
