import test from 'node:test';
import assert from 'node:assert/strict';
import {listArubaChapters,saveArubaChapter,deleteArubaChapter} from '../src/client.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const chapter='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
test('Aruba chapter client uses same-origin cookie session for read and write',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push({url,opts});
  return {ok:true,status:200,json:async()=>opts.method==='GET'?{chapters:[]}:
   opts.method==='PUT'?{chapter:{id:chapter,campaignId:campaign}}:{deleted:true}};
 };
 assert.deepEqual(await listArubaChapters(fetchImpl,campaign),[]);
 await saveArubaChapter(fetchImpl,campaign,{id:chapter,title:'Intro'});
 assert.equal(await deleteArubaChapter(fetchImpl,campaign,chapter),true);
 assert.deepEqual(calls.map(c=>c.opts.method),['GET','PUT','DELETE']);
 assert.ok(calls.every(c=>c.opts.credentials==='same-origin'&&c.opts.redirect==='error'));
 assert.ok(calls.every(c=>c.url.startsWith('/vtt/campaigns/'+campaign+'/chapters')));
});
test('Aruba chapter client rejects invalid IDs before HTTP and fails closed',async()=>{
 const noFetch=()=>{throw Error('Unexpected network');};
 await assert.rejects(()=>listArubaChapters(noFetch,'bad'));
 await assert.rejects(()=>deleteArubaChapter(noFetch,campaign,'bad'));
 await assert.rejects(()=>saveArubaChapter(noFetch,campaign,null));
 await assert.rejects(()=>listArubaChapters(async()=>({status:401,ok:false}),campaign),/Sessione scaduta/);
 await assert.rejects(()=>listArubaChapters(async()=>({status:200,ok:true,json:async()=>({chapters:'bad'})}),campaign),/non valida/);
});

test('chapter list rejects cross-campaign documents, malformed IDs and duplicates',async()=>{
 const respond=chapters=>async()=>({status:200,ok:true,json:async()=>({chapters})});
 await assert.rejects(()=>listArubaChapters(respond([{id:chapter,campaignId:'00000000-0000-4000-8000-000000000000'}]),campaign),/non valida/);
 await assert.rejects(()=>listArubaChapters(respond([{id:'bad',campaignId:campaign}]),campaign),/non valida/);
 await assert.rejects(()=>listArubaChapters(respond([{id:chapter,campaignId:campaign},{id:chapter,campaignId:campaign}]),campaign),/non valida/);
 assert.equal((await listArubaChapters(respond([{id:chapter,campaignId:campaign}]),campaign)).length,1);
});

test('chapter save refuses mismatched campaign in server acknowledgement',async()=>{
 const forged=async()=>({ok:true,status:200,json:async()=>({chapter:{id:chapter,campaignId:'00000000-0000-4000-8000-000000000000'}})});
 await assert.rejects(()=>saveArubaChapter(forged,campaign,{id:chapter,title:'Intro'}),/Conferma capitolo non valida/);
});
