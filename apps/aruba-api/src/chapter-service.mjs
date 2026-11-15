import {validateChapterDraft,ChapterRejected} from './chapter-contract.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgreSQL implementation is intentionally not exposed over HTTP yet.
// The owner check must precede every read/write, including empty collections.
export function createChapterService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 const requireId=(id,label)=>{if(typeof id!=='string'||!UUID.test(id))throw new ChapterRejected(label+' non valido');return id;};
 async function assertOwner(ownerId,campaignId){
  requireId(ownerId,'Utente');requireId(campaignId,'Campagna');
  const result=await pool.query('SELECT hollowgate_vtt.chapter_owner_authorized($1,$2) AS allowed',[ownerId,campaignId]);
  if(result.rows[0]?.allowed!==true)throw new ChapterRejected('Campagna non autorizzata',404);
 }
 async function list(ownerId,campaignId){
  await assertOwner(ownerId,campaignId);
  const result=await pool.query('SELECT id,campaign_id,payload FROM hollowgate_vtt.list_owned_chapter_documents($1,$2)',[ownerId,campaignId]);
  return {chapters:result.rows.map(row=>({...row.payload,id:row.id,campaignId:row.campaign_id}))};
 }
 async function save(ownerId,campaignId,draft){
  const chapter=validateChapterDraft(campaignId,draft);
  await assertOwner(ownerId,campaignId);
  // The graph must never point to a chapter in another campaign or to a missing chapter.
  if(chapter.nextChapterIds.length){
   const linked=await pool.query(
    'SELECT id FROM hollowgate_vtt.list_owned_chapter_links($1,$2,$3::uuid[])',
    [ownerId,campaignId,chapter.nextChapterIds]);
   if(linked.rows.length!==chapter.nextChapterIds.length)
    throw new ChapterRejected('Collegamenti a capitoli non validi');
  }
  const result=await pool.query(
   'SELECT hollowgate_vtt.save_owned_chapter_document($1,$2,$3,$4::jsonb) AS id',
   [ownerId,campaignId,chapter.id,JSON.stringify(chapter)]);
  if(result.rows[0]?.id!==chapter.id)throw new Error('Chapter write failed');
  return {chapter};
 }
 async function remove(ownerId,campaignId,chapterId){
  requireId(chapterId,'Capitolo');
  await assertOwner(ownerId,campaignId);
  const result=await pool.query(
   'SELECT hollowgate_vtt.delete_owned_chapter_document($1,$2,$3) AS id',
   [ownerId,campaignId,chapterId]);
  if(result.rows[0]?.id!==chapterId)throw new ChapterRejected('Capitolo non trovato',404);
  return {deleted:true};
 }
 return {list,save,remove};
}
