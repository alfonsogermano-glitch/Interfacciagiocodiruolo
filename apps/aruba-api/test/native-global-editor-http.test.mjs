import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';

const origin='https://www.hollowgate.quest',actor='22000000-0000-4000-8000-000000000001';
const campaign='22000000-0000-4000-8000-000000000002';
const id='22000000-0000-4000-8000-000000000003';
const item={kind:'npcs',id,ownerId:actor,campaignId:campaign,name:'Custode',revision:2,status:'active',
 data:{description:'d'},createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
const cookie='__Host-hg_session='+'A'.repeat(43);
const calls=[];
const service={
 list:async(a,kind,after)=>{calls.push(['list',a,kind]);return [item];},
 mediaRead:async(a,kind,i,role)=>{calls.push(['mediaRead',a,i,role]);return {mimeType:'image/png',dataBase64:'AAA=',revision:2};},
 mediaSave:async(a,kind,i,body,role)=>{calls.push(['mediaSave',a,i,role]);return item;},
 notesList:async(a,kind,i)=>{calls.push(['notesList',a,i]);return {item,notes:[]};},
 noteCreate:async(a,kind,i,body)=>{calls.push(['noteCreate',a,i]);return {item,note:{id:'22000000-0000-4000-8000-000000000004',tab_name:'Nota'}};},
 noteSave:async(a,kind,i,noteId,body)=>{calls.push(['noteSave',a,noteId]);return {id:noteId};},
};
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
const characters={list:async()=>({characters:[]}),create:async()=>{},save:async()=>{},archive:async()=>{}};
async function serve(callback){
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:actor}),revokeSession:async()=>{},
  campaigns,characters,nativeGlobalEditor:service});
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});app.listen(0,'127.0.0.1');
 await once(app,'listening');
 try{await callback('http://127.0.0.1:'+app.address().port);}
 finally{await new Promise(resolve=>app.close(resolve));}
}
test('native global editor route: auth, validation and shape',async()=>{
 await serve(async base=>{
  const path=base+'/vtt/catalog/native/global/npcs';
  assert.equal((await fetch(path)).status,401);
  assert.deepEqual(await fetch(path,{headers:{cookie,origin}}).then(r=>r.json()),[item]);
  assert.equal((await fetch(base+'/vtt/catalog/native/global/npcs/bad',{headers:{cookie,origin}})).status,400);
  assert.equal((await fetch(path,{method:'DELETE',headers:{cookie,origin}})).status,405);
  assert.equal((await fetch(base+'/vtt/catalog/native/global/npcs/'+id+'/media/portrait',{headers:{cookie,origin}})).status,200);
  assert.equal((await fetch(base+'/vtt/catalog/native/global/npcs/'+id+'/notes',{headers:{cookie,origin}})).status,200);
  assert.ok(calls.length>0);
 });
});
