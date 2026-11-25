import test from 'node:test';
import assert from 'node:assert/strict';
import {listArubaChapters,saveArubaChapter,deleteArubaChapter} from '../src/client.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const chapter='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const valid={id:chapter,campaignId:campaign,title:'Intro',description:'',notes:'',
 kind:'standard',isActive:false,nextChapterIds:[],mapUrl:null,mapMetadata:{},
  locationMetadata:{},createdAt:'2026-01-02T03:04:05.000Z',updatedAt:'2026-01-02T03:04:05.000Z'};
test('chapter maps from the known historical archive resolve to Aruba without contacting the old origin',async()=>{
 const legacy={...valid,mapUrl:'https://njcnkovruynhtsgzgrxi.supabase.co/storage/v1/object/public/visual-assets/owner/map.webp'};
 const calls=[];
 const rows=await listArubaChapters(async(url)=>{calls.push(url);return {
  status:200,ok:true,json:async()=>({chapters:[legacy]}),
 };},campaign);
 assert.equal(rows[0].mapUrl,'/vtt/migrated-media/visual-assets/owner/map.webp');
 assert.equal(legacy.mapUrl.startsWith('https://'),true,'do not mutate server snapshots');
 assert.deepEqual(calls,[`/vtt/campaigns/${campaign}/chapters`]);
});
test('Aruba chapter client uses same-origin cookie session for read and write',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push({url,opts});
  return {ok:true,status:200,json:async()=>opts.method==='GET'?{chapters:[]}:
   opts.method==='PUT'?{chapter:valid}:{deleted:true}};
 };
 assert.deepEqual(await listArubaChapters(fetchImpl,campaign),[]);
 await saveArubaChapter(fetchImpl,campaign,valid);
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
 await assert.rejects(()=>listArubaChapters(respond([valid,valid]),campaign),/non valida/);
 assert.equal((await listArubaChapters(respond([valid]),campaign)).length,1);
});

test('chapter save refuses mismatched campaign in server acknowledgement',async()=>{
 const forged=async()=>({ok:true,status:200,json:async()=>({chapter:{id:chapter,campaignId:'00000000-0000-4000-8000-000000000000'}})});
 await assert.rejects(()=>saveArubaChapter(forged,campaign,valid),/Conferma capitolo non valida/);
});

test('chapter save requires original Chapter fields in server acknowledgement',async()=>{
 const partial=async()=>({ok:true,status:200,json:async()=>({chapter:{id:chapter,campaignId:campaign}})});
 await assert.rejects(()=>saveArubaChapter(partial,campaign,valid),/Conferma capitolo non valida/);
});

test('chapter responses reject incomplete models, broken graph links and legacy map assets',async()=>{
 const respond=chapters=>async()=>({status:200,ok:true,json:async()=>({chapters})});
 for(const patch of [
  {kind:'invalid'},{description:undefined},{mapMetadata:[]},
  {nextChapterIds:[chapter]},{nextChapterIds:['bad']},
  {nextChapterIds:Array(101).fill(chapter)},
  {mapUrl:'https://old.supabase.co/storage/v1/object/public/map.webp'},
  {createdAt:'2026-01-02'},{locationMetadata:null},
 ]){
  const malformed={...valid,...patch};
  await assert.rejects(()=>listArubaChapters(respond([malformed]),campaign),/Risposta capitoli non valida/);
  await assert.rejects(()=>saveArubaChapter(async()=>({status:200,ok:true,json:async()=>({chapter:malformed})}),campaign,valid),/Conferma capitolo non valida/);
 }
});

test('Chapter browser refuses invalid drafts before sending requests',async()=>{
 let requests=0;
 const noFetch=()=>{requests++;throw Error('Unexpected network');};
 for(const patch of [
  {title:''},{kind:'invalid'},{mapUrl:'https://old.supabase.co/storage/map.webp'},
  {nextChapterIds:[chapter]},{mapMetadata:null},{notes:undefined},
  {createdAt:'2026-01-02'},{campaignId:'00000000-0000-4000-8000-000000000000'},
 ]){
  await assert.rejects(()=>saveArubaChapter(noFetch,campaign,{...valid,...patch}),/Capitolo non valido/);
 }
 assert.equal(requests,0);
});
test('Chapter browser allows omitted timestamps to be generated by the server',async()=>{
 const draft={...valid};delete draft.createdAt;delete draft.updatedAt;
 let sent;
 await saveArubaChapter(async(_url,opts)=>{
  sent=JSON.parse(opts.body);
  return {status:200,ok:true,json:async()=>({chapter:valid})};
 },campaign,draft);
 assert.equal(Object.hasOwn(sent,'createdAt'),false);
 assert.equal(Object.hasOwn(sent,'updatedAt'),false);
});
