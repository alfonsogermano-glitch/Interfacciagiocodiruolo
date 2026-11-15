import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHmac} from 'node:crypto';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
import {createTurnCredentialService} from '../src/turn-credential-service.mjs';

const origin='https://staging.hollowgate.quest';
const token='A'.repeat(43);
const campaign='00000000-0000-4000-8000-000000000001';
const player='00000000-0000-4000-8000-000000000002';
const secret=Buffer.alloc(32,91);
async function serve(handler,callback){
 const server=createApp({checkDatabase:async()=>{},authHandler:handler});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await callback('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
function handler({enabled=true,revoked=false}={}){
 const calls=[];
 const identity={async verify(input){
  calls.push(input);
  if(revoked||input.sessionToken!==token||input.campaignId!==campaign||
     input.connectionRole!=='player')throw Error('Unauthorized');
  return {userId:player,campaignId:campaign,role:'player'};
 }};
 const turnCredentials=enabled?createTurnCredentialService({
  identity,sharedSecret:secret,urls:['turn:relay.example.org:3478'],
  ttlSeconds:300,clock:()=>1000000,
 }):null;
 const auth=createAuthHttpHandler({
  origin,login:async()=>{},getSessionUser:async()=>null,revokeSession:async()=>{},
  turnCredentials,
 });
 return {auth,calls};
}
const request=(base,body,headers={})=>fetch(base+'/vtt/ice-credentials',{
 method:'POST',headers:{'content-type':'application/json',...headers},
 body:JSON.stringify(body),
});
test('TURN endpoint absent unless explicitly configured',async()=>{
 const h=handler({enabled:false});
 await serve(h.auth,async base=>{
  const response=await request(base,{campaignId:campaign,role:'player'},
   {origin,cookie:'__Host-hg_session='+token});
  assert.equal(response.status,404);
 });
});
test('TURN endpoint requires exact origin and session cookie, and ignores claimed identity',async()=>{
 const h=handler();
 await serve(h.auth,async base=>{
  let res=await request(base,{campaignId:campaign,role:'player'},
   {cookie:'__Host-hg_session='+token});
  assert.equal(res.status,403);
  res=await request(base,{campaignId:campaign,role:'player'},{origin});
  assert.equal(res.status,401);
  res=await request(base,{campaignId:campaign,role:'player',userId:player},
   {origin,cookie:'__Host-hg_session='+token});
  assert.equal(res.status,400);
  assert.equal(h.calls.length,0);
 });
});
test('TURN endpoint derives expiring credentials from verified cookie membership only',async()=>{
 const h=handler();
 await serve(h.auth,async base=>{
  const response=await request(base,{campaignId:campaign,role:'player'},
   {origin,cookie:'__Host-hg_session='+token});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('set-cookie'),null);
  const body=await response.json();
  assert.equal(body.expiresAt,1300);
  assert.equal(body.iceServers[0].username,'1300:'+player);
  assert.equal(body.iceServers[0].credential,
   createHmac('sha1',secret).update(body.iceServers[0].username).digest('base64'));
  assert.deepEqual(h.calls,[{sessionToken:token,campaignId:campaign,connectionRole:'player'}]);
 });
});
test('TURN endpoint does not disclose temporary credentials when membership revoked',async()=>{
 const h=handler({revoked:true});
 await serve(h.auth,async base=>{
  const response=await request(base,{campaignId:campaign,role:'player'},
   {origin,cookie:'__Host-hg_session='+token});
  assert.notEqual(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.ok(!JSON.stringify(await response.json()).includes('credential'));
 });
});
