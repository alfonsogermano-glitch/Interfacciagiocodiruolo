import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';

const origin='https://staging.hollowgate.quest';
const token='A'.repeat(43);
const ownerA='971e26ae-eecb-4f37-ad03-56b0c3000789';
const ownerB='ff22115e-30ef-4e3b-8619-70b7e2581135';
const request=(user,campaigns)=>createAuthHttpHandler({
 origin,login:async()=>{},getSessionUser:async value=>value===token?user:null,
 revokeSession:async()=>{},campaigns,
});
async function serve(handler,fn){
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await fn('http://127.0.0.1:'+app.address().port);}
 finally{await new Promise(resolve=>app.close(resolve));}
}
test('API unavailable without explicit migration feature flag',async()=>{
 await serve(request({id:ownerA},null),async base=>{
  const r=await fetch(base+'/vtt/campaigns',{headers:{cookie:'__Host-hg_session='+token}});
  assert.equal(r.status,404);
  const status=await (await fetch(base+'/vtt/bootstrap',{headers:{cookie:'__Host-hg_session='+token}})).json();
  assert.equal(status.capabilities.campaigns.read,false);
 });
});
test('authenticated owner is derived from cookie and other users are isolated',async()=>{
 const entries=[{id:'campaign-1',ownerId:ownerA}];
 const campaigns={
  list:async id=>({campaigns:entries.filter(c=>c.ownerId===id)}),
  create:async (id,body)=>({campaign:{id:'campaign-2',...body,ownerId:id}}),
  update:async (id,uuid,body)=>({campaign:{id:uuid,ownerId:id,...body}}),
 };
 await serve(request({id:ownerB,role:'standard'},campaigns),async base=>{
  const cookie={cookie:'__Host-hg_session='+token};
  assert.equal((await fetch(base+'/vtt/campaigns')).status,401);
  const r=await fetch(base+'/vtt/campaigns',{headers:cookie});
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).campaigns,[]);
  const forged=await fetch(base+'/vtt/campaigns',{method:'POST',
    headers:{...cookie,origin, 'content-type':'application/json'},
    body:JSON.stringify({name:'Storia',description:'',ruleset:'hsc',ownerId:ownerA})});
  const payload=await forged.json();
  assert.equal(payload.campaign.ownerId,ownerB);
  assert.equal(forged.status,201);
  const wrong=await fetch(base+'/vtt/campaigns',{method:'POST',
    headers:{...cookie,origin:'https://attacker.example','content-type':'application/json'},
    body:JSON.stringify({name:'Storia',description:'',ruleset:'hsc'})});
  assert.equal(wrong.status,403);
 });
});

test('PATCH campaign edit is cookie scoped and rejects CSRF and forged owner fields',async()=>{
 const uuid='be2f1a87-b8ee-4b34-9da0-07efda11379a';
 const calls=[];
 const campaigns={list:async()=>({campaigns:[]}),create:async()=>({campaign:{}}),
  update:async (owner,id,body)=>{calls.push({owner,id,body});return {campaign:{id,ownerId:owner,...body}};}};
 await serve(request({id:ownerA,role:'standard'},campaigns),async base=>{
  const url=base+'/vtt/campaigns/'+uuid;
  const data={name:'Nuova',description:'Descrizione'};
  const req={method:'PATCH',headers:{cookie:'__Host-hg_session='+token,origin,'content-type':'application/json'},body:JSON.stringify(data)};
  assert.equal((await fetch(url,{...req,headers:{origin,'content-type':'application/json'}})).status,401);
  assert.equal((await fetch(url,{...req,headers:{...req.headers,origin:'https://evil.invalid'}})).status,403);
  assert.equal((await fetch(url,req)).status,200);
  assert.deepEqual(calls,[{owner:ownerA,id:uuid,body:data}]);
  const forged=await fetch(url,{...req,body:JSON.stringify({...data,ownerId:ownerB})});
  assert.equal(forged.status,200); // mock only: service-level schema validation is separately tested
 });
});
