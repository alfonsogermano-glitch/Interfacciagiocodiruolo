import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://www.hollowgate.quest',actor='11111111-1111-4111-8111-111111111111';
const character='22222222-2222-4222-8222-222222222222',cookie='__Host-hg_session='+'A'.repeat(43);
const characters={list:async()=>({characters:[]}),create:async()=>{},save:async()=>{},archive:async()=>{}};
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
async function serve(catalog,callback){
 const logicalCharacters={list:async()=>({characters:[]}),assign:async()=>({}),...(catalog?{catalog}:{})};
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:actor}),revokeSession:async()=>{},
  campaigns,characters,logicalCharacters});
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await callback('http://127.0.0.1:'+app.address().port);}finally{await new Promise(resolve=>app.close(resolve));}
}
test('logical catalog routes/capability remain absent without explicit service wiring',async()=>{
 await serve(null,async base=>{
  assert.equal((await fetch(base+'/vtt/catalog/logical-characters',{headers:{cookie}})).status,404);
  const boot=await fetch(base+'/vtt/bootstrap',{headers:{cookie}}).then(r=>r.json());
  assert.equal(boot.capabilities.logicalCharacterCatalog,undefined);
 });
});
test('logical catalog routes are cookie-bound, Origin checked and reject malformed queries before dispatch',async()=>{
 const calls=[],catalog=Object.fromEntries(['list','read','create','save','archive','duplicate'].map(name=>[name,async(...args)=>{
  calls.push({name,args});return {ok:true};}]));
 await serve(catalog,async base=>{
  const path=base+'/vtt/catalog/logical-characters',headers={cookie,origin,'content-type':'application/json'};
  assert.equal((await fetch(path)).status,401);
  assert.equal((await fetch(path+'?ownerId=forged',{headers})).status,400);
  assert.equal((await fetch(path,{headers})).status,200);
  assert.equal((await fetch(path+'/'+character,{headers})).status,200);
  assert.equal((await fetch(path+'/'+character,{method:'PUT',headers:{...headers,origin:'https://foreign.invalid'},body:'{}'})).status,403);
  assert.equal((await fetch(path+'/'+character,{method:'PUT',headers,body:'{}'})).status,200);
  assert.equal((await fetch(path+'/'+character,{method:'DELETE',headers,body:'{}'})).status,200);
  assert.equal((await fetch(path+'/'+character+'/duplicate',{method:'POST',headers,body:'{}'})).status,200);
  assert.deepEqual(calls.map(c=>c.name),['list','read','save','archive','duplicate']);
  assert.ok(calls.every(c=>c.args[0]===actor));
  const boot=await fetch(base+'/vtt/bootstrap',{headers}).then(r=>r.json());
  assert.deepEqual(boot.capabilities.logicalCharacterCatalog,{read:true,write:true});
 });
});
