import { MINI_DURATION, miniTimeline, movePortraitPoint, buildGiftScene, giftPhotoGeometry } from './mini-animation.js';
const $ = s => document.querySelector(s);
const canvas = $('#board'), ctx = canvas.getContext('2d', {alpha:false});
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let data, atlas, portrait, portraitDestinations=[], width, height, dpr, columns=40, rows=20, fitScale=1;
let camera={x:0,y:0,scale:1}, mode='heart';
let brightness=[], target=[], animation=0, lastTime=0, selectedIndex=0;
let heartFrames=[], distances=[], started=performance.now();
const TILE=100, GAP=5, originals=new Map(), pending=new Set(), visibleOriginals=new Set(), failed=new Set();
let activeLoads=0, loadQueue=[];
let backdrop, cameraMotion=null, hoverIndex=-1, hoverOpacity=0;
let greetingCards=[], storyTime=0, greetingCycle=0, lastGreetingLabel=-1;
let greetingsStarted=false, greetingTime=7.8, heartReturn=1.1;
let miniLayout=null, giftScene=null;
let pausedScene=null, frameTiles=[], skipHold=null;
const isExploring=()=>mode==='explore'||mode==='paused';
const heartPath=new Path2D('M0 .99 C-.22 .77 -1.15 .15 -1.02 -.48 C-.92 -1.13 -.22 -1.12 0 -.63 C.22 -1.12 .92 -1.13 1.02 -.48 C1.15 .15 .22 .77 0 .99Z');
const greetings=[
 {text:'Happy Birthday!',font:'BirthdayPlayful',mobile:['Happy','Birthday!']},
 {text:'С днём рождения!',font:'BirthdayRounded',mobile:['С днём','рождения!']},
 {text:'生日快乐！',font:'BirthdayChinese',mobile:['生日快乐！']},
 {text:'Heri ya siku ya kuzaliwa!',font:'BirthdayPlayful',mobile:['Heri ya siku','ya kuzaliwa!']},
 {text:'Alles Gute zum Geburtstag!',font:'BirthdayPlayful',mobile:['Alles Gute','zum Geburtstag!']}
];
function invalidate(){if(!animation) animation=requestAnimationFrame(draw);}
function fit(animate=false){
 const previous={...camera};
 if(mode==='paused'&&pausedScene){
  const bounds=sceneBounds(pausedScene.tiles);
  const scale=Math.min((width-50)/bounds.w,(height-145)/bounds.h);
  camera={scale,x:(width-bounds.w*scale)/2-bounds.x*scale,y:(height-70-bounds.h*scale)/2-bounds.y*scale};
  if(animate)glideCamera(previous);
  updateZoom();invalidate();return;
 }
 const top=mode==='explore'?65:35, bottom=95;
 fitScale=Math.min((width-40)/(columns*TILE),(height-top-bottom)/(rows*TILE));
 fitScale=Math.max(.02,fitScale);
 camera={scale:fitScale,x:(width-columns*TILE*fitScale)/2,y:top+(height-top-bottom-rows*TILE*fitScale)/2};
 if(animate) glideCamera(previous);
 updateZoom();invalidate();
}
function resize(){
 width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 backdrop=ctx.createRadialGradient(width*.5,height*.43,0,width*.5,height*.5,Math.max(width,height)*.72);
 backdrop.addColorStop(0,'#fff2f6');backdrop.addColorStop(.55,'#f5dce5');backdrop.addColorStop(1,'#e9bbcf');
 cameraMotion=null;
 if(mode!=='paused')columns=width<650?25:40;rows=Math.ceil((data?.photos.length||795)/columns);
 fit();if(data&&mode!=='paused'){setMask(true);if(atlas?.complete&&atlas.naturalWidth){prepareGreetings();preparePortraitLayout();}}
}
function setMask(instant=false){
 const mask=document.createElement('canvas');mask.width=columns*12;mask.height=rows*12;
 const m=mask.getContext('2d',{willReadFrequently:true});
 const base=Math.min(mask.width/2.75,mask.height/2.75);
 heartFrames=[];distances=[];
 for(let frame=0;frame<24;frame++){
  m.clearRect(0,0,mask.width,mask.height);m.fillStyle='#fff';
  const s=base*(.94+frame/23*.115);
  m.save();m.translate(mask.width/2,mask.height/2-s*.04);m.scale(s,s);
  m.fill(heartPath);m.restore();
  const pixels=m.getImageData(0,0,mask.width,mask.height).data, values=[];
  for(let i=0;i<data.photos.length;i++){
   let sum=0;const col=i%columns,row=Math.floor(i/columns);
   for(let y=2;y<11;y+=2)for(let x=2;x<11;x+=2)sum+=pixels[((row*12+y)*mask.width+col*12+x)*4+3]/255;
   values.push(Math.min(1,sum/25*1.2));
   if(frame===0){
    const dx=((col+.5)*12-mask.width/2)/base,dy=((row+.5)*12-mask.height/2)/base+.04;
    let lo=.001,hi=8;
    for(let step=0;step<15;step++){const mid=(lo+hi)/2;if(m.isPointInPath(heartPath,dx/mid,dy/mid))hi=mid;else lo=mid;}
    distances.push((lo+hi)/2);
   }
  }
  heartFrames.push(values);
 }
 target=data.photos.map((_,i)=>mode==='explore'?1:.07+.78*heartFrames[0][i]);
 if(instant||reduced||!brightness.length)brightness=[...target];
 invalidate();
}
function heartbeat(t){
 const phase=t%2.2;
 return Math.exp(-Math.pow((phase-.18)/.10,2))+.62*Math.exp(-Math.pow((phase-.46)/.13,2));
}
function waveAt(distance,t){
 let wave=0;
 for(const delay of [.22,.50]){
  const age=((t-delay)%2.2+2.2)%2.2;
  const radius=1.02+age*1.15;
  wave+=Math.exp(-Math.pow((distance-radius)/.085,2))*Math.exp(-age*.95)*(delay===.22?.38:.20);
 }
 return wave;
}
function prepareGreetings(){
 const portraitElapsed=greetingsStarted&&greetingCycle>0&&greetingTime>=greetingCycle?greetingTime-greetingCycle:null;
 const mask=document.createElement('canvas'), m=mask.getContext('2d',{willReadFrequently:true});
 greetingCards=greetings.map(g=>{
  const glyphs=[];let pen=0;
  const letterHeight=g.font==='BirthdayChinese'
   ? Math.min(rows*.76,columns*.64)
   : Math.min(rows*.56,columns*.44);
  for(const char of g.text){
   if(char===' '){pen+=letterHeight*.32;continue;}
   m.font=`700 96px ${g.font}`;
   const metrics=m.measureText(char);
   const inkWidth=Math.max(1,Math.ceil(metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight));
   const inkHeight=Math.max(1,Math.ceil(metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent));
   const h=char==='!'||char==='！'?letterHeight*.94:letterHeight;
   const w=h*inkWidth/inkHeight;
   mask.width=Math.max(8,Math.ceil(w*8));mask.height=Math.ceil(h*8);
   m.setTransform(mask.width/inkWidth,0,0,mask.height/inkHeight,0,0);
   m.font=`700 96px ${g.font}`;m.fillStyle='#fff';
   m.fillText(char,metrics.actualBoundingBoxLeft,metrics.actualBoundingBoxAscent);
   const pixels=m.getImageData(0,0,mask.width,mask.height).data;
   const alpha=new Uint8Array(mask.width*mask.height);
   for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
   glyphs.push({x:pen,w,h,alpha,mw:mask.width,mh:mask.height,order:glyphs.length});
   pen+=w+Math.max(1.2,letterHeight*.12);
  }
  // Constant screen-relative speed keeps long greetings readable without shrinking letters.
  const speed=columns*.43;
  return {...g,glyphs,width:pen,height:letterHeight,duration:(columns+pen)/speed};
 });
 greetingCycle=8.8+greetingCards.reduce((sum,card)=>sum+card.duration,0);
 if(portraitElapsed!==null)greetingTime=greetingCycle+portraitElapsed;
}
function greetingAt(t){
 if(!greetingCards.length||t>=greetingCycle)return null;
 let phase=t;
 if(phase<8.8)return null;
 phase-=8.8;
 for(let index=0;index<greetingCards.length;index++){
  if(phase<greetingCards[index].duration)return {index,local:phase};
  phase-=greetingCards[index].duration;
 }
 return null;
}
function smoothFade(value){
 const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);
}
function heartVisibility(t){
 if(t>=greetingCycle)return 0;
 const phase=t;
 if(phase>=8.8)return 0;
 return smoothFade(phase/1.05)*(1-smoothFade((phase-7.8)/1));
}
function updateGreeting(greeting){
 const card=greetingCards[greeting.index];
 const x=columns-(columns+card.width)*(greeting.local/card.duration);
 target.fill(.04);
 for(const glyph of card.glyphs){
  const bounce=glyph.order%3!==1?Math.pow(Math.max(0,Math.sin(greeting.local*5.5-glyph.order*.78)),2)*rows*.07:0;
  const gx=x+glyph.x,gy=(rows-glyph.h)/2+rows*.035-bounce;
  if(gx+glyph.w<0||gx>columns)continue;
  const x0=Math.max(0,Math.floor(gx)),x1=Math.min(columns,Math.ceil(gx+glyph.w));
  const y0=Math.max(0,Math.floor(gy)),y1=Math.min(rows,Math.ceil(gy+glyph.h));
  for(let row=y0;row<y1;row++)for(let col=x0;col<x1;col++){
   let coverage=0;
   for(const sy of [.2,.5,.8])for(const sx of [.2,.5,.8]){
    const mx=Math.floor((col+sx-gx)/glyph.w*glyph.mw),my=Math.floor((row+sy-gy)/glyph.h*glyph.mh);
    if(mx>=0&&mx<glyph.mw&&my>=0&&my<glyph.mh)coverage+=glyph.alpha[my*glyph.mw+mx]/255;
   }
   const i=row*columns+col;
   if(i<target.length)target[i]=Math.max(target[i],.04+.96*Math.min(1,coverage/9*1.65));
  }
 }
 if(lastGreetingLabel!==greeting.index){
  canvas.setAttribute('aria-label',card.text+' — надпись яркостью фотографий');lastGreetingLabel=greeting.index;
 }
}
function preparePortraitLayout(){
 if(!portrait)return;
 const finalScale=fitScale*.48;
 const portraitHeight=Math.min((height-145)*.86/finalScale,(width-55)*.84/(finalScale*portrait.aspect));
 const portraitWidth=portraitHeight*portrait.aspect;
 const [cropX,cropY,cropRight,cropBottom]=portrait.source.crop;
 const imageWidth=1086,imageHeight=1448;
 const toPoint=(u,v)=>[(u*imageWidth-cropX)/(cropRight-cropX),(v*imageHeight-cropY)/(cropBottom-cropY)];
 const leftEye=toPoint(.545,.425),rightEye=toPoint(.756,.500),mouth=toPoint(.552,.654);
 const cx=columns*TILE/2,cy=rows*TILE/2;
 miniLayout={cx,cy,portraitHeight,portraitWidth,worldScale:finalScale,
  viewportWidth:width,viewportHeight:height,mouthY:cy+(mouth[1]-.5)*portraitHeight};
 portraitDestinations=portrait.layouts[String(columns)].map(pointIndex=>{
  const point=portrait.points[pointIndex],region=portrait.pointRegions[pointIndex];
  const eye=region==='left_eye'||region==='right_eye';
  const eyeCenter=region==='left_eye'?leftEye:rightEye;
  const pupil=eye&&((point[0]-eyeCenter[0])/.032)**2+((point[1]-eyeCenter[1])/.026)**2<1;
  return {x:cx+(point[0]-.5)*portraitWidth,y:cy+(point[1]-.5)*portraitHeight,
   size:portraitHeight*portrait.tileSizes[pointIndex],region,eye,pupil,
   eyeY:cy+(eyeCenter[1]-.5)*portraitHeight};
 });
 giftScene=buildGiftScene(miniLayout,data.photos.length);
}
function portraitGeometry(i,elapsed){
 const destination=movePortraitPoint(portraitDestinations[i],elapsed,miniLayout);
 const progress=reduced?1:smoothFade((elapsed-.75-(i%19)*.021)/3.5);
 const sourceIndex=i%data.photos.length;
 const sx=(sourceIndex%columns+.5)*TILE,sy=(Math.floor(sourceIndex/columns)+.5)*TILE;
 const arc=Math.sin(progress*Math.PI)*(i%2?1:-1)*TILE*.8;
 const worldSize=TILE-GAP+(destination.size-(TILE-GAP))*progress;
 return {x:camera.x+(sx+(destination.x-sx)*progress+arc-worldSize/2)*camera.scale,
  y:camera.y+(sy+(destination.y-sy)*progress-worldSize/2)*camera.scale,
  size:worldSize*camera.scale};
}
function loadOriginal(i){
 if(originals.has(i)||pending.has(i)||failed.has(i))return;
 pending.add(i);loadQueue.push(i);pump();
}
function pump(){
 while(activeLoads<4&&loadQueue.length){
  const i=loadQueue.shift();
  if(!visibleOriginals.has(i)){pending.delete(i);continue;}
  activeLoads++;
  const img=new Image();img.decoding='async';
  img.onload=()=>{originals.set(i,img);finish();invalidate();};
  img.onerror=()=>{failed.add(i);finish();};
  function finish(){activeLoads--;pending.delete(i);pump();}
  img.src='./photos/'+encodeURIComponent(data.photos[i].file);
 }
}
function draw(time){
 animation=0;const dt=Math.min(64,time-(lastTime||time));lastTime=time;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.fillStyle=backdrop||'#f5dce5';ctx.fillRect(0,0,width,height);
 if(!atlas?.complete||!atlas.naturalWidth||!heartFrames.length)return;
 let changing=false;visibleOriginals.clear();
 if(cameraMotion){
  const progress=Math.min(1,(time-cameraMotion.start)/350), eased=1-Math.pow(1-progress,3);
  for(const key of ['x','y','scale'])camera[key]=cameraMotion.from[key]+(cameraMotion.to[key]-cameraMotion.from[key])*eased;
  if(progress===1)cameraMotion=null;else changing=true;
  updateZoom();
 }
 if(mode==='heart'&&!document.hidden){
  storyTime+=dt/1000;
  if(greetingsStarted)greetingTime+=dt/1000;
  else heartReturn=Math.min(1.1,heartReturn+dt/1000);
  if(greetingsStarted&&greetingTime>=greetingCycle+MINI_DURATION){
   greetingsStarted=false;greetingTime=7.8;storyTime=0;heartReturn=0;
   brightness.fill(.04);lastGreetingLabel=-1;
  }
 }
 const portraitScene=mode==='heart'&&greetingsStarted&&portrait&&greetingTime>=greetingCycle;
 const portraitElapsed=portraitScene?greetingTime-greetingCycle:0;
 const miniState=portraitScene?miniTimeline(portraitElapsed):null;
 const extras=portraitScene?giftPhotoGeometry(giftScene,portraitElapsed):[];
 const greeting=mode==='heart'&&greetingsStarted&&!reduced&&!portraitScene?greetingAt(greetingTime):null;
 if(mode==='heart'&&!cameraMotion){
  const phase=greetingTime;
  const textView=!greetingsStarted||reduced?0:phase>=8.8?1:
   Math.max(1-smoothFade(phase/1.05),smoothFade((phase-7.8)/1));
  const zoomOut=portraitScene?smoothFade(portraitElapsed/1.3):0;
  const desiredScale=fitScale*((1-.13*textView)*(1-zoomOut)+.48*zoomOut);
  const desired={scale:desiredScale,x:(width-columns*TILE*desiredScale)/2,y:(height-60-rows*TILE*desiredScale)/2};
  const easing=reduced?1:1-Math.exp(-dt/180);
  for(const key of ['x','y','scale']){
   const delta=desired[key]-camera[key];camera[key]+=delta*easing;
   if(Math.abs(delta)>.0001)changing=true;
  }
 }
 const size=TILE*camera.scale,gap=Math.max(.65,GAP*camera.scale);
 const t=storyTime, beat=reduced?0:Math.min(1,heartbeat(t));
 const frame=beat*23, low=Math.floor(frame), high=Math.min(23,low+1), mix=frame-low;
 if(greeting){
  updateGreeting(greeting);
  const duration=greetingCards[greeting.index].duration;
  const visibility=smoothFade(greeting.local/.7)*smoothFade((duration-greeting.local)/.7);
  for(let i=0;i<target.length;i++)target[i]=.04+(target[i]-.04)*visibility;
 }
 const heartGain=greetingsStarted&&!reduced?heartVisibility(greetingTime):smoothFade(heartReturn/1.1);
 const smoothing=1-Math.exp(-dt/(mode==='heart'?55:290));
 const tileCount=portraitScene?portrait.count+extras.length:mode==='paused'?pausedScene.tiles.length:data.photos.length;
 frameTiles.length=tileCount;
 for(let i=0;i<tileCount;i++){
  const extra=portraitScene&&i>=portrait.count?extras[i-portrait.count]:null;
  const photoIndex=mode==='paused'?pausedScene.tiles[i].photoIndex:extra?extra.photoIndex:i%data.photos.length;
  if(portraitScene){
   target[photoIndex]=(.04+.94*smoothFade(portraitElapsed/1.2))*miniState.fade;
  }else if(mode==='heart'&&!greeting){
   const heart=heartFrames[low][i]*(1-mix)+heartFrames[high][i]*mix;
   const wave=reduced?0:waveAt(distances[i],t);
   target[photoIndex]=.04+heartGain*(Math.min(1,.065+heart*(.70+.23*beat)+(1-heart)*wave)-.04);
  }
  if(mode!=='paused'&&i<data.photos.length){
   const diff=target[photoIndex]-brightness[photoIndex];
   if(Math.abs(diff)>.002){brightness[photoIndex]+=diff*smoothing;changing=true;}else brightness[photoIndex]=target[photoIndex];
  }
  const frozen=mode==='paused'?pausedScene.tiles[i]:null;
  const geometry=frozen?{x:camera.x+frozen.x*camera.scale,y:camera.y+frozen.y*camera.scale,size:frozen.size*camera.scale}:extra?{x:camera.x+extra.x*camera.scale,y:camera.y+extra.y*camera.scale,size:extra.size*camera.scale}:portraitScene?portraitGeometry(i,portraitElapsed):
   {x:camera.x+(i%columns)*size,y:camera.y+Math.floor(i/columns)*size,size:size-gap};
  const {x,y,size:drawSize}=geometry;
  const alpha=frozen?frozen.alpha:extra?extra.alpha:brightness[photoIndex];
  const angle=frozen?frozen.angle||0:extra?extra.angle||0:0;
  const tint=frozen?frozen.tint:extra?.tint;
  const kind=frozen?frozen.kind:extra?extra.kind:portraitScene?'portrait':'grid';
  frameTiles[i]={x:(x-camera.x)/camera.scale,y:(y-camera.y)/camera.scale,size:drawSize/camera.scale,alpha,photoIndex,angle,tint,kind};
  if(x+drawSize*1.5<0||y+drawSize*1.5<0||x-drawSize*.5>width||y-drawSize*.5>height||alpha<.002)continue;
  ctx.save();ctx.globalAlpha=alpha;
  ctx.translate(x+drawSize/2,y+drawSize/2);ctx.rotate(angle);
  const original=isExploring()&&drawSize>110?originals.get(photoIndex):null;
  if(original){const crop=Math.min(original.naturalWidth,original.naturalHeight);ctx.drawImage(original,(original.naturalWidth-crop)/2,(original.naturalHeight-crop)/2,crop,crop,-drawSize/2,-drawSize/2,drawSize,drawSize);}
  else {const source=data.photos[photoIndex].atlasIndex;ctx.drawImage(atlas,(source%data.columns)*data.cell,Math.floor(source/data.columns)*data.cell,data.cell,data.cell,-drawSize/2,-drawSize/2,drawSize,drawSize);}
  if(tint){ctx.fillStyle=tint==='ribbon'?'#e598b884':'#49283775';ctx.fillRect(-drawSize/2,-drawSize/2,drawSize,drawSize);}
  ctx.restore();
  if(isExploring()&&drawSize>110){visibleOriginals.add(photoIndex);loadOriginal(photoIndex);}
 }
 if(portraitScene&&lastGreetingLabel!==miniState.stage){canvas.setAttribute('aria-label',`Портрет и подарок: ${miniState.stage}`);lastGreetingLabel=miniState.stage;}
 if(!portraitScene&&!greeting&&mode==='heart'&&lastGreetingLabel!==-2){canvas.setAttribute('aria-label','Пульсирующее сердце из наших фотографий');lastGreetingLabel=-2;}
 const hoverTarget=isExploring()&&hoverIndex>=0?1:0;
 hoverOpacity+=(hoverTarget-hoverOpacity)*(reduced?1:1-Math.exp(-dt/95));
 if(Math.abs(hoverTarget-hoverOpacity)>.005)changing=true;
 if(hoverIndex>=0&&hoverOpacity>.01){
  const tile=frameTiles[hoverIndex];
  const x=camera.x+tile.x*camera.scale,y=camera.y+tile.y*camera.scale,edge=tile.size*camera.scale;
  ctx.save();ctx.globalAlpha=hoverOpacity;ctx.strokeStyle='#fff4fa';ctx.lineWidth=2;
  ctx.translate(x+edge/2,y+edge/2);ctx.rotate(tile.angle||0);
  ctx.strokeRect(-edge/2-1,-edge/2-1,edge+2,edge+2);ctx.restore();
 }
 for(const i of originals.keys()){if(originals.size<=48)break;if(!visibleOriginals.has(i))originals.delete(i);}
 ctx.globalAlpha=1;
 if(changing||(mode==='heart'&&!document.hidden&&(!reduced||greetingsStarted)))invalidate();
}
function sceneBounds(tiles){
 const boxes=tiles.map(tile=>{
  const angle=tile.angle||0,padding=tile.size*(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle))-1)/2;
  return {x:tile.x-padding,y:tile.y-padding,size:tile.size+padding*2};
 });
 const x=Math.min(...boxes.map(p=>p.x)),y=Math.min(...boxes.map(p=>p.y));
 return {x,y,w:Math.max(...boxes.map(p=>p.x+p.size))-x,h:Math.max(...boxes.map(p=>p.y+p.size))-y};
}
function syncExploreUI(){
 const active=isExploring();
 document.body.classList.toggle('exploring',active);
 $('#explore-controls').hidden=!active;$('#explore-hint').hidden=!active;$('#explore').hidden=active;
 $('#explore-hint').textContent=mode==='paused'
  ? 'Пауза · Исследуй сцену · Пробел — продолжить'
  : 'Перетаскивай доску · Приближай колёсиком или двумя пальцами · Нажми на фото';
 $('#fit').textContent=mode==='paused'?'Вся сцена':'Вся доска';
}
function pauseScene(){
 if(mode!=='heart'||!frameTiles.length)return;
 cancelSkip();
 pausedScene={tiles:frameTiles.map(tile=>({...tile})),camera:{...camera}};
 cameraMotion=null;mode='paused';hoverIndex=-1;pointers.clear();gesture=null;
 syncExploreUI();lastTime=0;invalidate();
}
function resumeScene(){
 if(mode!=='paused')return;
 if(viewer.open){++photoRequest;clearTimeout(closeTimer);viewer.classList.remove('is-visible');viewer.close();closing=false;}
 const previous={...camera},saved=pausedScene.camera;
 mode='heart';camera={...saved};pausedScene=null;hoverIndex=-1;pointers.clear();gesture=null;
 glideCamera(previous);syncExploreUI();lastTime=0;invalidate();
}
function hitPhoto(x,y){
 const wx=(x-camera.x)/camera.scale,wy=(y-camera.y)/camera.scale;
 // Last painted photo wins where portrait tiles overlap.
 for(let i=frameTiles.length-1;i>=0;i--){
  const tile=frameTiles[i];
  if(tile.alpha<.002)continue;
  const dx=wx-tile.x-tile.size/2,dy=wy-tile.y-tile.size/2;
  const angle=tile.angle||0,tx=dx*Math.cos(angle)+dy*Math.sin(angle),ty=-dx*Math.sin(angle)+dy*Math.cos(angle);
  if(Math.abs(tx)<=tile.size/2&&Math.abs(ty)<=tile.size/2)return i;
 }
 return -1;
}
function cancelSkip(){
 if(skipHold)clearTimeout(skipHold.timer);
 skipHold=null;$('#skip-hold').hidden=true;
}
function startSkip(e){
 if(mode!=='heart'||e.button!==0||e.pointerType!=='mouse'||!portrait||!greetingCards.length)return;
 if(greetingsStarted&&greetingTime>=greetingCycle)return;
 cancelSkip();
 const timer=setTimeout(()=>{
  skipHold=null;$('#skip-hold').hidden=true;
  greetingsStarted=true;greetingTime=greetingCycle;lastTime=0;invalidate();
 },1100);
 skipHold={timer,x:e.clientX,y:e.clientY};
 const indicator=$('#skip-hold');indicator.style.left=e.clientX+'px';indicator.style.top=e.clientY+'px';indicator.hidden=false;
}
function setMode(next){
 cancelSkip();
 if(next==='heart'&&isExploring()){
  greetingsStarted=false;
  greetingTime=7.8;
  storyTime=0;heartReturn=1.1;
  lastTime=0;
  lastGreetingLabel=-1;
 }
 pausedScene=null;mode=next;syncExploreUI();
 hoverIndex=-1;fit(true);
 target=data.photos.map((_,i)=>next==='explore'?1:.065+.7*heartFrames[0][i]);
 invalidate();
}
function updateZoom(){$('#zoom-value').textContent=Math.round(camera.scale/fitScale*100)+'%';}
function glideCamera(previous){
 if(reduced)return;
 cameraMotion={from:previous,to:{...camera},start:performance.now()};camera={...previous};invalidate();
}
function zoom(factor,x=width/2,y=height/2,smooth=true){
 const previous={...camera};
 if(smooth&&cameraMotion)camera={...cameraMotion.to};
 cameraMotion=null;
 const minimum=mode==='paused'?Math.min(fitScale*.3,pausedScene.camera.scale*.6):fitScale*.8;
 const next=Math.max(minimum,Math.min(fitScale*(mode==='paused'?60:24),camera.scale*factor));
 camera.x=x-(x-camera.x)*next/camera.scale;camera.y=y-(y-camera.y)*next/camera.scale;camera.scale=next;
 constrain();if(smooth)glideCamera(previous);updateZoom();invalidate();
}
function constrain(){
 const margin=80;
 if(mode==='paused'){
  const b=sceneBounds(pausedScene.tiles);
  camera.x=Math.min(width-margin-b.x*camera.scale,Math.max(margin-(b.x+b.w)*camera.scale,camera.x));
  camera.y=Math.min(height-margin-b.y*camera.scale,Math.max(margin-(b.y+b.h)*camera.scale,camera.y));
  return;
 }
 camera.x=Math.min(width-margin,Math.max(margin-columns*TILE*camera.scale,camera.x));
 camera.y=Math.min(height-margin,Math.max(margin-rows*TILE*camera.scale,camera.y));
}
$('#explore').onclick=()=>setMode('explore');
$('#back').onclick=()=>setMode('heart');
$('#fit').onclick=()=>fit(true);$('#zoom-in').onclick=()=>zoom(1.5);$('#zoom-out').onclick=()=>zoom(1/1.5);
canvas.addEventListener('wheel',e=>{if(!isExploring())return;e.preventDefault();zoom(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
const pointers=new Map();let gesture=null,moved=false,down=null;
function pinch(){const p=[...pointers.values()];return p.length<2?null:{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};}
canvas.addEventListener('pointerdown',e=>{
 if(mode==='heart'){startSkip(e);return;}
 if(!isExploring()||(e.pointerType==='mouse'&&e.button!==0))return;
 cameraMotion=null;
 canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){moved=false;down={x:e.clientX,y:e.clientY};}else moved=true;
 gesture=pinch();
});
canvas.addEventListener('pointermove',e=>{
 if(skipHold&&Math.hypot(e.clientX-skipHold.x,e.clientY-skipHold.y)>10)cancelSkip();
 if(isExploring()&&!pointers.size){hoverIndex=hitPhoto(e.clientX,e.clientY);invalidate();}
 if(!pointers.has(e.pointerId))return;
 const old=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)moved=true;
 const next=pinch();
 if(next&&gesture){zoom(next.d/Math.max(1,gesture.d),gesture.x,gesture.y,false);camera.x+=next.x-gesture.x;camera.y+=next.y-gesture.y;gesture=next;}
 else{camera.x+=e.clientX-old.x;camera.y+=e.clientY-old.y;}
 constrain();invalidate();
});
canvas.addEventListener('pointerup',e=>{
 cancelSkip();
 if(!pointers.has(e.pointerId))return;
 pointers.delete(e.pointerId);gesture=pinch();
 if(!moved&&pointers.size===0){
  const i=hitPhoto(e.clientX,e.clientY);if(i>=0)openPhoto(frameTiles[i].photoIndex);
 }
});
canvas.addEventListener('pointerleave',()=>{cancelSkip();hoverIndex=-1;invalidate();});
canvas.addEventListener('pointercancel',e=>{cancelSkip();pointers.delete(e.pointerId);gesture=null;moved=true;});
let photoRequest=0, closeTimer, closing=false;
const viewer=$('#viewer'), photoStage=$('.photo-stage');
async function openPhoto(i,direction=0){
 const request=++photoRequest;
 selectedIndex=(i+data.photos.length)%data.photos.length;
 const index=selectedIndex;
 clearTimeout(closeTimer);closing=false;
 if(!viewer.open){
  $('#full-photo').classList.remove('ready');
  viewer.showModal();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(viewer.open&&!closing)viewer.classList.add('is-visible');}));
 }
 $('#photo-position').textContent=`${String(index+1).padStart(3,'0')} / ${data.photos.length}`;
 $('#photo-position').classList.add('loading');
 const incoming=new Image();incoming.decoding='async';
 incoming.src='./photos/'+encodeURIComponent(data.photos[index].file);
 try{await incoming.decode();}catch{
  if(request===photoRequest){$('#photo-position').textContent='Фото не загрузилось — попробуй другое';$('#photo-position').classList.remove('loading');}
  return;
 }
 if(request!==photoRequest||closing||!viewer.open)return;
 const img=$('#full-photo');
 photoStage.querySelectorAll('.outgoing-photo').forEach(el=>el.remove());
 img.getAnimations().forEach(animation=>animation.cancel());
 if(img.classList.contains('ready')&&!reduced){
  const outgoing=img.cloneNode();outgoing.removeAttribute('id');outgoing.className='outgoing-photo';outgoing.alt='';
  photoStage.append(outgoing);
  const leave=outgoing.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*24}px)`}],{duration:240,easing:'ease-out',fill:'forwards'});
  leave.finished.then(()=>outgoing.remove()).catch(()=>outgoing.remove());
 }
 img.src=incoming.src;img.alt=`Наше воспоминание ${index+1}`;img.classList.add('ready');
 if(!reduced)img.animate([{opacity:0,transform:`translateX(${direction*24}px) scale(.985)`},{opacity:1,transform:'translateX(0) scale(1)'}],{duration:320,easing:'cubic-bezier(.22,1,.36,1)'});
 $('#photo-position').classList.remove('loading');
}
function closePhoto(){
 if(closing||!viewer.open)return;
 closing=true;++photoRequest;viewer.classList.remove('is-visible');
 closeTimer=setTimeout(()=>{viewer.close();closing=false;},reduced?0:300);
}
$('#close-viewer').onclick=closePhoto;
$('#prev').onclick=()=>openPhoto(selectedIndex-1,-1);$('#next').onclick=()=>openPhoto(selectedIndex+1,1);
viewer.addEventListener('cancel',e=>{e.preventDefault();closePhoto();});
viewer.addEventListener('click',e=>{if(e.target===viewer){const r=viewer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePhoto();}});
addEventListener('keydown',e=>{
 if(e.code==='Space'||e.key===' '){
  e.preventDefault();if(e.repeat)return;
  if(mode==='paused')resumeScene();else if(mode==='heart')pauseScene();
  return;
 }
 if(mode==='heart'&&!viewer.open&&!greetingsStarted){
  greetingsStarted=true;greetingTime=7.8;lastTime=0;invalidate();
  e.preventDefault();return;
 }
 if(viewer.open){if(e.key==='ArrowLeft'){e.preventDefault();openPhoto(selectedIndex-1,-1);}if(e.key==='ArrowRight'){e.preventDefault();openPhoto(selectedIndex+1,1);}return;}
 if(!isExploring())return;
 if(e.key==='Escape')setMode('heart');
 if(e.key==='+'||e.key==='=')zoom(1.4);if(e.key==='-')zoom(1/1.4);
 if(e.key.startsWith('Arrow')){e.preventDefault();camera.x+=e.key==='ArrowLeft'?70:e.key==='ArrowRight'?-70:0;camera.y+=e.key==='ArrowUp'?70:e.key==='ArrowDown'?-70:0;constrain();invalidate();}
});
addEventListener('pointerup',cancelSkip);
addEventListener('blur',cancelSkip);
addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{cancelSkip();if(!document.hidden){lastTime=0;invalidate();}});
resize();
try{
 const [response,portraitResponse]=await Promise.all([fetch('./assets/photos.json'),fetch('./assets/portrait.json')]);
 if(!response.ok||!portraitResponse.ok)throw Error('manifest');
 [data,portrait]=await Promise.all([response.json(),portraitResponse.json()]);
 if((portrait.sourceCount||portrait.count)!==data.photos.length)throw Error('Portrait source photo count does not match');
 data.photos.forEach((photo,i)=>photo.atlasIndex=i);
 // A fixed shuffle keeps photos in place when returning from exploration or refreshing.
 let seed=20260909;
 const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
 for(let i=data.photos.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[data.photos[i],data.photos[j]]=[data.photos[j],data.photos[i]];}
 atlas=new Image();atlas.src='./assets/atlas.webp';await atlas.decode();
 await Promise.all([document.fonts.load('700 48px BirthdayPlayful'),document.fonts.load('700 48px BirthdayRounded'),document.fonts.load('700 48px BirthdayChinese')]);
 $('#explore').disabled=false;started=performance.now();resize();
 if(new URLSearchParams(location.search).get('scene')==='portrait'){greetingsStarted=true;greetingTime=greetingCycle;invalidate();}
}catch(error){$('#error').hidden=false;console.error(error);}

function playbackState(){return {mode,greetingsStarted,greetingTime,greetingCycle,storyTime,camera:{...camera},tiles:frameTiles.map(tile=>({...tile})),pausedCamera:pausedScene?.camera,mini:greetingsStarted&&greetingTime>=greetingCycle?miniTimeline(greetingTime-greetingCycle):null,featureCounts:{pupils:portraitDestinations.filter(p=>p.pupil).length,eyePoints:portraitDestinations.filter(p=>p.eye).length}};}
export { greetingAt, greetingCards, portraitGeometry, playbackState };
