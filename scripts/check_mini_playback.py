"""Browser state/interaction validation. No screenshots or visual inspection."""
import json,time,urllib.request,websocket
pages=json.load(urllib.request.urlopen('http://127.0.0.1:9341/json/list'))
w=websocket.create_connection(pages[0]['webSocketDebuggerUrl'],suppress_origin=True)
n=0;errors=[]
def send(method,params={}):
 global n
 n+=1;req=n;w.send(json.dumps({'id':req,'method':method,'params':params}))
 while True:
  r=json.loads(w.recv())
  if r.get('method')=='Runtime.exceptionThrown':errors.append(r['params'])
  if r.get('id')==req:return r.get('result',{})
def js(expression):
 r=send('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True})
 assert 'exceptionDetails' not in r,r
 return r['result'].get('value')
def state():return js("import('/app.js').then(m=>m.playbackState())")
def space():
 for typ in ['keyDown','keyUp']:send('Input.dispatchKeyEvent',{'type':typ,'key':' ','code':'Space'})
def mouse(typ,x=500,y=400):send('Input.dispatchMouseEvent',{'type':typ,'x':x,'y':y,'button':'left','clickCount':1})
def until(predicate,seconds=12):
 end=time.time()+seconds
 while time.time()<end:
  s=state()
  if predicate(s):return s
  time.sleep(.12)
 raise AssertionError('Timed out waiting for mini scene')
send('Page.navigate',{'url':'about:blank'});time.sleep(.2);send('Runtime.enable')
send('Emulation.setDeviceMetricsOverride',{'width':1440,'height':960,'deviceScaleFactor':1,'mobile':False})
send('Page.navigate',{'url':'http://127.0.0.1:4180/?scene=portrait'})
for _ in range(100):
 if js("document.querySelector('#explore')?.disabled===false"):break
 time.sleep(.1)
s=until(lambda s:s['mini'] and s['mini']['stage']=='reaction')
assert s['featureCounts']['pupils']>0
print('Pupil points:',s['featureCounts']['pupils'],flush=True)
s=until(lambda s:s['mini'] and s['mini']['stage']=='gift-opening')
assert any(t['kind']=='lid' for t in s['tiles'])
space();time.sleep(.1);a=state()
js("document.querySelector('#zoom-in').click();document.querySelector('#zoom-in').click()")
time.sleep(.55);b=state()
assert a['greetingTime']==b['greetingTime']
assert all(x['alpha']==y['alpha'] for x,y in zip(a['tiles'],b['tiles'])),'Zoom changed paused brightness'
space();time.sleep(.4)
s=until(lambda s:s['mini'] and s['mini']['stage']=='confetti')
time.sleep(.9);space();time.sleep(.1);s=state()
assert s['mode']=='paused'
confetti=[(i,t) for i,t in enumerate(s['tiles']) if t['kind']=='confetti']
assert len(confetti)>150
cam=s['camera'];candidates=[]
for i,t in confetti:
 x=cam['x']+(t['x']+t['size']/2)*cam['scale'];y=cam['y']+(t['y']+t['size']/2)*cam['scale']
 if 30<x<1410 and 90<y<840 and t['alpha']>.2:candidates.append((i,t,x,y))
assert candidates
_,tile,x,y=candidates[-1]
mouse('mousePressed',x,y);mouse('mouseReleased',x,y);time.sleep(.5)
assert js("document.querySelector('#viewer').open")
assert js("document.querySelector('#full-photo').alt")==f"Наше воспоминание {tile['photoIndex']+1}"
space();time.sleep(.4)
a=state();mouse('mousePressed');time.sleep(1.2);mouse('mouseReleased');b=state()
assert b['greetingTime']>a['greetingTime'],'Holding mouse must not restart mini scene'
until(lambda s:not s['greetingsStarted'],seconds=12)
time.sleep(.5);s=state()
assert s['mode']=='heart' and len(s['tiles'])==800 and s['mini'] is None
assert not errors,errors
print('Passed: actual mini playback, gaze tagging, gift/lid, confetti photo opening, unchanged paused brightness, skip guard and return to heart. No screenshots.')
w.close()
