import {CampaignRejected} from './campaign-service.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=(value,label)=>{
 if(typeof value!=='string'||!UUID.test(value))throw new CampaignRejected(label+' non valido',400);
 return value;
};
const name=value=>{
 if(typeof value!=='string'||value.trim().length<1||value.trim().length>120)
  throw new CampaignRejected('Titolo nota non valido',400);
 return value.trim();
};
const exact=(value,fields)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||
   Object.keys(value).sort().join(',')!==fields.slice().sort().join(','))
  throw new CampaignRejected('Dati nota non validi',400);
};
const map=row=>({
 id:row.id,title:row.title,contentRich:row.content_rich,
 parentId:row.parent_note_id,position:row.tab_position,visibility:row.visibility,
});
export function createCampaignNotesService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 async function list(ownerId,campaignId,parentId=null){
  id(ownerId,'Utente');id(campaignId,'Campagna');
  if(parentId!==null)id(parentId,'Nota padre');
  const {rows}=await pool.query(
   'SELECT * FROM hollowgate_vtt.list_owned_campaign_notes($1,$2,$3)',
   [ownerId,campaignId,parentId]);
  return {notes:rows.map(map)};
 }
 async function create(ownerId,campaignId,data){
  id(ownerId,'Utente');id(campaignId,'Campagna');
  exact(data,['title','parentId']);
  const title=name(data.title);
  const parent=data.parentId===null?null:id(data.parentId,'Nota padre');
  const {rows}=await pool.query(
   'SELECT hollowgate_vtt.create_owned_campaign_note($1,$2,$3,$4) AS id',
   [ownerId,campaignId,title,parent]);
  const noteId=rows[0]?.id;
  if(!noteId)throw new CampaignRejected('Nota non trovata o non autorizzata',404);
  const notes=await list(ownerId,campaignId,parent);
  const note=notes.notes.find(item=>item.id===noteId);
  if(!note)throw new Error('Created note missing from authorized list');
  return {note};
 }
 async function save(ownerId,campaignId,noteId,data){
  [ownerId,campaignId,noteId].forEach((v,i)=>id(v,['Utente','Campagna','Nota'][i]));
  exact(data,['title','contentRich','position','visibility']);
  const title=name(data.title);
  if(data.contentRich!==null&&
    (!data.contentRich||typeof data.contentRich!=='object'||Array.isArray(data.contentRich)||
    Buffer.byteLength(JSON.stringify(data.contentRich),'utf8')>49152))
   throw new CampaignRejected('Documento nota non valido',400);
  if(!Number.isInteger(data.position)||data.position<0||data.position>10000||
    !['private','all'].includes(data.visibility))
   throw new CampaignRejected('Proprietà nota non valide',400);
  const {rows}=await pool.query(
   'SELECT hollowgate_vtt.save_owned_campaign_note($1,$2,$3,$4,$5::jsonb,$6,$7) AS id',
   [ownerId,campaignId,noteId,title,data.contentRich===null?null:JSON.stringify(data.contentRich),
    data.position,data.visibility]);
  if(rows[0]?.id!==noteId)
   throw new CampaignRejected('Nota non trovata o non autorizzata',404);
  // The SQL routine has already confirmed the exact owner-scoped write.
  // Never reread only the root list: that would drop saved child tabs.
  return {savedId:noteId};
 }
 async function archive(ownerId,campaignId,noteId){
  [ownerId,campaignId,noteId].forEach((v,i)=>id(v,['Utente','Campagna','Nota'][i]));
  const {rows}=await pool.query(
   'SELECT hollowgate_vtt.archive_owned_campaign_note($1,$2,$3) AS id',
   [ownerId,campaignId,noteId]);
  if(rows[0]?.id!==noteId)
   throw new CampaignRejected('Nota non trovata o non autorizzata',404);
  return {archivedId:noteId};
 }
 return {list,create,save,archive};
}
