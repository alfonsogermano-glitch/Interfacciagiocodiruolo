import {validateChapterDraft,ChapterRejected} from './chapter-contract.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgreSQL implementation is intentionally not exposed over HTTP yet.
// The owner check must precede every read/write, including empty collections.
export function createChapterService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 const requireId=(id,label)=>{if(typeof id!=='string'||!UUID.test(id))throw new ChapterRejected(label+' non valido');return id;};
 async function assertOwner(ownerId,campaignId){
  requireId(ownerId,'Utente');requireId(campaignId,'Campagna');
  const result=await pool.query('SELECT id FROM hollowgate_vtt.campaigns WHERE id=$1 AND owner_id=$2',[campaignId,ownerId]);
  if(result.rows.length!==1)throw new ChapterRejected('Campagna non autorizzata',404);
 }
 async function list(ownerId,campaignId){
  await assertOwner(ownerId,campaignId);
  const result=await pool.query('SELECT id,campaign_id,payload FROM hollowgate_vtt.chapter_documents WHERE campaign_id=$1 ORDER BY id',[campaignId]);
  return {chapters:result.rows.map(row=>({...row.payload,id:row.id,campaignId:row.campaign_id}))};
 }
 async function save(ownerId,campaignId,draft){
  const chapter=validateChapterDraft(campaignId,draft);
  await assertOwner(ownerId,campaignId);
  // The graph must never point to a chapter in another campaign or to a missing chapter.
  if(chapter.nextChapterIds.length){
   const linked=await pool.query(
    'SELECT id FROM hollowgate_vtt.chapter_documents WHERE campaign_id=$1 AND id=ANY($2::uuid[])',
    [campaignId,chapter.nextChapterIds]);
   if(linked.rows.length!==chapter.nextChapterIds.length)
    throw new ChapterRejected('Collegamenti a capitoli non validi');
  }
  const result=await pool.query(
   'INSERT INTO hollowgate_vtt.chapter_documents(id,campaign_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT (id,campaign_id) DO UPDATE SET payload=EXCLUDED.payload RETURNING id',
   [chapter.id,campaignId,JSON.stringify(chapter)]);
  if(result.rows.length!==1)throw new Error('Chapter write failed');
  return {chapter};
 }
 async function remove(ownerId,campaignId,chapterId){
  requireId(chapterId,'Capitolo');
  await assertOwner(ownerId,campaignId);
  const result=await pool.query(
   'DELETE FROM hollowgate_vtt.chapter_documents WHERE id=$1 AND campaign_id=$2 RETURNING id',
   [chapterId,campaignId]);
  if(result.rows.length!==1)throw new ChapterRejected('Capitolo non trovato',404);
  return {deleted:true};
 }
 return {list,save,remove};
}
