import { orderPhotoLayers } from './photo-layers.js';
// World-space geometry for the finale. All moving pieces share the scene clock.
export const gifts=[
 {id:'horses',image:'./assets/gifts/horses.png',aspect:1,title:'Конная прогулка',url:'https://avanpost-bezpovoda.ru/romantika'},
 {id:'underwater',image:'./assets/gifts/underwater.jpg',aspect:1.5,title:'Подводная фотосессия',url:'https://oceanstars.ru/#gallery-34'}
];
export const CHOICE_REVEAL=2.4;
export const CHOICE_CENTER_DURATION=.9;
export const CHOICE_BOUNDS={x:0,y:0,w:4000,h:2400};
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;

export function createChoiceLayout(photoCount){
 const cards=gifts.map((gift,index)=>{
  const h=Math.min(1360,1560/gift.aspect),w=h*gift.aspect;
  return {giftId:gift.id,cx:index===0?1050:2950,cy:1160,w,h};
 });
 let seed=81721;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const confetti=Array.from({length:240},(_,i)=>({
  photoIndex:(i*137+91)%photoCount,delay:random()*.65,
  vx:(random()-.5)*1900,vy:-1000-random()*1450,
  size:38+random()*44,spin:(random()-.5)*8,phase:random()*Math.PI*2
 }));
 return {photoCount,cards,confetti};
}

function addFrame(tiles,card,photoCount,hover,time,alpha,offset){
 const {x,y,w,h}=card,step=43;
 let serial=offset;
 const add=(px,py,size,angle=0)=>{const slot=serial++;tiles.push({x:px-size/2,y:py-size/2,size,angle,alpha,slot,
  photoIndex:(slot*137+51)%photoCount,kind:'choice-frame'});};
 // A close-set inner rim follows the exact photo rectangle. A scalloped outer
 // strand and little heart-shaped corner flourishes give it a scrapbook shape.
 for(let edge=0;edge<4;edge++){
  // Keep topology and photo assignments fixed throughout hover and selection.
  const length=edge%2===0?w:h,count=Math.ceil((edge%2===0?card.baseW:card.baseH)/step);
  for(let i=0;i<=count;i++){
   const p=i/count,along=length*p,scallop=14+17*(1-Math.cos(p*Math.PI*16));
   const ripple=hover*6*Math.sin(time*5+i*.45);
   let px,py,ox,oy;
   if(edge===0){px=x+along;py=y-19;ox=0;oy=-scallop-ripple;}
   if(edge===1){px=x+w+19;py=y+along;ox=scallop+ripple;oy=0;}
   if(edge===2){px=x+w-along;py=y+h+19;ox=0;oy=scallop+ripple;}
   if(edge===3){px=x-19;py=y+h-along;ox=-scallop-ripple;oy=0;}
   add(px,py,40,Math.sin(i*.8+edge)*.09);
   if(i%2===0)add(px+ox,py+oy,28,Math.sin(i+edge)*.28);
  }
 }
 for(const [cx,cy] of [[x-20,y-20],[x+w+20,y+h+20]])for(let i=0;i<28;i++){
  const a=i/28*Math.PI*2;
  add(cx+5*Math.pow(Math.sin(a),3)*16,cy-5*(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a)),25,a*.12);
 }
}

function addClip(tiles,card,photoCount,alpha,offset,hover,time){
 // A single continuous open wire, including the two rounded bends of a paperclip.
 const points=[];
 for(let i=0;i<10;i++)points.push([42,135-i*18]);
 for(let i=0;i<=14;i++){const a=Math.PI*i/14;points.push([Math.cos(a)*42,-27-Math.sin(a)*42]);}
 for(let i=0;i<12;i++)points.push([-42,-27+i*18]);
 for(let i=0;i<=14;i++){const a=Math.PI-Math.PI*i/14;points.push([Math.cos(a)*42,171+Math.sin(a)*42]);}
 for(let i=0;i<10;i++)points.push([42,171-i*15]);
 for(let i=0;i<=10;i++){const a=Math.PI*i/10;points.push([21+Math.cos(a)*21,36-Math.sin(a)*21]);}
 for(let i=0;i<6;i++)points.push([0,36+i*16]);
 const cx=card.x+card.w/2,anchorY=card.y+card.h+165;
 const cy=anchorY+Math.sin(time*1.6+offset)*10,angle=.18+Math.sin(time*1.3+offset)*.055+hover*.05;
 points.forEach(([x,y],i)=>{
  const size=23;
  tiles.push({x:cx+x*Math.cos(angle)-y*Math.sin(angle)-size/2,
   y:cy+x*Math.sin(angle)+y*Math.cos(angle)-size/2,size,angle,alpha,
   photoIndex:(offset+i*193)%photoCount,slot:3000+offset+i,kind:'choice-clip',giftId:card.giftId});
 });
 return {x:cx-110,y:anchorY-100,w:220,h:350,type:'link',giftId:card.giftId};
}

