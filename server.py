from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse
ROOT=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  path=unquote(urlsplit(path).path)
  base=ROOT/'photos' if path.startswith('/photos/') else ROOT/'site'
  relative=path[len('/photos/'):] if path.startswith('/photos/') else path.lstrip('/')
  target=(base/relative).resolve()
  if not target.is_relative_to(base.resolve()): return str(ROOT/'site/__missing__')
  return str(target)
 def list_directory(self,path):
  self.send_error(404)
 def end_headers(self):
  self.send_header('Cache-Control','no-cache')
  super().end_headers()
if __name__=='__main__':
 parser=argparse.ArgumentParser()
 parser.add_argument('--port',type=int,default=4180)
 args=parser.parse_args()
 print(f'Birthday Present: http://localhost:{args.port}',flush=True)
 ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
