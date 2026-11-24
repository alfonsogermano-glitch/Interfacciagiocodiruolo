import {CatalogRejected,catalogId,catalogKind,catalogRevision} from './unassigned-catalog-contract.mjs';

function validateDocument(item){
 if(!item||typeof item!=='object'||typeof item.name!=='string'||item.name.length===0)
  throw new CatalogRejected('Contenuto catalogo non valido');
 const kind=catalogKind(item.kind),id=catalogId(item.id),ownerId=catalogId(item.ownerId),
  campaignId=catalogId(item.campaignId);
 catalogRevision(item.revision);
 if(item.status!=='active'||typeof item.data!=='object'||item.data===null||Array.isArray(item.data))
  throw new CatalogRejected('Contenuto catalogo non valido');
 return {kind,id,ownerId,campaignId,name:item.name,ruleset:item.ruleset,status:item.status,
  data:item.data,revision:item.revision,createdAt:item.createdAt,updatedAt:item.updatedAt};
}
export function createNativeCampaignCatalogService({pool}){
 if(!pool||typeof pool.query!=='function')throw new TypeError('PostgreSQL pool required');
 return {
  async list(actor,kind,campaignId){
   const args=[catalogId(actor),catalogKind(kind),catalogId(campaignId)];
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.list_native_catalog_entries_by_campaign($1,$2,$3) AS item',args);
   if(rows.length>101)throw new Error('Invalid campaign catalog page');
   return rows.map(row=>validateDocument(row.item));
  },
 };
}
