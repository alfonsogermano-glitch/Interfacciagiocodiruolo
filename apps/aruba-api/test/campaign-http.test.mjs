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
