// Disposable loopback-only browser fixture. Never connects to any database,
// provider or live API. Serves the real built frontend with explicit QA data.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const web=resolve(repo,'deploy/aruba/dist/vtt-pilot');
const legal=resolve(repo,'deploy/aruba/dist/public-pages');
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const campaign={id:'33333333-3333-4333-8333-333333333333',ownerId:owner,
 name:'Campagna QA conservata',description:'Fixture anonima di sola prova',ruleset:'hsc',createdAt:'2026-11-22T00:00:00.000Z'};
const joined={...campaign,id:'44444444-4444-4444-8444-444444444444',ownerId:other,name:'Campagna QA giocatore'};
const capabilities={campaigns:{read:true,write:true},characters:{read:true,write:true},
 campaignInvites:{read:true,write:true},campaignRoster:{read:true,write:false},
 characterAvailability:{read:true,write:true},characterAssignments:{read:true,write:true},
 playerCharacters:{read:true,write:false},gameSession:false};
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.gif':'image/gif','.json':'application/json'};

export function createRecoveryPreview(){
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const url=new URL(req.url??'/','http://127.0.0.1');
  const path=url.pathname;
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'QA writes disabled'});
  const scenarios=new Set(['player-route-404','owned-route-503','session-expired','expired-invite','healthy']);
  // The real shipping entry correctly has no-referrer. A non-auth QA marker
  // selects the fixture; never weaken the real page's referrer policy.
  const marker=/\bhg_recovery_scenario=([a-z0-9-]+)/.exec(req.headers.cookie??'')?.[1];
  let scenario=scenarios.has(marker)?marker:'player-route-404';
  if(path==='/vtt/'||path==='/vtt'){
   const selected=url.searchParams.get('scenario');
   if(scenarios.has(selected)){
    scenario=selected;
    res.setHeader('Set-Cookie','hg_recovery_scenario='+selected+'; Path=/; HttpOnly; SameSite=Strict');
   }
  }
  // Explicit header support for the Node-only fixture tests (no browser policy).
  try{const selected=new URL(req.headers.referer??'http://127.0.0.1').searchParams.get('scenario');if(scenarios.has(selected))scenario=selected;}catch{}
  if(path==='/vtt/bootstrap')return json(200,{backend:'aruba-staging',
   user:{id:owner,email:'qa@example.invalid',displayName:'Recupero QA',role:'standard'},capabilities});
  if(path==='/vtt/campaigns'){
   if(scenario==='owned-route-503')return json(503,{error:'QA unavailable'});
   return json(200,{campaigns:[campaign]});
  }
  if(path==='/vtt/player-campaigns'){
   if(scenario==='session-expired')return json(401,{error:'Non autenticato'});
   if(scenario==='player-route-404'){res.writeHead(404,{'Content-Type':'text/html'});return res.end('Not Found');}
   return json(200,{campaigns:[joined]});
  }
  if(path==='/vtt/campaign-invites/preview'){
   if(scenario==='expired-invite')return json(404,{error:'Codice invito non valido o scaduto'});
   res.writeHead(404,{'Content-Type':'text/html'});return res.end('QA missing gateway route');
  }
  if(path==='/vtt/characters'||path==='/vtt/player-characters'||path==='/vtt/character-availability')return json(200,{characters:[]});
  if(path==='/vtt/character-assignments')return json(200,{assignments:[]});
  if(/^\/vtt\/campaigns\/[^/]+\/roster$/.test(path))return json(200,{members:[{userId:owner,displayName:'Recupero QA',role:'gm'}]});
  if(path==='/privacy'||path==='/elimina-dati'){
   const bytes=await readFile(resolve(legal,path.slice(1)+'.html')).catch(()=>null);
   if(!bytes){res.writeHead(503);return res.end('Build public pages first');}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(bytes);
  }
  if(path.startsWith('/auth/')||path==='/health'||path==='/ready')return json(404,{error:'No live services in fixture'});
  const relative=path==='/vtt/'||path==='/vtt'?'index.html':path.startsWith('/vtt/')?path.slice(5):path.slice(1);
  let target;
  try{target=resolve(web,decodeURIComponent(relative));}catch{res.writeHead(400);return res.end();}
  if(!target.startsWith(web+sep)){res.writeHead(404);return res.end();}
  const bytes=await readFile(target).catch(()=>null);
  if(!bytes){res.writeHead(404);return res.end('Not Found');}
  res.writeHead(200,{'Content-Type':types[extname(target)]??'application/octet-stream'});
  res.end(req.method==='HEAD'?undefined:bytes);
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.HG_RECOVERY_PREVIEW_PORT??8768);
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid loopback QA port');
 createRecoveryPreview().listen(port,'127.0.0.1',()=>console.log('RECOVERY_QA_LOOPBACK_READY http://127.0.0.1:'+port));
}
