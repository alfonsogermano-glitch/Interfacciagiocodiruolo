import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://www.hollowgate.quest',actor='00000000-0000-4000-8000-000000000001';
const entity='00000000-0000-4000-8000-000000000002',note='00000000-0000-4000-8000-000000000003';
const cookie={cookie:'__Host-hg_session='+'A'.repeat(43)};
const config={origin,login:async()=>{},getSessionUser:async()=>({id:actor}),revokeSession:async()=>{}};
const catalog=Object.fromEntries(['list','read','create','save','saveMedia','readMedia'].map(name=>[name,async()=>({})]));
async function server(handler,fn){
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await fn('http://127.0.0.1:'+app.address().port);}finally{await new Promise(resolve=>app.close(resolve));}
}

test('notes and duplicate stay absent without explicit services; neither is wired or advertised at startup',async()=>{
 await server(createAuthHttpHandler({...config,unassignedCatalog:catalog}),async base=>{
  const path='/vtt/catalog/unassigned/characters/'+entity;
  assert.equal((await fetch(base+path+'/notes',{headers:cookie})).status,404);
  assert.equal((await fetch(base+path+'/duplicate',{method:'POST',headers:cookie})).status,404);
 });
 assert.throws(()=>createAuthHttpHandler({...config,unassignedCatalogNotes:{}}),/Catalog notes require/);
 assert.doesNotMatch(readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8'),/createUnassignedCatalogNotesService|unassignedCatalogNotes\s*:/);
});

test('note list/create/save/order/archive HTTP binds only cookie actor and exact path; every write requires Origin',async()=>{
 const calls=[];
 const notes=Object.fromEntries(['list','create','save','archive','reorder'].map(method=>[method,async(...args)=>{calls.push([method,...args]);return {item:{revision:2}};}]));
 await server(createAuthHttpHandler({...config,unassignedCatalog:catalog,unassignedCatalogNotes:notes}),async base=>{
  const path=base+'/vtt/catalog/unassigned/characters/'+entity+'/notes';
  const write=(method,body)=>({method,headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await fetch(path)).status,401);
  assert.equal((await fetch(path+'?parentId='+note,{headers:cookie})).status,200);
  assert.deepEqual(calls.shift(),['list',actor,'characters',entity,note]);
  for(const [suffix,method,body,action] of [['','POST',{revision:1,tabName:'Tab'},'create'],
   ['/'+note,'PUT',{revision:1},'save'],['/'+note+'/order','PUT',{revision:1,tabOrder:[]},'reorder'],
   ['/'+note,'DELETE',{revision:1},'archive']]){
   assert.equal((await fetch(path+suffix,{...write(method,body),headers:{...cookie,origin:'https://evil.invalid','content-type':'application/json'}})).status,403);
   assert.equal((await fetch(path+suffix,write(method,body))).status,action==='create'?201:200);
   const args=calls.shift();assert.deepEqual(args.slice(0,4),[action,actor,'characters',entity]);
   if(action!=='create')assert.equal(args[4],note);
  }
  assert.equal((await fetch(path+'?parentId='+note+'&parentId='+note,{headers:cookie})).status,400);
  assert.equal((await fetch(path+'?after='+note,{headers:cookie})).status,400);
  assert.equal((await fetch(path+'/'+note,{headers:cookie})).status,405);
  assert.equal((await fetch(path+'/'+note+'/order',write('DELETE',{revision:1}))).status,405);
  assert.equal(calls.length,0);
 });
});

test('duplicate HTTP is cookie-only, POST-only, Origin protected and delegates request identity without accepting query metadata',async()=>{
 const calls=[],service={...catalog,duplicate:async(...args)=>{calls.push(args);return {item:{id:note}};}};
 await server(createAuthHttpHandler({...config,unassignedCatalog:service}),async base=>{
  const path=base+'/vtt/catalog/unassigned/characters/'+entity+'/duplicate',body={revision:1,requestId:note};
  const request={method:'POST',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)};
  assert.equal((await fetch(path,{...request,headers:{origin,'content-type':'application/json'}})).status,401);
  assert.equal((await fetch(path,{...request,headers:{...cookie,'content-type':'application/json'}})).status,403);
  assert.equal((await fetch(path,{headers:cookie})).status,405);
  assert.equal((await fetch(path+'?ownerId='+actor,request)).status,400);
  const result=await fetch(path,request);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(calls,[[actor,'characters',entity,body]]);
 });
});
