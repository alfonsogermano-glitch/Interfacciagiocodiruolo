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
  listForMember:async(...args)=>{called.push(['listForMember',...args]);return {notes:[]}},
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
  ['listForMember',owner,campaign,null],
  ['listForMember',owner,campaign,parent],
  ['create',owner,campaign,{title:'Nota',parentId:null}],
  ['save',owner,campaign,parent,{title:'Nota',contentRich:{type:'doc'},position:0,visibility:'private'}],
  ['archive',owner,campaign,parent],
 ]);
});

test('HTTP GET notes is limited to authenticated DB-member reader, while writes remain owner-only',async()=>{
 const member='cc2f1a87-b8ee-4b34-9da0-07efda11379a';
 const calls=[];
 // The fake DB-filtering service returns only permitted notes.
 const notes={
  listForMember:async(...args)=>{calls.push(['member-read',...args]);return {notes:[{id:parent,title:'Condivisa',visibility:'all'}]};},
  create:async(...args)=>{calls.push(['owner-create',...args]);return {note:{id:parent}};},
  save:async(...args)=>{calls.push(['owner-save',...args]);return {savedId:parent};},
  archive:async(...args)=>{calls.push(['owner-archive',...args]);return {archivedId:parent};},
 };
 const app=createApp({checkDatabase:async()=>{},authHandler:createAuthHttpHandler({
  origin,login:async()=>{},getSessionUser:async()=>({id:member}),
  revokeSession:async()=>{},campaigns,campaignNotes:notes,
 })});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 try{
  const base='http://127.0.0.1:'+app.address().port+'/vtt/campaign-notes';
  const response=await fetch(base+'?campaignId='+campaign,{headers:cookie});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).notes,[{id:parent,title:'Condivisa',visibility:'all'}]);
  assert.deepEqual(calls,[['member-read',member,campaign,null]]);
  const forged=await fetch(base+'?campaignId='+campaign+'&role=gm',{headers:cookie});
  assert.equal(forged.status,400);
  assert.equal(calls.length,1);
 }finally{await new Promise(resolve=>app.close(resolve));}
});
test('campaign note HTTP rejects an implementation lacking member-scoped reads',()=>{
 assert.throws(()=>createAuthHttpHandler({
  origin,login:async()=>{},getSessionUser:async()=>null,revokeSession:async()=>{},
  campaigns,campaignNotes:{list:async()=>{},create:async()=>{},save:async()=>{},archive:async()=>{}},
 }),/Invalid campaign notes service/);
});

test('root GM Note creation and folder moves are session scoped and CSRF protected',async()=>{
 const calls=[];
 const notes={
  listForMember:async()=>({notes:[]}),
  create:async(...args)=>{calls.push(['create',...args]);return {note:{id:parent}};},
  save:async()=>{},archive:async()=>{},
  moveToFolder:async(...args)=>{calls.push(['move',...args]);return {noteId:parent,folderId:parent};},
 };
 await server(notes,async base=>{
  const path=base+'/vtt/campaign-notes';
  const root={campaignId:campaign,title:'Segreti',parentId:null,scope:'gm'};
  assert.equal((await fetch(path,{method:'POST',headers:header,
   body:JSON.stringify(root)})).status,201);
  const bad={campaignId:campaign,title:'Figlio',parentId:parent,scope:'gm'};
  assert.equal((await fetch(path,{method:'POST',headers:header,
   body:JSON.stringify({...bad,ownerId:owner})})).status,400);
  const movePath=path+'/folder/'+parent;
  assert.equal((await fetch(movePath,{method:'PATCH',headers:cookie})).status,403);
  assert.equal((await fetch(movePath,{method:'PATCH',headers:header,
   body:JSON.stringify({campaignId:campaign,folderId:parent,role:'gm'})})).status,400);
  assert.equal((await fetch(movePath,{method:'PATCH',headers:header,
   body:JSON.stringify({campaignId:campaign,folderId:parent})})).status,200);
 });
 assert.deepEqual(calls,[
  ['create',owner,campaign,{title:'Segreti',parentId:null,scope:'gm'}],
  ['move',owner,campaign,parent,parent],
 ]);
});

test('member Note title icon and subtab order are session-scoped and origin protected',async()=>{
 const calls=[];
 const notes={
  listForMember:async()=>({notes:[]}),create:async()=>{},save:async()=>{},
  archive:async()=>{},
  setTitleIcon:async(...args)=>{calls.push(['icon',...args]);return {noteId:parent,titleIcon:args[3]}},
  setSubtabOrder:async(...args)=>{calls.push(['order',...args]);return {noteId:parent,tabOrder:args[3]}},
 };
 await server(notes,async base=>{
  const path=base+'/vtt/campaign-notes';
  assert.equal((await fetch(path+'/icon/'+parent,{method:'PATCH',headers:cookie})).status,403);
  assert.equal((await fetch(path+'/icon/'+parent,{method:'PATCH',headers:header,
   body:JSON.stringify({campaignId:campaign,titleIcon:'book-open',role:'gm'})})).status,400);
  assert.equal((await fetch(path+'/icon/'+parent,{method:'PATCH',headers:header,
   body:JSON.stringify({campaignId:campaign,titleIcon:'book-open'})})).status,200);
  assert.equal((await fetch(path+'/order/'+parent,{method:'PATCH',headers:header,
   body:JSON.stringify({campaignId:campaign,tabOrder:[parent],creatorId:owner})})).status,400);
  assert.equal((await fetch(path+'/order/'+parent,{method:'PATCH',headers:header,
   body:JSON.stringify({campaignId:campaign,tabOrder:[parent]})})).status,200);
 });
 assert.deepEqual(calls,[['icon',owner,campaign,parent,'book-open'],
  ['order',owner,campaign,parent,[parent]]]);
});

test('campaign Note section switch requires same-origin GM authorization via SQL',async()=>{
 const calls=[];
 const notes={listForMember:async()=>({notes:[]}),create:async()=>{},save:async()=>{},archive:async()=>{},
  changeScope:async(...args)=>{calls.push(args);return {noteId:parent,scope:args[3]}},
 };
 await server(notes,async base=>{
  const url=base+'/vtt/campaign-notes/scope/'+parent;
  assert.equal((await fetch(url,{method:'PATCH',headers:cookie})).status,403);
  assert.equal((await fetch(url,{method:'PATCH',headers:header,
   body:JSON.stringify({campaignId:campaign,scope:'gm',role:'gm'})})).status,400);
  assert.equal((await fetch(url,{method:'PATCH',headers:header,
   body:JSON.stringify({campaignId:campaign,scope:'invalid'})})).status,400);
  assert.equal((await fetch(url,{method:'PATCH',headers:header,
   body:JSON.stringify({campaignId:campaign,scope:'gm'})})).status,200);
 });
 assert.deepEqual(calls,[[owner,campaign,parent,'gm']]);
});
