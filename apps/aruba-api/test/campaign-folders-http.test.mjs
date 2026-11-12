import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const userId='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const folder='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const cookie={cookie:'__Host-hg_session='+'A'.repeat(43)};
const mutable={...cookie,origin,'content-type':'application/json'};
const campaigns={list:async()=>{},create:async()=>{},update:async()=>{}};
const notes={listForMember:async()=>{},create:async()=>{},save:async()=>{},archive:async()=>{}};
async function withServer(folders,run){
 const app=createApp({checkDatabase:async()=>{},authHandler:createAuthHttpHandler({
  origin,login:async()=>{},getSessionUser:async()=>({id:userId}),
  revokeSession:async()=>{},campaigns,campaignNotes:notes,campaignFolders:folders,
 })});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await run('http://127.0.0.1:'+app.address().port);}
 finally{await new Promise(resolve=>app.close(resolve));}
}
test('folder API absent until independently opted in',async()=>{
 await withServer(null,async base=>{
  const res=await fetch(base+'/vtt/campaign-note-folders?campaignId='+campaign+'&scope=shared',{headers:cookie});
  assert.equal(res.status,404);
  const bootstrap=await fetch(base+'/vtt/bootstrap',{headers:cookie});
  assert.equal((await bootstrap.json()).capabilities.campaignNoteFolders.read,false);
 });
});
test('folders HTTP scope comes only from session; no forged ownership, role or CSRF',async()=>{
 const calls=[];
 const folders={
  list:async(...args)=>{calls.push(['list',...args]);return {folders:[]}},
  create:async(...args)=>{calls.push(['create',...args]);return {folderId:folder}},
  update:async(...args)=>{calls.push(['update',...args]);return {folderId:folder}},
  presentation:async(...args)=>{calls.push(['presentation',...args]);return {folderId:folder}},
  archive:async(...args)=>{
   if(typeof args[2]?.cascade!=='boolean')throw Object.assign(new Error('Invalid cascade'),{status:400});
   calls.push(['archive',...args]);return {archivedId:folder};
  },
 };
 await withServer(folders,async base=>{
  const path=base+'/vtt/campaign-note-folders';
  const q=path+'?campaignId='+campaign+'&scope=shared';
  assert.equal((await fetch(q)).status,401);
  assert.equal((await fetch(q,{headers:cookie})).status,200);
  assert.equal((await fetch(q+'&role=gm',{headers:cookie})).status,400);
  assert.equal((await fetch(q+'&scope=gm',{headers:cookie})).status,400);
  const body={campaignId:campaign,scope:'shared',name:'Archivio',parentId:null};
  assert.equal((await fetch(path,{method:'POST',headers:cookie})).status,403);
  assert.equal((await fetch(path,{method:'POST',headers:mutable,
   body:JSON.stringify({...body,ownerId:userId})})).status,400);
  assert.equal((await fetch(path,{method:'POST',headers:mutable,body:JSON.stringify(body)})).status,201);
  assert.equal((await fetch(path+'/'+folder,{method:'PATCH',
   headers:{...mutable,origin:'https://attacker.invalid'},
   body:JSON.stringify({campaignId:campaign,name:'X',parentId:null})})).status,403);
  assert.equal((await fetch(path+'/'+folder,{method:'PATCH',headers:mutable,
   body:JSON.stringify({campaignId:campaign,name:'X',parentId:null})})).status,200);
  const presentation=path+'/presentation/'+folder;
  assert.equal((await fetch(presentation,{method:'PATCH',headers:{...mutable,
   origin:'https://hostile.invalid'},body:JSON.stringify({campaignId:campaign,icon:null,position:0})})).status,403);
  assert.equal((await fetch(presentation,{method:'PATCH',headers:mutable,
   body:JSON.stringify({campaignId:campaign,icon:'notebook',position:2,ownerId:userId})})).status,400);
  assert.equal((await fetch(presentation,{method:'PATCH',headers:mutable,
   body:JSON.stringify({campaignId:campaign,icon:'notebook',position:2})})).status,200);
  assert.equal((await fetch(path+'/'+folder,{method:'DELETE',headers:cookie})).status,403);
  assert.equal((await fetch(path+'/'+folder,{method:'DELETE',headers:mutable,
   body:JSON.stringify({campaignId:campaign,cascade:'false'})})).status,400);
  assert.equal((await fetch(path+'/'+folder,{method:'DELETE',headers:mutable,
   body:JSON.stringify({campaignId:campaign,cascade:false,role:'gm'})})).status,400);
  assert.equal((await fetch(path+'/'+folder,{method:'DELETE',headers:mutable,
   body:JSON.stringify({campaignId:campaign,cascade:true})})).status,200);
  const bootstrap=await fetch(base+'/vtt/bootstrap',{headers:cookie});
  assert.equal((await bootstrap.json()).capabilities.campaignNoteFolders.read,true);
 });
 assert.deepEqual(calls,[['list',userId,campaign,'shared'],
  ['create',userId,{campaignId:campaign,scope:'shared',name:'Archivio',parentId:null}],
  ['update',userId,folder,{campaignId:campaign,name:'X',parentId:null}],
  ['presentation',userId,folder,{campaignId:campaign,icon:'notebook',position:2}],
  ['archive',userId,folder,{campaignId:campaign,cascade:true}]]);
});
