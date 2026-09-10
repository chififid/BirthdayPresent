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
send('Page.navigate',{'url':'about:blank'});time.sleep(.2)
send('Runtime.enable');send('Page.enable')
send('Emulation.setDeviceMetricsOverride',{'width':1440,'height':960,'deviceScaleFactor':1,'mobile':False})
send('Page.navigate',{'url':'http://127.0.0.1:4180'})
for index,text in enumerate(['Happy Birthday!','С днём рождения!','生日快乐！','Heri ya siku ya kuzaliwa!']):
 deadline=time.time()+20
 while time.time()<deadline:
  if text in (js("document.querySelector('canvas')?.getAttribute('aria-label')") or ''):break
  time.sleep(.15)
 else:raise AssertionError('Missing greeting: '+text)
 time.sleep(3.0)
 shot('greeting-'+str(index))
 print(text,flush=True)
 if index==2:
  send('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
  time.sleep(.4);shot('greeting-chinese-mobile')
  send('Emulation.setDeviceMetricsOverride',{'width':1440,'height':960,'deviceScaleFactor':1,'mobile':False})
assert not errors,errors
print('All four greetings rendered without browser errors',flush=True)
w.close()
