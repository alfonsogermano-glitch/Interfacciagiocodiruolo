import test from 'node:test';
import assert from 'node:assert/strict';
import {listArubaCampaignNotes,createArubaCampaignNote,saveArubaCampaignNote,archiveArubaCampaignNote}
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
