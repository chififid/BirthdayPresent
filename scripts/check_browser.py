import urllib.request,json,websocket,time,base64
from pathlib import Path
pages=json.load(urllib.request.urlopen('http://127.0.0.1:9341/json/list'))
w=websocket.create_connection(pages[0]['webSocketDebuggerUrl'],suppress_origin=True)
seq=0
errors=[]
def send(method,params={}):
 global seq
 seq+=1; n=seq; w.send(json.dumps({'id':n,'method':method,'params':params}))
 while True:
  r=json.loads(w.recv())
  if r.get('method')=='Runtime.exceptionThrown': errors.append(r['params'])
  if r.get('id')==n:
   if 'error' in r: raise RuntimeError(r['error'])
   return r.get('result',{})
def js(exp):
 r=send('Runtime.evaluate',{'expression':exp,'returnByValue':True,'awaitPromise':True})
 if 'exceptionDetails' in r: raise RuntimeError(r['exceptionDetails'])
 return r.get('result',{}).get('value')
def shot(name):
 r=send('Page.captureScreenshot',{'format':'png'})
 Path('/tmp/birthday-'+name+'.png').write_bytes(base64.b64decode(r['data']))
send('Page.navigate',{'url':'about:blank'});time.sleep(.15)
send('Runtime.enable');send('Page.enable')
send('Emulation.setDeviceMetricsOverride',{'width':1440,'height':960,'deviceScaleFactor':1,'mobile':False})
send('Page.navigate',{'url':'http://127.0.0.1:4180'})
for _ in range(100):
 if js("document.querySelector('#explore')?.disabled===false"):break
 time.sleep(.1)
assert js("document.querySelector('#explore').disabled===false")
assert js("[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).length")==1
shot('heartbeat')
snap=js("document.querySelector('canvas').toDataURL()")
time.sleep(.35)
assert snap!=js("document.querySelector('canvas').toDataURL()"), 'Heartbeat must animate'
js("document.querySelector('#explore').click();document.querySelector('#zoom-in').click();document.querySelector('#zoom-in').click()")
time.sleep(.5)
assert js("document.querySelector('#zoom-value').textContent")=='225%'
send('Input.dispatchMouseEvent',{'type':'mousePressed','x':720,'y':480,'button':'left','clickCount':1})
send('Input.dispatchMouseEvent',{'type':'mouseReleased','x':720,'y':480,'button':'left','clickCount':1})
time.sleep(.8)
assert js("document.querySelector('#viewer').open")
assert js("document.querySelector('#full-photo').naturalWidth>0")
def click_button(selector):
 point=js("(()=>{const r=document.querySelector("+json.dumps(selector)+").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
 send('Input.dispatchMouseEvent',{'type':'mousePressed',**point,'button':'left','clickCount':1})
 send('Input.dispatchMouseEvent',{'type':'mouseReleased',**point,'button':'left','clickCount':1})
position=js("document.querySelector('#photo-position').textContent")
click_button('#next');time.sleep(.5)
assert js("document.querySelector('#photo-position').textContent")!=position
click_button('#prev');time.sleep(.5)
assert js("document.querySelector('#photo-position').textContent")==position
js("document.querySelector('#next').click();document.querySelector('#next').click();document.querySelector('#prev').click()")
time.sleep(.8)
assert js("document.querySelector('#full-photo').alt.split(' ').at(-1)")==str(int(position.split(' / ')[0])+1)
shot('pink-viewer')
click_button('#close-viewer');time.sleep(.4)
assert js("!document.querySelector('#viewer').open")
js("document.querySelector('#back').click()")
assert js("!document.querySelector('#explore').hidden")
send('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
time.sleep(.5);shot('mobile-heartbeat')
js("document.querySelector('#explore').click()")
time.sleep(.5)
send('Input.dispatchMouseEvent',{'type':'mousePressed','x':195,'y':405,'button':'left','clickCount':1})
send('Input.dispatchMouseEvent',{'type':'mouseReleased','x':195,'y':405,'button':'left','clickCount':1})
time.sleep(.8)
assert js("document.querySelector('#viewer').open")
position=js("document.querySelector('#photo-position').textContent")
click_button('#next');time.sleep(.5)
assert js("document.querySelector('#photo-position').textContent")!=position
click_button('#prev');time.sleep(.5)
assert js("document.querySelector('#photo-position').textContent")==position
shot('pink-mobile-viewer')
assert not errors, errors
print(json.dumps({'ready':True,'single_main_button':True,'heartbeat_animates':True,'zoom_and_photo_viewer':'passed','runtime_errors':errors,'horizontal_overflow':js('document.documentElement.scrollWidth>innerWidth')}))
w.close()
