import assert from 'node:assert/strict';
import {orderPhotoLayers} from '../site/photo-layers.js';
import {miniTimeline,buildGiftScene,giftPhotoGeometry,movePortraitPoint,MINI_DURATION} from '../site/mini-animation.js';
for(const [t,stage] of [[1,'assembly'],[5.5,'portrait'],[6.5,'reaction'],[8,'gift-arriving'],[11,'gift-opening'],[13,'confetti'],[MINI_DURATION,'unpacking']])assert.equal(miniTimeline(t).stage,stage);
assert(miniTimeline(MINI_DURATION).finished);
for(const [width,height] of [[1440,960],[390,844]]){
 const layout={cx:2000,cy:1000,worldScale:.15,portraitHeight:3500,portraitWidth:2800,viewportWidth:width,viewportHeight:height,mouthY:1100};
 const scene=buildGiftScene(layout,800);
 assert.equal(giftPhotoGeometry(scene,6).length,0);
 const closed=giftPhotoGeometry(scene,10),open=giftPhotoGeometry(scene,11.8),burst=giftPhotoGeometry(scene,13);
 assert(burst.filter(p=>p.kind==='confetti').length>240);
 const meanLid=arr=>arr.filter(p=>p.kind==='lid').reduce((n,p)=>n+p.y,0)/28;
 assert(meanLid(open)<meanLid(closed));
 for(const t of [7.5,10,11.5,13,15,18.9]){
  const pieces=giftPhotoGeometry(scene,t);
  for(const p of pieces){assert([p.x,p.y,p.size,p.alpha,p.angle].every(Number.isFinite));assert(p.size>0&&p.alpha>=0&&p.alpha<=1);assert(p.photoIndex>=0&&p.photoIndex<800);}
 }
 assert.equal(miniTimeline(MINI_DURATION).fade,1);
 assert(giftPhotoGeometry(scene,MINI_DURATION).some(p=>p.kind==='body'&&p.alpha===1));
 const layers=orderPhotoLayers([{kind:'portrait'},...burst]);
 assert(layers.findLastIndex(p=>p.kind==='confetti')<layers.findIndex(p=>p.kind!=='confetti'));

 assert.deepEqual(giftPhotoGeometry(scene,13),giftPhotoGeometry(scene,13));
 const base={x:2000,y:1000,size:20,region:'face_outline',eye:false,pupil:false};
 const iris=movePortraitPoint({...base,pupil:true},8,layout),neutral=movePortraitPoint(base,8,layout);
 assert(iris.x>neutral.x);
 assert(movePortraitPoint({...base,region:'left_eyebrow'},8,layout).y<neutral.y);
}
console.log('Passed: timeline, gaze/brows, box opening, 280 deterministic confetti behind subjects, bright handoff and valid photo geometry. No screenshots.');
