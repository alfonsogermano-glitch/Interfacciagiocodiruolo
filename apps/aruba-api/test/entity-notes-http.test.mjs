import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const character='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
const note='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const cookie={cookie:'__Host-hg_session='+'A'.repeat(43)};
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
const characters={list:async()=>({characters:[]}),create:async()=>({}),save:async()=>({}),archive:async()=>({})};
async function server(handler,fn){
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await fn('http://127.0.0.1:'+app.address().port);}
 finally{await new Promise(resolve=>app.close(resolve));}
}
const handlerFor=entityNotes=>createAuthHttpHandler({origin,login:async()=>{},
 getSessionUser:async()=>({id:owner}),revokeSession:async()=>{},campaigns,characters,entityNotes});
test('notes API is disabled without an explicit staging service',async()=>{
 await server(handlerFor(null),async base=>{
  assert.equal((await fetch(base+'/vtt/entity-notes?campaignId='+campaign+'&characterId='+character,
   {headers:cookie})).status,404);
 });
});
test('notes endpoints use cookie identity and enforce origin for every mutation',async()=>{
 const calls=[];const entityNotes={
  list:async(...v)=>{calls.push(['list',...v]);return {notes:[]}},
  create:async(...v)=>{calls.push(['create',...v]);return {note:{id:note}}},
  save:async(...v)=>{calls.push(['save',...v]);return {note:{id:note}}},
  archive:async(...v)=>{calls.push(['archive',...v]);return {archivedId:note}},
 };
 await server(handlerFor(entityNotes),async base=>{
  const url=base+'/vtt/entity-notes';
  const query=url+'?campaignId='+campaign+'&characterId='+character;
  assert.equal((await fetch(query)).status,401);
  assert.equal((await fetch(query,{headers:cookie})).status,200);
  assert.equal((await fetch(query+'&ownerId=forged',{headers:cookie})).status,400);
  const common={method:'POST',headers:{...cookie,origin,'content-type':'application/json'},
    body:JSON.stringify({campaignId:campaign,characterId:character,tabName:'Diario'})};
  assert.equal((await fetch(url,{...common,headers:{...cookie,'content-type':'application/json'}})).status,403);
  assert.equal((await fetch(url,common)).status,201);
  assert.equal((await fetch(url,{...common,body:JSON.stringify({campaignId:campaign,characterId:character,tabName:'Diario',ownerId:owner})})).status,400);
  const edit={campaignId:campaign,characterId:character,tabName:'Diario',content:'',
    contentRich:{type:'doc'},position:0,hidden:false,visibility:'all'};
  const path=url+'/'+note;
  const editReq={method:'PATCH',headers:common.headers,body:JSON.stringify(edit)};
  assert.equal((await fetch(path,{...editReq,headers:{...cookie,origin:'https://evil.invalid','content-type':'application/json'}})).status,403);
  assert.equal((await fetch(path,editReq)).status,200);
  assert.equal((await fetch(path,{method:'DELETE',headers:common.headers,
    body:JSON.stringify({campaignId:campaign,characterId:character})})).status,200);
  assert.deepEqual(calls,[
   ['list',owner,campaign,character],
   ['create',owner,campaign,character,{tabName:'Diario'}],
   ['save',owner,campaign,character,note,{tabName:'Diario',content:'',contentRich:{type:'doc'},position:0,hidden:false,visibility:'all'}],
   ['archive',owner,campaign,character,note],
  ]);
 });
});

test('nested note HTTP accepts one scoped parentId and authenticated order updates',async()=>{
 const calls=[];const notes={
  list:async(...args)=>{calls.push(['list',...args]);return {notes:[]};},
  create:async(...args)=>{calls.push(['create',...args]);return {note:{id:note}};},
  save:async()=>{throw Error('not needed');},
  archive:async()=>{throw Error('not needed');},
  setSubtabOrder:async(...args)=>{calls.push(['order',...args]);return {parentId:note,tabOrder:[note]};},
 };
 await server(handlerFor(notes),async base=>{
  const url=base+'/vtt/entity-notes';
  const query=url+'?campaignId='+campaign+'&characterId='+character+'&parentId='+note;
  assert.equal((await fetch(query,{headers:cookie})).status,200);
  assert.equal((await fetch(query+'&parentId='+note,{headers:cookie})).status,400);
  const headers={...cookie,origin,'content-type':'application/json'};
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({
    campaignId:campaign,characterId:character,tabName:'Sotto-tab',parentId:note,
  })})).status,201);
  assert.equal((await fetch(url+'/order/'+note,{method:'PATCH',headers,
    body:JSON.stringify({campaignId:campaign,characterId:character,tabOrder:[note]})})).status,200);
  assert.equal((await fetch(url+'/order/'+note,{method:'PATCH',
    headers:{...headers,origin:'https://wrong.example'},
    body:JSON.stringify({campaignId:campaign,characterId:character,tabOrder:[note]})})).status,403);
 });
 assert.deepEqual(calls,[
  ['list',owner,campaign,character,note],
  ['create',owner,campaign,character,{tabName:'Sotto-tab',parentId:note}],
  ['order',owner,campaign,character,note,[note]],
 ]);
});
