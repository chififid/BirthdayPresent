from pathlib import Path
from PIL import Image, ImageOps, ImageStat
import json, math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'site/assets'
OUT.mkdir(parents=True, exist_ok=True)
files=sorted((ROOT/'photos').glob('*.jpg'),key=lambda p:int(p.stem.split('_')[-1]))
CELL=96
COLS=32
atlas=Image.new('RGB',(COLS*CELL,math.ceil(len(files)/COLS)*CELL))
items=[]
for i,p in enumerate(files):
 with Image.open(p) as original:
  im=ImageOps.exif_transpose(original).convert('RGB')
  thumb=ImageOps.fit(im,(CELL,CELL),method=Image.Resampling.LANCZOS)
  atlas.paste(thumb,((i%COLS)*CELL,(i//COLS)*CELL))
  items.append({'id':p.stem,'file':p.name,'width':im.width,'height':im.height,'brightness':round(ImageStat.Stat(thumb.convert('L')).mean[0]/255,4)})
atlas.save(OUT/'atlas.webp','WEBP',quality=78,method=6)
(OUT/'photos.json').write_text(json.dumps({'cell':CELL,'columns':COLS,'photos':items},ensure_ascii=False))
print(f'{len(items)} photos. Atlas: {(OUT/"atlas.webp").stat().st_size/1024/1024:.2f} MB')
