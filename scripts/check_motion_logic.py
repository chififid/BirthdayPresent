"""Nonvisual checks only: no screenshots or image inspection."""
import json,time,urllib.request,websocket
pages=json.load(urllib.request.urlopen('http://127.0.0.1:9341/json/list'))
w=websocket.create_connection(pages[0]['webSocketDebuggerUrl'],suppress_origin=True)
n=0
errors=[]
def send(method,params={}):
 global n
 n+=1;request=n;w.send(json.dumps({'id':request,'method':method,'params':params}))
 while True:
  r=json.loads(w.recv())
  if r.get('method')=='Runtime.exceptionThrown':errors.append(r['params'])
  if r.get('id')==request:return r.get('result',{})
def js(expression):
 r=send('Runtime.evaluate',{'expression':expression,'returnByValue':True,'awaitPromise':True})
 assert 'exceptionDetails' not in r,r
 return r['result'].get('value')
send('Page.navigate',{'url':'about:blank'});time.sleep(.2);send('Runtime.enable')
send('Page.navigate',{'url':'http://127.0.0.1:4180'})
for _ in range(100):
 if js("document.querySelector('#explore')?.disabled===false"):break
 time.sleep(.1)
result=js("(async()=>{const m=await import('/app.js');return {cards:m.greetingCards.map(c=>({text:c.text,letters:c.glyphs.length,tiles:c.glyphs.reduce((s,g)=>s+g.tiles,0),empty:c.glyphs.some(g=>g.tiles===0),duration:c.duration})),before:m.greetingAt(0),first:m.greetingAt(8.8),second:m.greetingAt(13.61)}})()")
assert len(result['cards'])==4
assert all(not c['empty'] and c['tiles']>0 for c in result['cards'])
assert result['before'] is None and result['first']['index']==0 and result['second']['index']==1
assert 'сердце' in js("document.querySelector('canvas').getAttribute('aria-label')")
send('Input.dispatchKeyEvent',{'type':'keyDown','key':'a','code':'KeyA'})
send('Input.dispatchKeyEvent',{'type':'keyUp','key':'a','code':'KeyA'})
time.sleep(.3)
assert 'Happy Birthday' in js("document.querySelector('canvas').getAttribute('aria-label')")
assert not errors,errors
print(json.dumps(result,ensure_ascii=False))
print('Nonvisual logic checks passed; no screenshots captured.')
w.close()
