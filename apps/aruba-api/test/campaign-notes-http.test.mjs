import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const parent='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const cookie={cookie:'__Host-hg_session='+'A'.repeat(43)};
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
async function server(notes,callback){
 const app=createApp({checkDatabase:async()=>{},authHandler:createAuthHttpHandler({
  origin,login:async()=>{},getSessionUser:async()=>({id:owner}),
  revokeSession:async()=>{},campaigns,campaignNotes:notes,
 })});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await callback('http://127.0.0.1:'+app.address().port);}
 finally{await new Promise(resolve=>app.close(resolve));}
}
const header={...cookie,origin,'content-type':'application/json'};
test('campaign notes endpoints stay absent unless explicitly enabled',async()=>{
 await server(null,async base=>{
  assert.equal((await fetch(base+'/vtt/campaign-notes?campaignId='+campaign,{headers:cookie})).status,404);
  const boot=await fetch(base+'/vtt/bootstrap',{headers:cookie});
  assert.equal((await boot.json()).capabilities.campaignNotes.read,false);
 });
});
test('campaign notes session, Origin, exact query and body cannot be bypassed',async()=>{
 const called=[];
 const notes={
  list:async(...args)=>{called.push(['list',...args]);return {notes:[]}},
  create:async(...args)=>{called.push(['create',...args]);return {note:{id:parent}}},
  save:async(...args)=>{called.push(['save',...args]);return {savedId:parent}},
  archive:async(...args)=>{called.push(['archive',...args]);return {archivedId:parent}},
 };
 await server(notes,async base=>{
  const path=base+'/vtt/campaign-notes';
  const query=path+'?campaignId='+campaign;
  assert.equal((await fetch(query)).status,401);
  assert.equal((await fetch(query,{headers:cookie})).status,200);
  assert.equal((await fetch(query+'&ownerId='+owner,{headers:cookie})).status,400);
  assert.equal((await fetch(query+'&parentId='+parent,{headers:cookie})).status,200);
  assert.equal((await fetch(query+'&parentId='+parent+'&parentId='+parent,{headers:cookie})).status,400);
  const body={campaignId:campaign,title:'Nota',parentId:null};
  assert.equal((await fetch(path,{method:'POST',headers:cookie})).status,403);
  assert.equal((await fetch(path,{method:'POST',headers:header,body:JSON.stringify({...body,ownerId:owner})})).status,400);
  assert.equal((await fetch(path,{method:'POST',headers:header,body:JSON.stringify(body)})).status,201);
  const patch={campaignId:campaign,title:'Nota',contentRich:{type:'doc'},position:0,visibility:'private'};
  assert.equal((await fetch(path+'/'+parent,{method:'PATCH',
   headers:{...header,origin:'https://attacker.invalid'},body:JSON.stringify(patch)})).status,403);
  assert.equal((await fetch(path+'/'+parent,{method:'PATCH',headers:header,
   body:JSON.stringify(patch)})).status,200);
  assert.equal((await fetch(path+'/'+parent,{method:'DELETE',headers:header,
   body:JSON.stringify({campaignId:campaign})})).status,200);
  const boot=await fetch(base+'/vtt/bootstrap',{headers:cookie});
  assert.equal((await boot.json()).capabilities.campaignNotes.read,true);
 });
 assert.deepEqual(called,[
  ['list',owner,campaign,null],
  ['list',owner,campaign,parent],
  ['create',owner,campaign,{title:'Nota',parentId:null}],
  ['save',owner,campaign,parent,{title:'Nota',contentRich:{type:'doc'},position:0,visibility:'private'}],
  ['archive',owner,campaign,parent],
 ]);
});
