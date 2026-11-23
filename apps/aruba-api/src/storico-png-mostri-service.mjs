import {CatalogRejected,catalogId} from './unassigned-catalog-contract.mjs';

const KINDS=Object.freeze(['npcs','monsters']);
function validateItem(item,expectedId){
 if(!item||typeof item!=='object'||!KINDS.includes(item.kind))
  throw new CatalogRejected('Elemento storico non valido');
 const id=catalogId(item.id);
 if(expectedId&&id!==expectedId)throw new Error('Elemento storico ambiguo');
 if(item.campaignId!==null)catalogId(item.campaignId);
 if(typeof item.name!=='string'||item.name.length===0)
  throw new Error('Elemento storico invalido');
 return item;
}
export function createStoricoPngMostriService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 return {
  async list(actor,after=null){
   const args=[catalogId(actor),after===null||after===undefined?null:catalogId(after)];
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.storico_png_mostri_document(v) AS item FROM hollowgate_vtt.list_storico_png_mostri($1,$2) AS v',args);
   if(rows.length>101)throw new Error('Invalid storico paging result');
   const items=rows.slice(0,100).map(row=>validateItem(row.item));
   return {items,nextCursor:rows.length>100?items.at(-1).id:null};
  },
  async read(actor,id){
   const args=[catalogId(actor),catalogId(id)];
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.read_storico_png_mostri($1,$2) AS item',args);
   if(!rows[0]?.item)throw new CatalogRejected('Contenuto non trovato o non autorizzato',404);
   return {item:validateItem(rows[0].item,catalogId(id))};
  },
 };
}
