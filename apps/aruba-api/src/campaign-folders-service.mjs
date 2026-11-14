// Campaign Note folders are separate from character/entity folders.
// Authorize reads and writes inside SQL SECURITY DEFINER, never in the client.
import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=(value,label)=>{
 if(typeof value!=='string'||!UUID.test(value))throw new CampaignRejected(label+' non valido',400);
 return value;
};
const checkParent=value=>value===null?null:id(value,'Cartella padre');
const checkScope=value=>{
 if(!['gm','shared'].includes(value))throw new CampaignRejected('Sezione Note non valida',400);
 return value;
};
const checkName=value=>{
 if(typeof value!=='string'||!value.trim()||value.trim().length>120)
  throw new CampaignRejected('Nome cartella non valido',400);
 return value.trim();
};
const exact=(obj,fields)=>{
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||
 Object.keys(obj).sort().join(',')!==fields.slice().sort().join(','))
  throw new CampaignRejected('Dati cartella non validi',400);
};
export function createCampaignFoldersService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 async function list(userId,campaignId,scope){
  id(userId,'Utente');id(campaignId,'Campagna');checkScope(scope);
  const {rows}=await pool.query(
   'SELECT * FROM hollowgate_vtt.list_member_note_folders($1,$2,$3)',
   [userId,campaignId,scope]);
  return {folders:rows.map(row=>({
   id:row.id,name:row.name,parentId:row.parent_folder_id,
   icon:row.icon,position:row.folder_position,scope:row.scope,
  }))};
 }
 async function create(ownerId,data){
  id(ownerId,'Utente');exact(data,['campaignId','scope','name','parentId']);
  id(data.campaignId,'Campagna');checkScope(data.scope);checkParent(data.parentId);checkName(data.name);
  const {rows}=await pool.query(
   'SELECT hollowgate_vtt.create_owned_note_folder($1,$2,$3,$4,$5) AS id',
   [ownerId,data.campaignId,data.scope,data.name.trim(),data.parentId]);
  if(!rows[0]?.id)throw new CampaignRejected('Cartella non trovata o non autorizzata',404);
  return {folderId:rows[0].id};
 }
 async function update(ownerId,folderId,data){
  id(ownerId,'Utente');id(folderId,'Cartella');
  exact(data,['campaignId','name','parentId']);
  id(data.campaignId,'Campagna');checkParent(data.parentId);checkName(data.name);
  const {rows}=await pool.query(
   'SELECT hollowgate_vtt.update_owned_note_folder($1,$2,$3,$4,$5) AS id',
   [ownerId,data.campaignId,folderId,data.name.trim(),data.parentId]);
  if(rows[0]?.id!==folderId)
   throw new CampaignRejected('Cartella non trovata o non autorizzata',404);
  return {folderId};
 }
 async function presentation(ownerId,folderId,data){
  id(ownerId,'Utente');id(folderId,'Cartella');
  exact(data,['campaignId','icon','position']);
  id(data.campaignId,'Campagna');
  if(data.icon!==null&&(typeof data.icon!=='string'||data.icon.length>80)||
   !Number.isInteger(data.position)||data.position<0||data.position>10000)
   throw new CampaignRejected('Presentazione cartella non valida',400);
  const {rows}=await pool.query(
   'SELECT hollowgate_vtt.set_owned_note_folder_presentation($1,$2,$3,$4,$5) AS id',
   [ownerId,data.campaignId,folderId,data.icon,data.position]);
  if(rows[0]?.id!==folderId)
   throw new CampaignRejected('Cartella non trovata o non autorizzata',404);
  return {folderId,icon:data.icon,position:data.position};
 }
 async function archive(ownerId,folderId,data){
  id(ownerId,'Utente');id(folderId,'Cartella');
  exact(data,['campaignId','cascade']);
  id(data.campaignId,'Campagna');
  if(typeof data.cascade!=='boolean')
   throw new CampaignRejected('Modalità archiviazione non valida',400);
  const {rows}=await pool.query(
   'SELECT hollowgate_vtt.archive_owned_note_folder($1,$2,$3,$4) AS id',
   [ownerId,data.campaignId,folderId,data.cascade]);
  if(rows[0]?.id!==folderId)
   throw new CampaignRejected('Cartella non trovata o non autorizzata',404);
  return {archivedId:folderId,cascade:data.cascade};
 }
 return {list,create,update,presentation,archive};
}
