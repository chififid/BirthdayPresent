"""Trace the AI-generated head-only line drawing into 1600 mosaic positions.
The generated bitmap is read unmodified. Only native SVG/JSON geometry is authored.
"""
from pathlib import Path
import json
import hashlib
import cv2
import numpy as np
from PIL import Image
from scipy.optimize import linear_sum_assignment
from scipy.spatial import cKDTree
from skimage.morphology import skeletonize

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'site/assets'
SOURCE=OUT/'portrait-line-art-v2.png'
SOURCE_COUNT=800
COUNT=SOURCE_COUNT*2
with Image.open(SOURCE) as image:
 # Composite alpha mathematically for detection, without changing the saved asset.
 rgba=np.array(image.convert('RGBA'),dtype=float)
 luminance=(rgba[:,:,:3]*[.299,.587,.114]).sum(axis=2)
 gray=(luminance*rgba[:,:,3]/255+255*(1-rgba[:,:,3]/255)).astype('uint8')
ink=gray<160
n,labels,stats,_=cv2.connectedComponentsWithStats(ink.astype('uint8'),8)
keep=np.zeros(n,dtype=bool);keep[1:]=stats[1:,cv2.CC_STAT_AREA]>=12
ink=keep[labels]
skel=skeletonize(ink)
yx=np.argwhere(skel)
assert len(yx)>COUNT, f'Not enough line pixels: {len(yx)}'
ymin,xmin=yx.min(axis=0);ymax,xmax=yx.max(axis=0)
margin=max(8,round((ymax-ymin)*.025))
x0=max(0,xmin-margin);y0=max(0,ymin-margin)
x1=min(gray.shape[1],xmax+margin+1);y1=min(gray.shape[0],ymax+margin+1)
cw,ch=x1-x0,y1-y0
candidates=np.column_stack(((yx[:,1]-x0)/cw,(yx[:,0]-y0)/ch))
# Masks refer to the generated head-only drawing, not the original photograph.
# Allocate an explicit 70% of the tiles to facial features and 30% to hair.
u=yx[:,1]/gray.shape[1];v=yx[:,0]/gray.shape[0]
def ellipse(cx,cy,rx,ry):return ((u-cx)/rx)**2+((v-cy)/ry)**2<=1
regions=[
 ('left_eye',170,ellipse(.540,.428,.112,.061)),
 ('right_eye',150,ellipse(.755,.505,.080,.057)),
 ('left_eyebrow',80,ellipse(.550,.347,.115,.046)),
 ('right_eyebrow',80,ellipse(.792,.443,.093,.038)),
 ('nose',150,ellipse(.637,.567,.118,.061)),
 ('mouth',200,ellipse(.552,.654,.133,.066)),
]
face_polygon=np.array([(.305,.395),(.490,.345),(.680,.290),(.790,.285),(.845,.370),(.865,.475),
 (.824,.590),(.730,.680),(.620,.770),(.485,.805),(.366,.735),(.275,.590),(.240,.445)])
face_mask=np.zeros_like(skel,dtype=np.uint8)
cv2.fillPoly(face_mask,[(face_polygon*[gray.shape[1],gray.shape[0]]).astype(np.int32)],1)
face=face_mask[yx[:,0],yx[:,1]].astype(bool)
regions.append(('face_outline',290,face))
left=np.full(gray.shape[0],gray.shape[1]);right=np.zeros(gray.shape[0])
top=np.full(gray.shape[1],gray.shape[0]);bottom=np.zeros(gray.shape[1])
np.minimum.at(left,yx[:,0],yx[:,1]);np.maximum.at(right,yx[:,0],yx[:,1])
np.minimum.at(top,yx[:,1],yx[:,0]);np.maximum.at(bottom,yx[:,1],yx[:,0])
outline=(yx[:,1]-left[yx[:,0]]<3)|(right[yx[:,0]]-yx[:,1]<3)|(yx[:,0]-top[yx[:,1]]<3)|(bottom[yx[:,1]]-yx[:,0]<3)
regions.append(('hair_outline',350,outline))
regions.append(('hair_strands',130,np.ones(len(yx),dtype=bool)))
selected=[];region_names=[];claimed=np.zeros(len(yx),dtype=bool)
for name,budget,mask in regions:
 indices=np.flatnonzero(mask & ~claimed)
 claimed |= mask
 if len(indices)<budget:raise RuntimeError(f'{name}: {len(indices)} pixels for {budget} tiles')
 local=candidates[indices]*[cw/ch,1]
 distances=np.full(len(indices),np.inf)
 index=int(np.argmin(local[:,1]));chosen=[]
 for _ in range(budget):
  chosen.append(index)
  distances=np.minimum(distances,np.sum((local-local[index])**2,axis=1))
  distances[chosen]=-1;index=int(np.argmax(distances))
 selected.extend(indices[chosen]);region_names.extend([name]*budget)
