import test from 'node:test';
import assert from 'node:assert/strict';
import {listArubaCampaignNotes,createArubaCampaignNote,saveArubaCampaignNote,archiveArubaCampaignNote,moveArubaCampaignNoteToFolder,toOriginalCampaignNoteTab}
 from '../src/campaign-notes-client.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const parent='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const child='bb2f1a87-b8ee-4b34-9da0-07efda11379a';
const note={id:child,title:'Figlia',contentRich:{type:'doc'},position:0,parentId:parent,visibility:'private'};
const json=data=>({status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>data});
test('native campaign notes preserve parent and TipTap without leaking roles or owners',async()=>{
 const calls=[];
 const fetcher=async(path,options)=>{
  calls.push({path,options});
  if(options.method==='GET')return json({notes:[note]});
  if(options.method==='POST')return json({note});
  if(options.method==='PATCH')return json({savedId:child});
  return json({archivedId:child});
 };
 const items=await listArubaCampaignNotes(fetcher,campaign,parent);
 assert.equal(items[0].parentId,parent);
 assert.equal(items[0].campaignId,campaign);
 const made=await createArubaCampaignNote(fetcher,campaign,' Figlia ',parent);
 assert.equal(made.title,'Figlia');
 await saveArubaCampaignNote(fetcher,campaign,made);
 await archiveArubaCampaignNote(fetcher,campaign,child);
 assert.deepEqual(JSON.parse(calls[1].options.body),{campaignId:campaign,title:'Figlia',parentId:parent});
 assert.deepEqual(JSON.parse(calls[2].options.body),{campaignId:campaign,title:'Figlia',contentRich:{type:'doc'},position:0,visibility:'private'});
 for(const call of calls){
  assert.equal(call.options.credentials,'same-origin');
  assert.equal(call.options.redirect,'error');
  assert.doesNotMatch(call.path+String(call.options.body??''),/ownerId|role|token|entity-notes/);
 }
});
test('campaign note transport rejects mismatched parents and bad confirmations',async()=>{
 await assert.rejects(()=>listArubaCampaignNotes(async()=>json({notes:[note]}),campaign),/differente/);
 await assert.rejects(()=>listArubaCampaignNotes(async()=>json({notes:[note,note]}),campaign,parent),/duplicate/);
 await assert.rejects(()=>listArubaCampaignNotes(async()=>({status:401,ok:false}),campaign,parent),/scaduta/);
 await assert.rejects(()=>listArubaCampaignNotes(async()=>({status:200,ok:true,headers:{get:()=> 'text\/html'}}),campaign,parent),/JSON/);
 await assert.rejects(()=>listArubaCampaignNotes(async()=>{},campaign,'bad'),/non valido/);
 await assert.rejects(()=>createArubaCampaignNote(async()=>{},campaign,''),/non valido/);
 await assert.rejects(()=>saveArubaCampaignNote(async()=>{},parent,{...note,campaignId:campaign}),/differente/);
 await assert.rejects(()=>saveArubaCampaignNote(async()=>{},campaign,{...note,campaignId:campaign,contentRich:{text:'x'.repeat(50000)}}),/non validi/);
 await assert.rejects(()=>saveArubaCampaignNote(async()=>json({savedId:parent}),campaign,{...note,campaignId:campaign}),/non confermato/);
 await assert.rejects(()=>archiveArubaCampaignNote(async()=>json({archivedId:parent}),campaign,child),/non confermata/);
});

test('client keeps GM scope, folder IDs, and only trusted same-origin move body',async()=>{
 const campaignId=campaign,folderId=parent;
 const root={id:child,title:'Diario GM',parentId:null,contentRich:{type:'doc'},
  position:0,visibility:'private',scope:'gm',folderId:null};
 const calls=[];
 const fetcher=async(path,options)=>{
  calls.push({path,options});
  return json(options.method==='POST'?{note:root}:{noteId:child,folderId});
 };
 const created=await createArubaCampaignNote(fetcher,campaignId,'Diario GM',null,'gm');
 assert.equal(created.scope,'gm');
 assert.equal(created.folderId,null);
 assert.equal(JSON.parse(calls[0].options.body).scope,'gm');
 await moveArubaCampaignNoteToFolder(fetcher,campaignId,child,folderId);
 assert.equal(calls[1].path,'/vtt/campaign-notes/folder/'+child);
 assert.deepEqual(JSON.parse(calls[1].options.body),{campaignId,folderId});
 assert.equal(calls[1].options.credentials,'same-origin');
 await assert.rejects(()=>createArubaCampaignNote(fetcher,campaign,'Figlio',parent,'gm'),/non valida/);
 await assert.rejects(()=>moveArubaCampaignNoteToFolder(fetcher,campaign,child,'invalid'),/non valido/);
 await assert.rejects(()=>listArubaCampaignNotes(async()=>json({notes:[{...root,scope:'unknown'}]}),campaign),/non valida/);
});

test('original note contract preserves real creator, GM scope and rich text',()=>{
 const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
 const note={id:child,campaignId:campaign,title:'Diario GM',parentId:null,
  contentRich:{type:'doc'},position:2,visibility:'private',scope:'gm',
  folderId:parent,creatorId:owner,updatedAt:'2026-11-12T14:00:00.000Z'};
 const original=toOriginalCampaignNoteTab(note);
 assert.deepEqual(original,{
  id:child,tab_name:'Diario GM',content:'',content_rich:{type:'doc'},
  position:2,hidden:true,folder_id:parent,tab_order:null,
  owner_profile_id:owner,visibility:'private',updated_at:'2026-11-12T14:00:00.000Z',
 });
 assert.equal(toOriginalCampaignNoteTab({...note,scope:'shared'}).hidden,false);
 assert.equal(toOriginalCampaignNoteTab({...note,creatorId:null}).owner_profile_id,null);
 assert.throws(()=>toOriginalCampaignNoteTab({...note,creatorId:'fake'}),/non valida/);
 assert.throws(()=>toOriginalCampaignNoteTab({...note,folderId:'fake'}),/non valida/);
 assert.throws(()=>toOriginalCampaignNoteTab({...note,scope:'owner'}),/non valida/);
});
