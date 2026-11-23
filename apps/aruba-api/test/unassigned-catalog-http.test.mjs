import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://www.hollowgate.quest';
const cookie={cookie:'__Host-hg_session='+'A'.repeat(43)};
const config={origin,login:async()=>{},getSessionUser:async()=>({id:'00000000-0000-4000-8000-000000000001'}),revokeSession:async()=>{}};
async function server(handler,fn){
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await fn('http://127.0.0.1:'+app.address().port);}finally{await new Promise(resolve=>app.close(resolve));}
}

test('partial catalog stays off by default with opt-in startup and no advertised global capability',async()=>{
 const handler=createAuthHttpHandler(config);
 await server(handler,async base=>{
  assert.equal((await fetch(base+'/vtt/catalog/unassigned/npcs',{headers:cookie})).status,404);
  const bootstrap=await fetch(base+'/vtt/bootstrap',{headers:cookie}).then(r=>r.json());
  assert.equal(bootstrap.capabilities.unassignedCatalog,undefined);
   assert.equal(bootstrap.capabilities.globalCatalog,undefined);
   assert.equal(bootstrap.capabilities.nativeCatalog,undefined);
 });
 const source=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
  assert.match(source,/configureNativeCatalog/);
  assert.match(source,/AUTH_VTT_NATIVE_CATALOG_ENABLED/);
 assert.throws(()=>createAuthHttpHandler({...config,unassignedCatalog:{}}),/Invalid unassigned catalog service/);
});

test('unassigned HTTP rejects unsupported actions/query, duplicate cookies and expired sessions before dispatch',async()=>{
 let calls=0;
 const service=Object.fromEntries(['list','read','create','save','saveMedia','readMedia'].map(method=>[method,async()=>{calls++;return {items:[],nextCursor:null};}]));
 const handler=createAuthHttpHandler({...config,unassignedCatalog:service});
 await server(handler,async base=>{
  const url=base+'/vtt/catalog/unassigned/npcs';
  for(const suffix of ['?ownerId=x','?after=x&after=y','/bad','/00000000-0000-4000-8000-000000000002?after=x'])
   assert.equal((await fetch(url+suffix,{headers:cookie})).status,400);
  assert.equal((await fetch(url,{headers:{cookie:cookie.cookie+'; '+cookie.cookie}})).status,401);
  assert.equal((await fetch(url,{method:'DELETE',headers:cookie})).status,405);
  const body=JSON.stringify({name:'PNG',ruleset:'hsc',data:{}});
  assert.equal((await fetch(url,{method:'POST',headers:{...cookie,origin,'content-type':'text/plain'},body})).status,415);
  assert.equal(calls,0);
 });
 await server(createAuthHttpHandler({...config,getSessionUser:async()=>null,unassignedCatalog:service}),async base=>{
  const response=await fetch(base+'/vtt/catalog/unassigned/npcs',{headers:cookie});
  assert.equal(response.status,401);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 });
 assert.equal(calls,0);
});

test('unexpected catalog failures are generic and never disclose SQL, payloads or credentials',async()=>{
 const service=Object.fromEntries(['list','read','create','save','saveMedia','readMedia'].map(method=>[method,async()=>{throw new Error('private-diagnostic-secret');}]));
 await server(createAuthHttpHandler({...config,unassignedCatalog:service}),async base=>{
  const response=await fetch(base+'/vtt/catalog/unassigned/npcs',{headers:cookie});
  assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/private-diagnostic-secret/);
 });
});

test('native bootstrap advertises only the native capability when catalog and notes are both wired',async()=>{
 const service=Object.fromEntries(['list','read','create','save','saveMedia','readMedia'].map(name=>[name,async()=>({})]));
 const notes=Object.fromEntries(['list','create','save','reorder','archive'].map(name=>[name,async()=>({})]));
 const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
 await server(createAuthHttpHandler({...config,campaigns,unassignedCatalog:service,unassignedCatalogNotes:notes}),async base=>{
  const bootstrap=await fetch(base+'/vtt/bootstrap',{headers:cookie}).then(response=>response.json());
  assert.deepEqual(bootstrap.capabilities.nativeCatalog,{read:true,write:true});
  assert.equal(bootstrap.capabilities.globalCatalog,undefined);
 });
 await server(createAuthHttpHandler({...config,unassignedCatalog:service}),async base=>{
  const bootstrap=await fetch(base+'/vtt/bootstrap',{headers:cookie}).then(response=>response.json());
  assert.equal(bootstrap.capabilities.nativeCatalog,undefined);
 });
});