points=candidates[selected]
nearest=cKDTree(points*np.array([cw/ch,1])).query(points,k=2)[0][:,1]
# Follow local spacing instead of forcing a uniform size. Open hair sections use
# larger photos; dense facial lines and especially eyes keep restrained tiles.
region_array=np.array(region_names)
is_hair=np.char.startswith(region_array,'hair')
is_eye=np.isin(region_array,['left_eye','right_eye'])
tile_sizes=np.clip(nearest*.98,.0085,.015)
hair_scale=np.where(region_array[is_hair]=='hair_outline',1.24,1.10)
tile_sizes[is_hair]=np.clip(nearest[is_hair]*hair_scale,.0095,.020)
face_tree=cKDTree((points*np.array([cw/ch,1]))[~is_hair])
face_distance=face_tree.query((points*np.array([cw/ch,1]))[is_hair])[0]
tile_sizes[is_hair]=np.minimum(tile_sizes[is_hair],np.maximum(.009,face_distance*.95))
tile_sizes[is_eye]=np.clip(nearest[is_eye]*.72,.0075,.009)

# Mirror the browser's stable photo shuffle, including the five existing duplicate files.
photos=json.loads((OUT/'photos.json').read_text())['photos']
seed=20260909
for i in range(len(photos)-1,0,-1):
 seed=(1664525*seed+1013904223)&0xffffffff
 j=int(seed/4294967296*(i+1));photos[i],photos[j]=photos[j],photos[i]
groups={}
for i,photo in enumerate(photos):
 digest=hashlib.sha256((ROOT/'photos'/photo['file']).read_bytes()).hexdigest()
 groups.setdefault(digest,[]).append(i)
source_group={i:group for group in groups.values() for i in group}
rng=np.random.default_rng(20260919)
physical=points*np.array([cw/ch,1])
minimum=.18
# Random destinations, with a hard separation constraint for every identical image.
# This deliberately replaces the previous shortest-travel assignment that put twins together.
order=rng.permutation(COUNT);first=order[:SOURCE_COUNT].copy();pool=order[SOURCE_COUNT:]
for group in groups.values():
 for pos,i in enumerate(group):
  for earlier in group[:pos]:
   if np.linalg.norm(physical[first[i]]-physical[first[earlier]])>=minimum:continue
   for swap in rng.permutation(SOURCE_COUNT):
    if len(source_group[swap])!=1:continue
    if all(np.linalg.norm(physical[first[swap]]-physical[first[k]])>=minimum for k in group if k!=i):
     first[i],first[swap]=first[swap],first[i];break
cost=rng.random((SOURCE_COUNT,SOURCE_COUNT))
for i in range(SOURCE_COUNT):
 for member in source_group[i]:
  close=np.linalg.norm(physical[pool]-physical[first[member]],axis=1)<minimum
  cost[i,close]=1e9
