import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
import {CatalogRejected} from '../src/unassigned-catalog-contract.mjs';

const origin='https://www.hollowgate.quest',actor='11111111-1111-4111-8111-111111111111';
const id='33333333-3333-4333-8333-333333333333';
const item={kind:'npcs',id,name:'Dio dei carmini',ruleset:'hsc',ownerProfileId:actor,campaignId:null,
 description:'',notes:'',environmentId:null,chapterId:null,mapLocationId:null,imageUrl:null,
 coverImageUrl:null,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
 storicoType:'npcs',source:'storico'};
const cookie='__Host-hg_session='+'A'.repeat(43);
const headers={cookie,origin,'content-type':'application/json'};
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
const characters={list:async()=>({characters:[]}),create:async()=>{},save:async()=>{},archive:async()=>{}};
function service(){
 const calls=[];
 return {calls,list:async(a,after)=>{
  calls.push(['list',a,after]);
  if(after!==null&&after!==undefined&&!/^[0-9a-f-]{36}$/i.test(after))
   throw new CatalogRejected('Identificatore catalogo non valido',400);
  return after===id?{items:[],nextCursor:null}:{items:[item],nextCursor:id};
 },read:async(a,i)=>{
  calls.push(['read',a,i]);
  if(i===id)return {item};
  throw new CatalogRejected('Contenuto non trovato o non autorizzato',404);
 }};
}
async function serve(storico,callback){
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:actor}),
  revokeSession:async()=>{},campaigns,characters,storicoPngMostri:storico});
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});app.listen(0,'127.0.0.1');
 await once(app,'listening');
 try{await callback('http://127.0.0.1:'+app.address().port);}
 finally{await new Promise(resolve=>app.close(resolve));}
}
test('storico PNG/Mostri HTTP: auth, validation and routing',async()=>{
 const storico=service();
 await serve(storico,async base=>{
  const path=base+'/vtt/storico/png-mostri';
  assert.equal((await fetch(path)).status,401);
  assert.equal((await fetch(path,{headers})).status,200);
  assert.deepEqual(await fetch(path,{headers}).then(r=>r.json()),{items:[item],nextCursor:id});
  assert.equal((await fetch(path+'/'+id,{headers})).status,200);
  assert.equal((await fetch(path+'/missing',{headers})).status,400);
  assert.equal((await fetch(path+'/'+id,{headers,method:'POST',body:'{}'})).status,405);
  assert.equal((await fetch(path+'/'+id,{headers,method:'DELETE'})).status,405);
  assert.equal((await fetch(path+'?after='+id,{headers})).status,200);
  assert.equal((await fetch(path+'?after=nope',{headers})).status,400);
  assert.equal((await fetch(path+'?after=1&x=2',{headers})).status,400);
  assert.ok(storico.calls.every(call=>call[1]===actor));
  assert.deepEqual(storico.calls.map(call=>call[0]),['list','list','read','list','list']);
 });
});
