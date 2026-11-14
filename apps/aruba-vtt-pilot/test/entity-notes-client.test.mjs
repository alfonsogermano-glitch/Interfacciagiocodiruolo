import test from 'node:test';
import assert from 'node:assert/strict';
import {listArubaEntityNotes,createArubaEntityNote,saveArubaEntityNote,archiveArubaEntityNote,setArubaSubtabOrder}
 from '../src/entity-notes-client.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const character='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
const id='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const note={id,tab_name:'Diario',content:'Test',content_rich:{type:'doc'},
 position:2,hidden:false,visibility:'private'};
const response=data=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>data});
test('Aruba notes client preserves original custom tab fields and cookie session',async()=>{
 let request;
 const list=await listArubaEntityNotes(async(url,options)=>{
  request={url,options};return response({notes:[note]});
 },campaign,character);
 assert.equal(list[0].tab_name,'Diario');
 assert.equal(list[0].folder_id,null);
 assert.equal(list[0].tab_order,null);
 assert.equal(request.options.credentials,'same-origin');
 assert.equal(new URL('https://example.test'+request.url).searchParams.get('characterId'),character);
 const created=await createArubaEntityNote(async(url,options)=>{
  request={url,options};return response({note});
 },campaign,character,' Diario ');
 assert.equal(created.id,id);
 assert.equal(JSON.parse(request.options.body).tabName,'Diario');
 const saved=await saveArubaEntityNote(async(url,options)=>{
  request={url,options};return response({note});
 },campaign,character,id,note);
 assert.equal(saved.content_rich.type,'doc');
 assert.deepEqual(Object.keys(JSON.parse(request.options.body)).sort(),
  ['campaignId','characterId','tabName','content','contentRich','position','hidden','visibility'].sort());
 assert.equal(JSON.parse(request.options.body).ownerId,undefined);
 const archived=await archiveArubaEntityNote(async(url,options)=>{
  request={url,options};return response({archivedId:id});
 },campaign,character,id);
 assert.equal(archived,id);assert.equal(request.options.method,'DELETE');
});
test('Aruba notes client rejects cross-object mismatches, bad IDs and HTML fallback',async()=>{
 await assert.rejects(()=>listArubaEntityNotes(async()=>{},campaign,'malformed'));
 await assert.rejects(()=>createArubaEntityNote(async()=>{},campaign,character,''));
 await assert.rejects(()=>saveArubaEntityNote(async()=>{},campaign,character,id,{}));
 await assert.rejects(()=>saveArubaEntityNote(async()=>response({note:{...note,id:campaign}}),
  campaign,character,id,note),/non corrispondente/);
 await assert.rejects(()=>archiveArubaEntityNote(async()=>response({archivedId:campaign}),
  campaign,character,id),/non confermata/);
 await assert.rejects(()=>listArubaEntityNotes(async()=>({ok:true,status:200,
  headers:{get:()=> 'text/html'},json:async()=>{throw SyntaxError('HTML')}}),
  campaign,character),/JSON/);
});

test('nested notes client uses parent identity only in scoped API paths and validates order',async()=>{
 const calls=[];
 const fetcher=async(path,options)=>{
  calls.push({path,options});
  if(options.method==='GET')return response({notes:[{...note,parent_note_id:id,tab_order:[]} ]});
  if(options.method==='POST')return response({note:{...note,parent_note_id:id}});
  return response({parentId:id,tabOrder:[id]});
 };
 const notes=await listArubaEntityNotes(fetcher,campaign,character,id);
 assert.equal(notes[0].parent_note_id,id);
 assert.equal(new URL('https://example.invalid'+calls[0].path).searchParams.get('parentId'),id);
 await createArubaEntityNote(fetcher,campaign,character,'Figlio',id);
 assert.equal(JSON.parse(calls[1].options.body).parentId,id);
 const order=await setArubaSubtabOrder(fetcher,campaign,character,id,[id]);
 assert.deepEqual(order,[id]);
 assert.equal(calls[2].path,'/vtt/entity-notes/order/'+id);
 await assert.rejects(()=>listArubaEntityNotes(fetcher,campaign,character,'invalid'));
 await assert.rejects(()=>setArubaSubtabOrder(fetcher,campaign,character,id,[id,id]));
});
