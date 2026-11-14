import test from 'node:test';
import assert from 'node:assert/strict';
import {listArubaScenes,saveArubaScene,deleteArubaScene} from '../src/client.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const chapter='5b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const scene='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const valid={id:scene,campaignId:campaign,chapterId:chapter,title:'Intro',createdAt:'2026-01-02T03:04:05.000Z',updatedAt:'2026-01-02T03:04:05.000Z'};
test('Scene client uses authenticated same-origin routes',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push({url,opts});
  return {status:200,ok:true,json:async()=>opts.method==='GET'?{scenes:[valid]}:
    opts.method==='PUT'?{scene:valid}:{deleted:true}};
 };
 assert.deepEqual(await listArubaScenes(fetchImpl,campaign),[valid]);
 assert.deepEqual(await saveArubaScene(fetchImpl,campaign,valid),valid);
 assert.equal(await deleteArubaScene(fetchImpl,campaign,scene),true);
 assert.deepEqual(calls.map(c=>c.opts.method),['GET','PUT','DELETE']);
 assert.ok(calls.every(c=>c.opts.credentials==='same-origin'&&c.opts.redirect==='error'));
 assert.ok(calls.every(c=>c.url.startsWith('/vtt/campaigns/'+campaign+'/scenes')));
});
test('Scene client rejects forged campaign, chapter and duplicate IDs',async()=>{
 const respond=scenes=>async()=>({status:200,ok:true,json:async()=>({scenes})});
 await assert.rejects(()=>listArubaScenes(respond([valid,valid]),campaign),/non valida/);
 await assert.rejects(()=>listArubaScenes(respond([{...valid,campaignId:chapter}]),campaign),/non valida/);
 await assert.rejects(()=>listArubaScenes(respond([{...valid,chapterId:'bad'}]),campaign),/non valida/);
 await assert.rejects(()=>saveArubaScene(async()=>{throw Error('network');},campaign,{...valid,campaignId:chapter}),/non valida/);
 await assert.rejects(()=>saveArubaScene(async()=>({status:200,ok:true,json:async()=>({scene:{...valid,chapterId:scene}})}),campaign,valid),/Conferma scena non valida/);
});
test('Scene client fails closed on invalid IDs and expired sessions',async()=>{
 const noFetch=()=>{throw Error('Unexpected network');};
 await assert.rejects(()=>listArubaScenes(noFetch,'bad'));
 await assert.rejects(()=>deleteArubaScene(noFetch,campaign,'bad'));
 await assert.rejects(()=>saveArubaScene(noFetch,campaign,null));
 await assert.rejects(()=>listArubaScenes(async()=>({status:401,ok:false}),campaign),/Sessione scaduta/);
});
