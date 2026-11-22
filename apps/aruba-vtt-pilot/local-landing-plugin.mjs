import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve,isAbsolute,sep} from 'node:path';

const pages=new Set(['/', '/login', '/signup', '/forgot-password', '/reset-password',
  '/account/password', '/account/verify-email']);
const assets=new Map([
  ['/auth-ui/app.mjs','application/javascript; charset=utf-8'],
  ['/auth-ui/flow.mjs','application/javascript; charset=utf-8'],
  ['/auth-ui/styles.css','text/css; charset=utf-8'],
]);

// Only activated by HG_LOCAL_FULL=1. Production builds still use their
// existing Caddy routing and never include this development middleware.
export function localLandingPlugin({root}){
  const auth=resolve(root,'../aruba-auth-web');
  const mediaRoot=resolve(root,'../../deploy/aruba/data/legacy-public-media');
  let media=new Map();
  try{
    const manifest=JSON.parse(readFileSync(resolve(mediaRoot,'manifest.json'),'utf8'));
    media=new Map(manifest.items.filter(item=>
      /^\/vtt\/migrated-media\//.test(item.publicPath)&&
      ['image/jpeg','image/webp','image/png'].includes(item.contentType)&&
      typeof item.path==='string'&&!isAbsolute(item.path)&&
      resolve(mediaRoot,item.path).startsWith(mediaRoot+sep))
      .map(item=>[item.publicPath,{file:resolve(mediaRoot,item.path),type:item.contentType}]));
  }catch{ /* Missing private media bundle: no simulated images. */ }
  return {name:'hollowgate-local-landing',apply:'serve',configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      if(req.method!=='GET'&&req.method!=='HEAD')return next();
      const path=new URL(req.url??'/', 'http://localhost').pathname;
      const isPage=pages.has(path);
      const mime=assets.get(path);
      const image=media.get(path);
      if(!isPage&&!mime&&!image)return next();
      try{
        const file=image?.file??(isPage?resolve(auth,'index.trial.html'):resolve(auth,path.slice('/auth-ui/'.length)));
        const body=await readFile(file);
        res.setHeader('Content-Type',image?.type??(isPage?'text/html; charset=utf-8':mime));
        res.setHeader('Cache-Control','no-store');
        res.setHeader('Referrer-Policy','no-referrer');
        res.end(req.method==='HEAD'?undefined:body);
      }catch{res.statusCode=503;res.end('Local landing unavailable');}
    });
  }};
}
