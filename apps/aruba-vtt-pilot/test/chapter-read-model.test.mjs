import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeChapterReadModel} from '../src/chapter-read-model.mjs';
import {listArubaChapters} from '../src/client.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const chapter={
 id:'4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42',campaignId:campaign,
 title:'Importato',description:'Testo originale',notes:'Note originali',
 kind:'standard',isActive:true,nextChapterIds:[],
 mapUrl:'https://njcnkovruynhtsgzgrxi.supabase.co/storage/v1/object/public/visual-assets/map.webp',
 mapMetadata:{},locationMetadata:{},
 created_at:'2026-01-02T03:04:05.123456+00:00',updated_at:'2026-01-03T04:05:06+00:00',
};
const fetchChapter=value=>async()=>({ok:true,status:200,json:async()=>({chapters:[value]})});
test('migrated chapter dates and map URLs are adapted without mutating source records',async()=>{
 const before=structuredClone(chapter);
 const [result]=await listArubaChapters(fetchChapter(chapter),campaign);
 assert.equal(result.createdAt,'2026-01-02T03:04:05.123Z');
 assert.equal(result.updatedAt,'2026-01-03T04:05:06.000Z');
 assert.equal(result.mapUrl,'/vtt/migrated-media/visual-assets/map.webp');
 assert.equal(result.description,chapter.description);
 assert.equal(result.notes,chapter.notes);
 assert.deepEqual(chapter,before);
});
test('modern fields remain authoritative, including malformed values that must be rejected',async()=>{
 for(const createdAt of [null,undefined,'bad','2026-01-02']){
  const value={...chapter,createdAt};
  assert.equal(normalizeChapterReadModel(value).createdAt,createdAt);
  await assert.rejects(()=>listArubaChapters(fetchChapter(value),campaign),/non valida/);
 }
});
test('missing dates are never generated from the current clock',async()=>{
 const value={...chapter};delete value.created_at;
 assert.equal(Object.hasOwn(normalizeChapterReadModel(value),'createdAt'),false);
 await assert.rejects(()=>listArubaChapters(fetchChapter(value),campaign),/non valida/);
});
test('legacy normalization rejects invalid calendars, date-only values and arbitrary strings',async()=>{
 for(const created_at of ['2026-02-30T00:00:00+00:00','2026-01-02T24:00:00Z','2026-01-02','yesterday']){
  await assert.rejects(()=>listArubaChapters(fetchChapter({...chapter,created_at}),campaign),/non valida/);
 }
});
test('timestamp adaptation never relaxes campaign identity or other chapter checks',async()=>{
 await assert.rejects(()=>listArubaChapters(fetchChapter({...chapter,campaignId:'00000000-0000-4000-8000-000000000000'}),campaign),/non valida/);
 await assert.rejects(()=>listArubaChapters(fetchChapter({...chapter,kind:'bad'}),campaign),/non valida/);
});
