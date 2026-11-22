import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RICH_CONTENT_BYTES=1024*1024;
const safeId=(value,label)=>{if(typeof value!=='string'||!UUID.test(value))throw new CampaignRejected(label+' non valido',400);return value;};
const safeKind=value=>{if(!['npcs','monsters'].includes(value))throw new CampaignRejected('Tipo narrativo non valido',400);return value;};
const mapped=row=>({id:row.id,tab_name:row.tab_name,content:row.content,content_rich:row.content_rich,
 position:row.tab_position,hidden:row.hidden,visibility:row.visibility,parent_note_id:row.parent_note_id??null,
 tab_order:row.tab_order??null,created_at:row.created_at,updated_at:row.updated_at});
export function createNarrativeEntityNotesService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 const scope=(ownerId,campaignId,kind,entityId)=>[safeId(ownerId,'Utente'),safeId(campaignId,'Campagna'),safeKind(kind),safeId(entityId,'Entità')];
 async function list(ownerId,campaignId,kind,entityId,parentId=null){
  const args=scope(ownerId,campaignId,kind,entityId);if(parentId!==null)safeId(parentId,'Nota padre');
  const {rows}=await pool.query('SELECT * FROM hollowgate_vtt.list_owned_narrative_entity_notes($1,$2,$3,$4,$5)',[...args,parentId]);
  return {notes:rows.map(mapped)};
 }
 async function create(ownerId,campaignId,kind,entityId,body){
  const args=scope(ownerId,campaignId,kind,entityId);
  if(!body||typeof body!=='object'||Array.isArray(body)||!['tabName','parentId,tabName'].includes(Object.keys(body).sort().join(','))||
   typeof body.tabName!=='string'||!body.tabName.trim()||body.tabName.trim().length>120||
   body.parentId!==undefined&&body.parentId!==null&&!UUID.test(body.parentId))throw new CampaignRejected('Nome nota non valido',400);
  const {rows}=await pool.query('SELECT hollowgate_vtt.create_owned_narrative_entity_note($1,$2,$3,$4,$5,$6) AS id',
   [...args,body.tabName.trim(),body.parentId??null]);
  if(!rows[0]?.id)throw new CampaignRejected('Entità non trovata o non autorizzata',404);
  const notes=(await list(ownerId,campaignId,kind,entityId,body.parentId??null)).notes;
  const note=notes.find(item=>item.id===rows[0].id);if(!note)throw new Error('Narrative note not visible after insertion');
  return {note};
 }
 async function save(ownerId,campaignId,kind,entityId,noteId,body){
  const args=scope(ownerId,campaignId,kind,entityId);safeId(noteId,'Nota');
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='content,contentRich,hidden,position,tabName,visibility'||
   typeof body.tabName!=='string'||!body.tabName.trim()||body.tabName.trim().length>120||typeof body.content!=='string'||Buffer.byteLength(body.content)>32768||
    body.contentRich!==null&&(typeof body.contentRich!=='object'||Array.isArray(body.contentRich)||Buffer.byteLength(JSON.stringify(body.contentRich))>MAX_RICH_CONTENT_BYTES)||
   !Number.isInteger(body.position)||body.position<0||body.position>10000||typeof body.hidden!=='boolean'||!['all','private'].includes(body.visibility))
   throw new CampaignRejected('Dati nota non validi',400);
  const {rows}=await pool.query('SELECT hollowgate_vtt.save_owned_narrative_entity_note($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) AS id',
   [...args,noteId,body.tabName.trim(),body.content,body.contentRich===null?null:JSON.stringify(body.contentRich),body.position,body.hidden,body.visibility]);
  if(!rows[0]?.id)throw new CampaignRejected('Nota non trovata o non autorizzata',404);
  return {note:{id:noteId,tab_name:body.tabName.trim(),content:body.content,content_rich:body.contentRich,position:body.position,hidden:body.hidden,visibility:body.visibility}};
 }
 async function archive(ownerId,campaignId,kind,entityId,noteId){
  const args=scope(ownerId,campaignId,kind,entityId);safeId(noteId,'Nota');
  const {rows}=await pool.query('SELECT hollowgate_vtt.archive_owned_narrative_entity_note($1,$2,$3,$4,$5) AS id',[...args,noteId]);
  if(!rows[0]?.id)throw new CampaignRejected('Nota non trovata o non autorizzata',404);return {archivedId:noteId};
 }
 async function setSubtabOrder(ownerId,campaignId,kind,entityId,parentId,order){
  const args=scope(ownerId,campaignId,kind,entityId);safeId(parentId,'Nota padre');
  if(!Array.isArray(order)||order.length>100||order.some(id=>typeof id!=='string'||!UUID.test(id))||new Set(order).size!==order.length)
   throw new CampaignRejected('Ordine sottoschede non valido',400);
  const {rows}=await pool.query('SELECT hollowgate_vtt.set_owned_narrative_note_subtab_order($1,$2,$3,$4,$5,$6::jsonb) AS id',
   [...args,parentId,JSON.stringify(order)]);
  if(!rows[0]?.id)throw new CampaignRejected('Sottoschede non autorizzate o ordine incoerente',404);return {parentId,tabOrder:order};
 }
 return {list,create,save,archive,setSubtabOrder};
}
