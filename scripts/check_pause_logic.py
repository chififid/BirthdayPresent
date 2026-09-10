"""Interaction and state assertions only. No screenshots."""
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
 send('Input.dispatchKeyEvent',{'type':'keyDown','key':' ','code':'Space'})
 send('Input.dispatchKeyEvent',{'type':'keyUp','key':' ','code':'Space'})
def mouse(kind,x=550,y=380):send('Input.dispatchMouseEvent',{'type':kind,'x':x,'y':y,'button':'left','clickCount':1})
send('Page.navigate',{'url':'about:blank'});time.sleep(.2);send('Runtime.enable')
send('Emulation.setDeviceMetricsOverride',{'width':1440,'height':960,'deviceScaleFactor':1,'mobile':False})
send('Page.navigate',{'url':'http://127.0.0.1:4180'})
for _ in range(100):
 if js("document.querySelector('#explore')?.disabled===false"):break
 time.sleep(.1)
time.sleep(.2)
space();time.sleep(.1);a=state();time.sleep(.3);b=state()
assert a['mode']==b['mode']=='paused' and a['storyTime']==b['storyTime']
space();time.sleep(.2);assert state()['mode']=='heart'
mouse('mousePressed');time.sleep(.2);mouse('mouseReleased');time.sleep(1)
assert not state()['greetingsStarted'],'Short click must not skip'
mouse('mousePressed');time.sleep(1.25);mouse('mouseReleased')
s=state();assert s['greetingsStarted'] and s['greetingTime']>=s['greetingCycle']
time.sleep(1)
space();time.sleep(.1);a=state();time.sleep(.45);b=state()
assert a['mode']=='paused' and a['greetingTime']==b['greetingTime']
assert all(abs(x[k]-y[k])<1e-7 for x,y in zip(a['tiles'],b['tiles']) for k in ['x','y','size','alpha'])
js("document.querySelector('#zoom-in').click();document.querySelector('#zoom-in').click()")
time.sleep(.5);s=state();assert s['camera']['scale']>a['camera']['scale']
# Click the centre of an actual frozen tile, not its former grid cell.
cam=s['camera'];points=[]
for i,t in enumerate(s['tiles']):
 x=cam['x']+(t['x']+t['size']/2)*cam['scale'];y=cam['y']+(t['y']+t['size']/2)*cam['scale']
 if 100<x<1340 and 130<y<820:points.append((t['alpha'],x,y))
_,x,y=max(points)
mouse('mousePressed',x,y);mouse('mouseReleased',x,y);time.sleep(.4)
assert js("document.querySelector('#viewer').open")
space();time.sleep(.4);s=state()
assert s['mode']=='heart' and s['greetingTime']>b['greetingTime'] and not js("document.querySelector('#viewer').open")
js("document.querySelector('#explore').click();document.querySelector('#back').click()")
time.sleep(.4);s=state();assert s['mode']=='heart' and not s['greetingsStarted']
assert not errors,errors
print('Passed: short-click cancellation, long-click skip, frozen heart/portrait, pause zoom, photo hit-testing, resume and reset. No screenshots.')
w.close()
