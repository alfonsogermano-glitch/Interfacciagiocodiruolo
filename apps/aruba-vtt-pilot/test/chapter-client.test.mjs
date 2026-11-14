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
   opts.method==='PUT'?{chapter:{id:chapter}}:{deleted:true}};
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
