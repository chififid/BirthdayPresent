"""Numerical and interaction checks only. Never captures screenshots."""
import json,time,urllib.request,websocket
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=json.loads((root/'site/assets/portrait.json').read_text())
assert p['count']==len(p['points'])==len(p['tileSizes'])==1600
assert p['sourceCount']==800 and p['copiesPerPhoto']==2
assert len(set(map(tuple,p['points'])))==1600
for layout in p['layouts'].values():assert sorted(layout)==list(range(1600))
assert all(0<=x<=1 and 0<=y<=1 for x,y in p['points'])
pages=json.load(urllib.request.urlopen('http://127.0.0.1:9341/json/list'))
w=websocket.create_connection(pages[0]['webSocketDebuggerUrl'],suppress_origin=True)
n=0;errors=[]
def send(method,params={}):
 global n
 n+=1;req=n;w.send(json.dumps({'id':req,'method':method,'params':params}))
 while True:
  result=json.loads(w.recv())
  if result.get('method')=='Runtime.exceptionThrown':errors.append(result['params'])
  if result.get('id')==req:return result.get('result',{})
def js(expression):
 result=send('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True})
 assert 'exceptionDetails' not in result,result
 return result['result'].get('value')
send('Page.navigate',{'url':'about:blank'});time.sleep(.2);send('Runtime.enable')
for width,height in [(1440,960),(390,844)]:
 send('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':width<650})
 send('Page.navigate',{'url':'http://127.0.0.1:4180/?scene=portrait'})
 for _ in range(100):
  if js("document.querySelector('#explore')?.disabled===false"):break
  time.sleep(.1)
 time.sleep(5.5)
 result=js("(async()=>{const m=await import('/app.js');const p=Array.from({length:1600},(_,i)=>m.portraitGeometry(i,6));return {finite:p.every(a=>Object.values(a).every(Number.isFinite)),minX:Math.min(...p.map(a=>a.x)),minY:Math.min(...p.map(a=>a.y)),maxX:Math.max(...p.map(a=>a.x+a.size)),maxY:Math.max(...p.map(a=>a.y+a.size)),minSize:Math.min(...p.map(a=>a.size)),count:p.length,label:document.querySelector('canvas').getAttribute('aria-label')}})()")
 assert result['finite'] and result['count']==1600 and result['minSize']>0,result
 assert result['minX']>=0 and result['maxX']<=width and result['minY']>=0 and result['maxY']<=height,result
 assert 'портрет' in result['label'],result
 copies=js("import('/app.js').then(m=>{const n={};for(const t of m.playbackState().tiles)n[t.photoIndex]=(n[t.photoIndex]||0)+1;return Object.values(n)})")
 assert len(copies)==800 and all(n==2 for n in copies)
 js("document.querySelector('#explore').click()")
 time.sleep(.5)
 assert js("!document.querySelector('#explore-controls').hidden")
 js("document.querySelector('#back').click()")
 time.sleep(.6)
 assert 'сердце' in js("document.querySelector('canvas').getAttribute('aria-label')")
 print(json.dumps({'viewport':[width,height],**result},ensure_ascii=False),flush=True)
assert not errors,errors
print('1600 unique destinations, bounds, reset and runtime checks passed. No screenshots.')
w.close()
