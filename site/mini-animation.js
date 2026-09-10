// Pure, deterministic photo geometry: the same clock drives playback and pausing.
export const MINI_DURATION=14.2;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export function miniTimeline(t){
 return {
  space:ease((t-5.3)/1.8),
  gaze:ease((t-6.0)/1.0),
  surprise:ease((t-7.15)/1.1),
  arrival:ease((t-7.35)/2.5),
  open:ease((t-10.6)/1.2),
  fade:1,
  finished:t>=MINI_DURATION,
  stage:t<5?'assembly':t<6?'portrait':t<7.35?'reaction':t<10.6?'gift-arriving':t<11.8?'gift-opening':t<MINI_DURATION?'confetti':'unpacking'
 };
}
export function movePortraitPoint(d,t,layout){
 const state=miniTimeline(t),H=layout.portraitHeight;
 let x=d.x,y=d.y;
 if(d.pupil){x+=H*.0055*state.gaze;y-=H*.0005*state.gaze;}
 else if(d.eye){y+=(d.y-d.eyeY)*.025*state.surprise;}
 if(d.region.endsWith('eyebrow'))y-=H*.0035*state.surprise;
 if(d.region==='mouth'){
  const delta=d.y-layout.mouthY;
  y+=delta*.06*state.surprise+(delta>0?H*.001:-H*.0005)*state.surprise;
 }
 const scale=1-.10*state.space;
 return {x:layout.cx+(x-layout.cx)*scale-layout.viewportWidth*.14/layout.worldScale*state.space,
  y:layout.cy+(y-layout.cy)*scale,size:d.size*scale};
}
export function buildGiftScene(layout,photoCount){
 const boxSize=Math.min(layout.viewportWidth*.235,(layout.viewportHeight-145)*.32)/layout.worldScale;
 const centerX=layout.cx+layout.viewportWidth*.21/layout.worldScale;
 const centerY=layout.cy+(layout.viewportHeight*.60-(layout.viewportHeight-60)/2)/layout.worldScale;
 const tiles=[];
 const add=(x,y,size,group,tint=null)=>tiles.push({x,y,size,group,tint,photoIndex:(tiles.length*137+77)%photoCount});
 // The box body, ribbon, lid and bow are all made from entire photographs.
 for(let row=0;row<9;row++)for(let col=0;col<12;col++)
  add((col+.5)/12-.5,(row+.5)/12, .079,'body',col===5||col===6?'ribbon':null);
 for(let col=0;col<12;col++)add((col+.5)/12-.5,-.008,.079,'inside','inside');
 for(let row=0;row<2;row++)for(let col=0;col<14;col++)
  add((col+.5)/12-7/12,(row-1.5)/12,.079,'lid',col===6||col===7?'ribbon':null);
 for(const side of [-1,1])for(let i=0;i<18;i++){
  const a=i/18*Math.PI*2;
  add(side*(.115+.11*Math.cos(a)),-.25-.10*Math.sin(a),.050,'bow','ribbon');
 }
 let seed=73821;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const particles=Array.from({length:280},(_,i)=>({
  photoIndex:(i*193+29)%photoCount,delay:(i%3)*.36+random()*.25,
  vx:(random()-.5)*2.6,vy:-1.05-random()*1.10,
  size:.050+random()*.050,spin:(random()-.5)*7,phase:random()*Math.PI*2
 }));
 return {boxSize,centerX,centerY,tiles,particles,layout};
}
export function giftPhotoGeometry(scene,t){
 if(t<7.35)return [];
 const state=miniTimeline(t),B=scene.boxSize;
 const travel=(1-state.arrival)*(scene.layout.viewportWidth*.55/scene.layout.worldScale+B);
 const roll=Math.sin((t-7.35)*8)*(1-state.arrival)*.045;
 const cx=scene.centerX+travel,cy=scene.centerY;
 const tiles=scene.tiles.map(tile=>{
  let x=tile.x*B,y=tile.y*B,angle=roll;
  if(tile.group==='lid'||tile.group==='bow'){
   angle-=state.open*.35;
   const pivotX=-.55*B,pivotY=-.08*B;
   const dx=x-pivotX,dy=y-pivotY;
   x=pivotX+dx*Math.cos(-state.open*.35)-dy*Math.sin(-state.open*.35)-state.open*.08*B;
   y=pivotY+dx*Math.sin(-state.open*.35)+dy*Math.cos(-state.open*.35)-state.open*.48*B;
  }
  const size=tile.size*B;
  return {x:cx+x-size/2,y:cy+y-size/2,size,angle,
   alpha:state.fade*(tile.group==='inside'?.35+.65*state.open:1),
   photoIndex:tile.photoIndex,tint:tile.tint,kind:tile.group};
 });
 for(const particle of scene.particles){
  const age=t-11.8-particle.delay;
  if(age<0||age>6.2)continue;
  const vx=particle.vx*B,vy=particle.vy*B;
  const size=particle.size*B;
  tiles.push({x:scene.centerX+vx*age+Math.sin(age*3+particle.phase)*B*.12-size/2,
   y:scene.centerY+vy*age+B*.24*age*age-size/2,size,
   angle:particle.phase+particle.spin*age,
   alpha:state.fade*(1-ease((age-4.5)/1.7)),photoIndex:particle.photoIndex,kind:'confetti',tint:null});
 }
 return tiles;
}