const arrowRows=[
 '100000000','110000000','111000000','111100000','111110000',
 '111111000','111111100','111111110','111111111','111110000',
 '110111000','100111000','000011100','000011100'
];
export function cursorPhotoTiles(pointer,photoCount){
 if(!pointer?.visible)return [];
 const cell=pointer.cell,tiles=[];
 arrowRows.forEach((row,y)=>[...row].forEach((on,x)=>{
  if(on!=='1')return;
  tiles.push({x:pointer.x+x*cell,y:pointer.y+y*cell,size:cell*.94,angle:0,alpha:1,
   photoIndex:(tiles.length*137+313)%photoCount,kind:'choice-cursor'});
 }));
 return tiles;
}

export function choiceFrame(layout,{time,hover=[0,0],selected=null,selectedAt=0,pointer=null,reduced=false,transition=null}){
 const tiles=[],actions=[];
 const reveal=reduced?1:ease(time/CHOICE_REVEAL),ready=reveal===1;
 for(let i=0;i<layout.photoCount;i++)tiles.push({x:i%40*100,y:200+Math.floor(i/40)*100,size:95,
  angle:0,alpha:.015,photoIndex:i,kind:'choice-grid'});
 const origin=transition?.origin||{x:2000,y:2050};
 const selectionProgress=selected?ease((time-selectedAt)/CHOICE_CENTER_DURATION):0;
 layout.cards.forEach((base,index)=>{
  if(selected&&selected!==base.giftId)return;
  const lift=hover[index]||0,scale=(1+lift*.022)*(1+selectionProgress*.14);
  const destinationX=mix(base.cx,2000,selectionProgress);
  const cx=mix(origin.x,destinationX,reveal),cy=mix(origin.y,base.cy,reveal)-Math.sin(reveal*Math.PI)*300;
  const openingScale=mix(.035,1,reveal),w=base.w*openingScale,h=base.h*openingScale;
  const card={giftId:base.giftId,x:cx-w*scale/2,y:cy-h*scale/2-lift*20,
   w:w*scale,h:h*scale,baseW:base.w,baseH:base.h};
  tiles.push({x:card.x,y:card.y,width:card.w,height:card.h,size:card.w,angle:0,alpha:1,
   giftId:base.giftId,photoIndex:null,kind:'gift-image',glow:lift});
  addFrame(tiles,card,layout.photoCount,lift,reduced?0:time,1,100+index*1000);
  // The hover target remains fixed as the photo rises; the edge cannot flicker.
  const neutral={giftId:base.giftId,x:cx-w*(1+selectionProgress*.14)/2,
   y:cy-h*(1+selectionProgress*.14)/2,w:w*(1+selectionProgress*.14),h:h*(1+selectionProgress*.14)};
  if(ready)actions.push({x:neutral.x-65,y:neutral.y-70,w:neutral.w+130,h:neutral.h+140,type:'choose',giftId:base.giftId});
  const link=addClip(tiles,neutral,layout.photoCount,1,100+index*1000,lift,reduced?0:time);
  if(ready)actions.push(link);
 });
 const used=new Set();
 for(const tile of tiles){
  if(tile.slot===undefined)continue;
  const source=transition?.sources?.length?transition.sources[tile.slot%transition.sources.length]:null;
  if(source){
   used.add(tile.slot%transition.sources.length);tile.photoIndex=source.photoIndex;
   if(!ready){
    const arc=Math.sin(reveal*Math.PI)*(tile.slot%2?95:-95);
    tile.x=mix(source.x,tile.x,reveal)+arc;tile.y=mix(source.y,tile.y,reveal)-Math.sin(reveal*Math.PI)*150;
    tile.size=mix(source.size,tile.size,reveal);tile.angle=mix(source.angle||0,tile.angle,reveal);
    tile.alpha=mix(source.alpha,1,reveal);
   }
  }else if(!ready){
   tile.x=mix(origin.x,tile.x,reveal);tile.y=mix(origin.y,tile.y,reveal);
   tile.size*=mix(.08,1,reveal);
  }
 }
 if(transition&&!ready)transition.sources.forEach((source,index)=>{
  if(used.has(index))return;
  const direction=source.x<2000?-1:1;
  tiles.push({...source,x:source.x+direction*reveal*6200,y:source.y+Math.sin(index*.71)*reveal*3000,
   size:source.size*(1-reveal*.6),angle:(source.angle||0)+direction*reveal*.8,kind:'transition-source'});
 });
 if(selected)for(const particle of layout.confetti){
  // Share the centering clock: no burst until the gift has arrived.
  const age=time-selectedAt-CHOICE_CENTER_DURATION-particle.delay;
  if(age<0||age>7.5)continue;
  tiles.push({x:2000+particle.vx*age-particle.size/2,y:1350+particle.vy*age+240*age*age,
   size:particle.size,angle:particle.phase+(reduced?0:particle.spin*age),alpha:1-ease((age-5.5)/2),
   photoIndex:particle.photoIndex,kind:'choice-confetti'});
 }
 tiles.push(...cursorPhotoTiles(pointer,layout.photoCount));
 return {tiles:orderPhotoLayers(tiles),labels:[],actions,stage:!ready?'unpacking':selected?'selected':'options'};
}

export function hitChoiceAction(actions,x,y){
 for(let i=actions.length-1;i>=0;i--){const a=actions[i];if(x>=a.x&&x<=a.x+a.w&&y>=a.y&&y<=a.y+a.h)return a;}
 return null;
}
