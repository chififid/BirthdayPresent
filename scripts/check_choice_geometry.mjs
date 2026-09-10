import assert from 'node:assert/strict';
import {gifts,CHOICE_REVEAL,CHOICE_CENTER_DURATION,createChoiceLayout,choiceFrame,hitChoiceAction} from '../site/gift-choice.js';
const layout=createChoiceLayout(800);
assert.deepEqual(gifts.map(g=>g.id),['horses','underwater']);
const intro=choiceFrame(layout,{time:.5});
assert.equal(intro.stage,'unpacking');
assert.equal(intro.tiles.filter(t=>t.kind==='gift-image').length,2);
assert(intro.tiles.filter(t=>t.kind==='gift-image').every(t=>t.alpha===1));
assert.deepEqual(intro.labels,[]);
assert.equal(intro.actions.length,0);
const opts={time:CHOICE_REVEAL+2,pointer:{x:1500,y:1300,cell:20,visible:true}};
const frame=choiceFrame(layout,opts),images=frame.tiles.filter(t=>t.kind==='gift-image');
assert.equal(images.length,2);
assert(images[0].x+images[0].width<images[1].x);
assert.equal(images[0].width/images[0].height,1);
assert.equal(images[1].width/images[1].height,1.5);
assert(frame.tiles.some(t=>t.kind==='choice-cursor'));
assert.equal(frame.actions.filter(a=>a.type==='link').length,2);
for(const a of frame.actions.filter(a=>a.type==='link')){
 assert.equal(hitChoiceAction(frame.actions,a.x+a.w/2,a.y+a.h/2).type,'link');
 const im=images.find(im=>im.giftId===a.giftId);
 assert(a.y>im.y+im.height+40,'Clip hit area overlaps its photo/frame');
}
const decoration=frame.tiles.filter(t=>t.slot!==undefined);
for(let i=0;i<=100;i++){
 const f=choiceFrame(layout,{...opts,hover:[i/100,i/100]}),d=f.tiles.filter(t=>t.slot!==undefined);
 assert.deepEqual(d.map(t=>[t.slot,t.photoIndex]),decoration.map(t=>[t.slot,t.photoIndex]),'Hover changed topology or shuffled photos');
 assert.deepEqual(f.actions,frame.actions,'Hover moved its own hit target');
}
const nearA=choiceFrame(layout,{...opts,hover:[.335,.335]}).tiles;
const nearB=choiceFrame(layout,{...opts,hover:[.335001,.335001]}).tiles;
for(let i=0;i<nearA.length;i++)for(const key of ['x','y','size'])assert(Math.abs(nearA[i][key]-nearB[i][key])<.01,'Discontinuous hover geometry');
const later=choiceFrame(layout,{...opts,time:opts.time+.3});
assert.notDeepEqual(later.tiles.filter(t=>t.kind==='choice-clip').map(t=>[t.x,t.y]),frame.tiles.filter(t=>t.kind==='choice-clip').map(t=>[t.x,t.y]));
const hover=choiceFrame(layout,{...opts,hover:[1,0]}).tiles.find(t=>t.kind==='gift-image');
assert(hover.glow>images[0].glow&&hover.width>images[0].width);
for(const selected of gifts.map(g=>g.id)){
 for(const elapsed of [0,.1,.4,CHOICE_CENTER_DURATION-.00001]){
  const moving=choiceFrame(layout,{...opts,time:8+elapsed,selected,selectedAt:8});
  assert(!moving.tiles.some(t=>t.kind==='choice-confetti'),'Confetti started before the gift arrived');
 }
 const result=choiceFrame(layout,{...opts,time:8+CHOICE_CENTER_DURATION+1,selected,selectedAt:8});
 const centered=result.tiles.find(t=>t.kind==='gift-image');
 assert(Math.abs(centered.x+centered.width/2-2000)<1e-8);

 assert.deepEqual(result.tiles.filter(t=>t.kind==='gift-image').map(t=>t.giftId),[selected]);
 assert(result.tiles.filter(t=>t.kind==='choice-confetti').length>200);
 assert.deepEqual(result.labels,[]);
 assert(result.tiles.findLastIndex(t=>t.kind==='choice-confetti')<result.tiles.findIndex(t=>t.kind==='gift-image'));
 assert(result.tiles.findIndex(t=>t.kind==='choice-cursor')>result.tiles.findLastIndex(t=>t.kind==='choice-frame'));
 assert.equal(result.actions.filter(a=>a.type==='link').length,1);
 assert.equal(choiceFrame(layout,{...opts,time:18,selected,selectedAt:8}).tiles.filter(t=>t.kind==='choice-confetti').length,0);
 for(const t of result.tiles){
  assert([t.x,t.y,t.size,t.alpha,t.angle].every(Number.isFinite));
  assert(t.size>0&&t.alpha>=0&&t.alpha<=1);
  if(t.photoIndex!==null)assert(t.photoIndex>=0&&t.photoIndex<800);
 }
}
const sources=Array.from({length:1600},(_,i)=>({x:200+i%40*20,y:300+Math.floor(i/40)*20,size:20,angle:0,alpha:.98,photoIndex:i%800,kind:'portrait'}));
const transition={sources,origin:{x:2700,y:1800}};
const start=choiceFrame(layout,{time:0,transition});
const end=choiceFrame(layout,{time:CHOICE_REVEAL,transition});
for(const tile of start.tiles.filter(t=>t.slot!==undefined)){
 const source=sources[tile.slot%sources.length];
 assert.equal(tile.x,source.x);assert.equal(tile.y,source.y);assert.equal(tile.alpha,source.alpha);
}
assert(end.tiles.every(t=>t.kind!=='transition-source'));
assert.equal(end.stage,'options');
assert.deepEqual(choiceFrame(layout,opts),choiceFrame(layout,opts));
console.log('Passed: unpacking without blackout, no captions, fixed hover topology, detached animated clips, particles behind images, photo cursor and selection. No visual checks.');
