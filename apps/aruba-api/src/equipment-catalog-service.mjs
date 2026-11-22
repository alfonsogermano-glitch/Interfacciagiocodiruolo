import {validateEquipmentCatalogDraft,EquipmentCatalogRejected} from './equipment-catalog-contract.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createEquipmentCatalogService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 async function owner(ownerId,campaignId){if(!UUID.test(ownerId??'')||!UUID.test(campaignId??''))throw new EquipmentCatalogRejected('Identità non valida');const result=await pool.query('SELECT hollowgate_vtt.equipment_catalog_owner_authorized($1,$2) AS allowed',[ownerId,campaignId]);if(result.rows[0]?.allowed!==true)throw new EquipmentCatalogRejected('Campagna non autorizzata',404);}
 async function list(ownerId,campaignId){await owner(ownerId,campaignId);const result=await pool.query('SELECT id,campaign_id,payload FROM hollowgate_vtt.list_owned_equipment_catalog($1,$2)',[ownerId,campaignId]);return {items:result.rows.map(row=>({...row.payload,id:row.id,campaignId:row.campaign_id}))};}
 async function save(ownerId,campaignId,draft){const item=validateEquipmentCatalogDraft(campaignId,draft);await owner(ownerId,campaignId);const result=await pool.query('SELECT hollowgate_vtt.save_owned_equipment_catalog($1,$2,$3,$4::jsonb) AS id',[ownerId,campaignId,item.id,JSON.stringify(item)]);if(result.rows[0]?.id!==item.id)throw new Error('Equipment catalog write failed');return {item};}
 async function remove(ownerId,campaignId,itemId){if(!UUID.test(itemId??''))throw new EquipmentCatalogRejected('Oggetto non valido');await owner(ownerId,campaignId);const result=await pool.query('SELECT hollowgate_vtt.delete_owned_equipment_catalog($1,$2,$3) AS id',[ownerId,campaignId,itemId]);if(result.rows[0]?.id!==itemId)throw new EquipmentCatalogRejected('Oggetto non trovato',404);return {deleted:true};}
 return {list,save,remove};
}
