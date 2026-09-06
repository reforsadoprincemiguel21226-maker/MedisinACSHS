const http = require('http');
const path = require('path');
const fs = require('fs');
const { handleChat, handleAdmin } = require('../lib/server-core.js');
const PORT = process.env.PORT || 3000;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' };
function serveStatic(req,res){
  let urlPath; try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch { return res.writeHead(400).end('Bad request'); }
  if (urlPath.split('/').some(s=>s.startsWith('.'))) return res.writeHead(403).end('Forbidden');
  const root=path.resolve(path.join(__dirname,'..','public'));
  const filePath=path.resolve(path.join(root,urlPath==='/'?'index.html':urlPath));
  if (filePath!==root && !filePath.startsWith(root+path.sep)) return res.writeHead(403).end('Forbidden');
  const ext=path.extname(filePath); if(!MIME[ext]) return res.writeHead(404).end('Not found');
  fs.readFile(filePath,(err,data)=>{ if(err)return res.writeHead(404).end('Not found'); res.writeHead(200,{'Content-Type':MIME[ext]}); res.end(data); });
}
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(url.pathname==='/api/chat') return handleChat(req,res);
  if(url.pathname.startsWith('/api/admin/')) return handleAdmin(req,res,url);
  if(req.method==='GET') return serveStatic(req,res);
  res.writeHead(405).end('Method not allowed');
});
server.listen(PORT,()=>console.log(`MedisinACSHS running at http://localhost:${PORT}`));
