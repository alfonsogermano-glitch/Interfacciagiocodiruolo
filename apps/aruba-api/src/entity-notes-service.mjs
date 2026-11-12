import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeId=(id,field)=>{if(typeof id!=='string'||!UUID.test(id))throw new CampaignRejected(field+' non valido',400);return id;};
const mapped=row=>({
 id:row.id,tab_name:row.tab_name,content:row.content,content_rich:row.content_rich,
 position:row.tab_position,hidden:row.hidden,visibility:row.visibility,
 parent_note_id:row.parent_note_id??null,tab_order:row.tab_order??null,
 created_at:row.created_at,updated_at:row.updated_at,
});
export function createEntityNotesService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 async function list(ownerId,campaignId,characterId,parentId=null){
  safeId(ownerId,'Utente');safeId(campaignId,'Campagna');safeId(characterId,'Personaggio');
  if(parentId!==null)safeId(parentId,'Nota padre');
  const {rows}=await pool.query('SELECT * FROM hollowgate_vtt.list_owned_character_notes_v2($1,$2,$3,$4)',
   [ownerId,campaignId,characterId,parentId]);
  return {notes:rows.map(mapped)};
 }
 async function create(ownerId,campaignId,characterId,body){
  safeId(ownerId,'Utente');safeId(campaignId,'Campagna');safeId(characterId,'Personaggio');
  if(!body||typeof body!=='object'||Array.isArray(body)||
    !['tabName','parentId,tabName'].includes(Object.keys(body).sort().join(','))||
    (body.parentId!==undefined&&body.parentId!==null&&!UUID.test(body.parentId))||
    typeof body.tabName!=='string'||body.tabName.trim().length<1||body.tabName.trim().length>120)
   throw new CampaignRejected('Nome nota non valido',400);
  const {rows}=await pool.query('SELECT hollowgate_vtt.create_owned_character_note_v2($1,$2,$3,$4,$5) AS id',
   [ownerId,campaignId,characterId,body.tabName.trim(),body.parentId??null]);
  if(!rows[0]?.id)throw new CampaignRejected('Personaggio non trovato o non autorizzato',404);
  const all=await list(ownerId,campaignId,characterId,body.parentId??null);
  const note=all.notes.find(n=>n.id===rows[0].id);
  if(!note)throw new Error('Note not visible after insertion');
  return {note};
 }
 async function save(ownerId,campaignId,characterId,noteId,body){
  [ownerId,campaignId,characterId,noteId].forEach((id,i)=>safeId(id,['Utente','Campagna','Personaggio','Nota'][i]));
  if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).sort().join(',')!=='content,contentRich,hidden,position,tabName,visibility'||
   typeof body.tabName!=='string'||body.tabName.trim().length<1||body.tabName.trim().length>120||
   typeof body.content!=='string'||Buffer.byteLength(body.content,'utf8')>32768||
   (body.contentRich!==null&&(typeof body.contentRich!=='object'||Array.isArray(body.contentRich)||
     Buffer.byteLength(JSON.stringify(body.contentRich),'utf8')>49152))||
   !Number.isInteger(body.position)||body.position<0||body.position>10000||
   typeof body.hidden!=='boolean'||!['all','private'].includes(body.visibility))
   throw new CampaignRejected('Dati nota non validi',400);
  const {rows}=await pool.query(
   'SELECT hollowgate_vtt.save_owned_character_note($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) AS id',
   [ownerId,campaignId,characterId,noteId,body.tabName.trim(),body.content,
    body.contentRich===null?null:JSON.stringify(body.contentRich),body.position,body.hidden,body.visibility]);
  if(!rows[0]?.id)throw new CampaignRejected('Nota non trovata o non autorizzata',404);
  const all=await list(ownerId,campaignId,characterId);
  return {note:all.notes.find(n=>n.id===noteId)};
 }
 async function archive(ownerId,campaignId,characterId,noteId){
  [ownerId,campaignId,characterId,noteId].forEach((id,i)=>safeId(id,['Utente','Campagna','Personaggio','Nota'][i]));
  const {rows}=await pool.query('SELECT hollowgate_vtt.archive_owned_character_note_v2($1,$2,$3,$4) AS id',
   [ownerId,campaignId,characterId,noteId]);
  if(!rows[0]?.id)throw new CampaignRejected('Nota non trovata o non autorizzata',404);
  return {archivedId:noteId};
 }
 async function setSubtabOrder(ownerId,campaignId,characterId,parentId,order){
  [ownerId,campaignId,characterId,parentId].forEach((id,i)=>safeId(id,['Utente','Campagna','Personaggio','Nota padre'][i]));
  if(!Array.isArray(order)||order.length>100||order.some(id=>typeof id!=='string'||!UUID.test(id))||
    new Set(order).size!==order.length)throw new CampaignRejected('Ordine sottoschede non valido',400);
  const {rows}=await pool.query('SELECT hollowgate_vtt.set_owned_note_subtab_order($1,$2,$3,$4,$5::jsonb) AS id',
   [ownerId,campaignId,characterId,parentId,JSON.stringify(order)]);
  if(!rows[0]?.id)throw new CampaignRejected('Sottoschede non autorizzate o ordine incoerente',404);
  return {parentId,tabOrder:order};
 }
 return {list,create,save,archive,setSubtabOrder};
}
