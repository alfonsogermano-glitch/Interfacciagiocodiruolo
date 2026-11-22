import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';

const origin='https://staging.hollowgate.quest';
const token='A'.repeat(43);
const userId='11111111-1111-4111-8111-111111111111';
const campaignId='22222222-2222-4222-8222-222222222222';
const campaigns={list:async()=>({campaigns:[]}),create:async()=>({campaign:{}}),update:async()=>({campaign:{}})};
async function serve(handler,fn){
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await fn('http://127.0.0.1:'+app.address().port);}finally{await new Promise(resolve=>app.close(resolve));}
}
const handler=invites=>createAuthHttpHandler({origin,login:async()=>{},revokeSession:async()=>{},
 getSessionUser:async value=>value===token?{id:userId,role:'standard'}:null,campaigns,campaignInvites:invites});

test('invite endpoints are absent unless the complete service is enabled',async()=>{
 await serve(handler(null),async base=>{
  const response=await fetch(base+'/vtt/campaigns/'+campaignId+'/invite-code',{method:'POST',headers:{cookie:'__Host-hg_session='+token,origin}});
  assert.equal(response.status,404);
 });
 assert.throws(()=>handler({rotate:async()=>{},preview:async()=>{}}),/valid invite service/);
});

test('owner rotation and player join derive identity from cookie and require same origin',async()=>{
 const calls=[];
 const invites={
  rotate:async(user,campaign)=>{calls.push({kind:'rotate',user,campaign});return {invite:{campaignId:campaign,code:'HG-0123456789ABCDEF0123',expiresAt:'2026-11-23T00:00:00.000Z'}};},
  preview:async(user,code)=>{calls.push({kind:'preview',user,code});return {campaign:{id:campaignId}};},
  join:async(user,code)=>{calls.push({kind:'join',user,code});return {campaign:{id:campaignId}};},
 };
 await serve(handler(invites),async base=>{
  const rotate=base+'/vtt/campaigns/'+campaignId+'/invite-code';
  assert.equal((await fetch(rotate,{method:'POST',headers:{origin}})).status,401);
  assert.equal((await fetch(rotate,{method:'POST',headers:{cookie:'__Host-hg_session='+token,origin:'https://evil.invalid'}})).status,403);
  assert.equal((await fetch(rotate,{method:'POST',headers:{cookie:'__Host-hg_session='+token,origin}})).status,200);
  const preview=await fetch(base+'/vtt/campaign-invites/preview?code=HG-0123456789ABCDEF0123',{headers:{cookie:'__Host-hg_session='+token}});
  assert.equal(preview.status,200);
  const join=await fetch(base+'/vtt/campaign-invites/join',{method:'POST',headers:{cookie:'__Host-hg_session='+token,origin,'content-type':'application/json'},body:JSON.stringify({code:'HG-0123456789ABCDEF0123'})});
  assert.equal(join.status,200);
  assert.deepEqual(calls,[
   {kind:'rotate',user:userId,campaign:campaignId},
   {kind:'preview',user:userId,code:'HG-0123456789ABCDEF0123'},
   {kind:'join',user:userId,code:'HG-0123456789ABCDEF0123'},
  ]);
 });
});

test('invite query and join body are exact and fail closed',async()=>{
 let calls=0;
 const invites={rotate:async()=>{calls++;},preview:async()=>{calls++;},join:async()=>{calls++;}};
 await serve(handler(invites),async base=>{
  const cookie={cookie:'__Host-hg_session='+token};
  assert.equal((await fetch(base+'/vtt/campaign-invites/preview?code=x&owner='+userId,{headers:cookie})).status,400);
  assert.equal((await fetch(base+'/vtt/campaign-invites/join',{method:'POST',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify({code:'x',userId})})).status,400);
  assert.equal((await fetch(base+'/vtt/campaign-invites/join',{method:'POST',headers:{...cookie,origin:'https://evil.invalid','content-type':'application/json'},body:JSON.stringify({code:'x'})})).status,403);
  assert.equal(calls,0);
 });
});
