import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';

const origin='https://www.hollowgate.quest',actor='10000000-0000-4000-8000-000000000001';
const campaign='10000000-0000-4000-8000-000000000002';
const cookie='__Host-hg_session='+'A'.repeat(43);
const item={kind:'npcs',id:'10000000-0000-4000-8000-000000000003',ownerId:actor,campaignId:campaign,
 name:'Custode',ruleset:'hsc',revision:1,status:'active',data:{description:'Custodi'},
 createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
const calls=[];
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
const characters={list:async()=>({characters:[]}),create:async()=>{},save:async()=>{},archive:async()=>{}};
const nativeCampaignCatalog={list:async(a,kind,id)=>{calls.push([a,kind,id]);
 return a===actor&&kind==='npcs'&&id===campaign?[item]:[];}};
async function serve(callback){
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:actor}),revokeSession:async()=>{},
  campaigns,characters,nativeCampaignCatalog});
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});app.listen(0,'127.0.0.1');
 await once(app,'listening');
 try{await callback('http://127.0.0.1:'+app.address().port);}
 finally{await new Promise(resolve=>app.close(resolve));}
}
test('native campaign projection route: auth, validation and shape',async()=>{
 await serve(async base=>{
  const path=base+'/vtt/catalog/native/by-campaign/npcs/'+campaign;
  assert.equal((await fetch(path)).status,401);
  assert.deepEqual(await fetch(path,{headers:{cookie,origin}}).then(r=>r.json()),[item]);
  assert.equal((await fetch(base+'/vtt/catalog/native/by-campaign/npcs/bad',{headers:{cookie,origin}})).status,400);
  assert.equal((await fetch(path+'?after=x',{headers:{cookie,origin}})).status,400);
  assert.equal((await fetch(path,{method:'POST',headers:{cookie,origin},body:'{}'})).status,405);
  assert.deepEqual(calls,[[actor,'npcs',campaign]]);
 });
});