for attempt in range(100):
 _,matching=linear_sum_assignment(cost)
 if np.any(cost[np.arange(SOURCE_COUNT),matching]>=1e9):raise RuntimeError('Cannot separate all duplicate photos')
 second=pool[matching]
 violations=[]
 for group in groups.values():
  for pos,i in enumerate(group):
   for j in group[:pos]:
    if np.linalg.norm(physical[second[i]]-physical[second[j]])<minimum:violations.append(i)
 if not violations:break
 for i in violations:cost[i,matching[i]]=1e9
else:raise RuntimeError('Duplicate separation did not converge')
assignment=np.concatenate((first,second))
layouts={str(cols):assignment.tolist() for cols in [40,25]}
min_duplicate_distance=1.0
for group in groups.values():
 indices=[assignment[i+copy*SOURCE_COUNT] for i in group for copy in range(2)]
 for a,i in enumerate(indices):
  for j in indices[:a]:min_duplicate_distance=min(min_duplicate_distance,float(np.linalg.norm(physical[i]-physical[j])))
assert min_duplicate_distance>=minimum
assert len(set(selected))==COUNT
# Trace the skeleton graph into open polylines for an independent SVG reference.
pixel_set=set(map(tuple,yx.tolist()))
neighbors={}
for py,px in pixel_set:
 adjacent=[]
 for dy in [-1,0,1]:
  for dx in [-1,0,1]:
   q=(py+dy,px+dx)
   if (dy==dx==0) or q not in pixel_set:continue
   if dx and dy and ((py+dy,px) in pixel_set or (py,px+dx) in pixel_set):continue
   adjacent.append(q)
 neighbors[(py,px)]=adjacent
visited=set();paths=[]
def walk(start,nxt):
 path=[start];previous=start;current=nxt
 visited.add(tuple(sorted((previous,current))))
 while True:
  path.append(current)
  if len(neighbors[current])!=2:break
  choices=[p for p in neighbors[current] if p!=previous]
  if not choices:break
  following=choices[0];edge=tuple(sorted((current,following)))
  if edge in visited:break
  visited.add(edge);previous,current=current,following
 if len(path)>=3:
  xy=np.array([(px-x0,py-y0) for py,px in path],dtype=np.int32).reshape(-1,1,2)
  simplified=cv2.approxPolyDP(xy,.6,False)[:,0,:]
  paths.append(simplified)
for start in sorted(neighbors,key=lambda p:len(neighbors[p])==2):
 for nxt in neighbors[start]:
  if tuple(sorted((start,nxt))) not in visited:walk(start,nxt)
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {cw} {ch}" role="img" aria-label="Линии лица и волос">',
     '<g fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">']
for path in paths:
 svg.append('<path d="M'+' L'.join(f'{a},{b}' for a,b in path)+'"/>')
svg+=['</g></svg>']
(OUT/'portrait-contours.svg').write_text('\n'.join(svg))
result={'count':COUNT,'sourceCount':SOURCE_COUNT,'copiesPerPhoto':2,'aspect':cw/ch,
        'tileSize':round(float(np.median(tile_sizes)),6),'tileSizes':np.round(tile_sizes,6).tolist(),
        'points':np.round(points,6).tolist(),'layouts':layouts,'contourCount':len(paths),
        'allocation':{name:budget for name,budget,_ in regions},'pointRegions':region_names,
        'minimumDuplicateDistance':round(min_duplicate_distance,6),
        'hairStyle':'outline-with-sparse-strands','tileSizeRange':[.0075,.020],
        'source':{'file':SOURCE.name,'crop':[int(x0),int(y0),int(x1),int(y1)]}}
(OUT/'portrait.json').write_text(json.dumps(result,separators=(',',':')))
print(json.dumps({'source':SOURCE.name,'line_pixels':len(yx),'paths':len(paths),'destinations':COUNT,
 'source_photos':SOURCE_COUNT,'copies_each':2,'aspect':round(cw/ch,3),
 'allocation':result['allocation'],'minimum_duplicate_distance':round(min_duplicate_distance,4)},ensure_ascii=False))
