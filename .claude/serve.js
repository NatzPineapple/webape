// Servidor estático só para desenvolvimento local: node .claude/serve.js  (PORT=xxxx para trocar a porta)
const http=require('http'), fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const porta=Number(process.env.PORT)||5180;
const tipos={ '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
              '.js':'text/javascript; charset=utf-8', '.md':'text/markdown; charset=utf-8' };

http.createServer((req,res)=>{
  let p;
  try{ p=decodeURIComponent(req.url.split('?')[0]); }catch(_){ res.writeHead(400); return res.end('bad request'); }
  if(p==='/') p='/index.html';
  const f=path.resolve(root, '.'+p);
  if(!f.startsWith(root+path.sep)){ res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(f,(e,d)=>{
    if(e){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200,{ 'Content-Type':tipos[path.extname(f)]||'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(d);
  });
}).listen(porta,'127.0.0.1',()=>console.log('WebApê em http://localhost:'+porta));
