import {CatalogRejected,catalogId,catalogKind,catalogMediaRole,validateUnassignedCatalogBody,validateCatalogMedia} from './unassigned-catalog-contract.mjs';
import {catalogDuplicateBody,catalogRevisionBody} from './unassigned-catalog-notes-contract.mjs';
import {catalogCopyToCampaignBody} from './unassigned-catalog-notes-contract.mjs';

// Explicit opt-in startup only. Native content (optionally assigned); never masquerades
// as a complete listing of historical/campaign/claimed entities.
export function createUnassignedCatalogService({pool,native=false}){
 if(typeof native!=='boolean')throw new TypeError('Invalid native catalog mode');
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 const scope=(actor,kind,id)=>[catalogId(actor),catalogKind(kind),...(id===undefined?[]:[catalogId(id)])];
 async function query(text,args){
   try{return await pool.query(native?text.replaceAll('_unassigned_catalog_','_native_catalog_'):text,args);}
  catch(error){
   if(error.code==='40001')throw new CatalogRejected('Il contenuto è cambiato: ricarica prima di salvare.',409);
   if(['23514','23502','22023','22001'].includes(error.code))throw new CatalogRejected('Contenuto catalogo non valido');
   throw error;
  }
 }
  function assertContext(row,args,status='active'){
   if(!row||row.ownerId!==args[0]||row.kind!==args[1]||(!native&&row.campaignId!==null)||
    (native&&row.status!==status)||
   (args[2]!==undefined&&row.id!==args[2])||!Number.isInteger(row.revision)||row.revision<1||row.revision>=2147483647)
   throw new Error('Invalid unassigned catalog result');
   try{catalogId(row.id);}catch{throw new Error('Invalid unassigned catalog identity');}
   if(row.campaignId!==null)try{catalogId(row.campaignId);}catch{throw new Error('Invalid native campaign identity');}
 }
 const item=(result,args)=>{
  if(!result.rows[0]?.item)throw new CatalogRejected('Contenuto non trovato o non autorizzato',404);
  assertContext(result.rows[0].item,args);
  return {item:result.rows[0].item};
 };
  return {
   ...(native?{
    async assign(actor,kind,id,body){
     const args=scope(actor,kind,id);
     if(!body||Object.keys(body).sort().join(',')!=='campaignId,revision')
      throw new CatalogRejected('Assegnazione catalogo non valida');
     const revision=catalogRevisionBody({revision:body.revision});
     const campaign=body.campaignId===null?null:catalogId(body.campaignId);
     const result=item(await query('SELECT hollowgate_vtt.assign_native_catalog_entry($1,$2,$3,$4,$5) AS item',
      [...args,revision,campaign]),args);
     if(result.item.campaignId!==campaign||result.item.revision!==revision+1)throw new Error('Invalid native assignment acknowledgement');
     return result;
    },
    async archive(actor,kind,id,body){
     const args=scope(actor,kind,id),revision=catalogRevisionBody(body);
     const result=await query('SELECT hollowgate_vtt.archive_native_catalog_entry($1,$2,$3,$4) AS item',[...args,revision]);
     const row=result.rows[0]?.item;
     if(!row)throw new CatalogRejected('Contenuto non trovato o non autorizzato',404);
     assertContext(row,args,'archived');
     if(row.revision!==revision+1)throw new Error('Invalid native archive acknowledgement');
     return {item:row,archivedId:args[2]};
    },
   }:{}),
  async list(actor,kind,after=null){
   const args=scope(actor,kind);args.push(after===null?null:catalogId(after));
   const {rows}=await query('SELECT hollowgate_vtt.list_unassigned_catalog_entries($1,$2,$3) AS item',args);
   const page=rows.map(row=>row.item);
   if(page.length>101)throw new Error('Invalid unassigned catalog result');
   for(const row of page)assertContext(row,args.slice(0,2));
   if(new Set(page.map(row=>row.id)).size!==page.length)throw new Error('Duplicate unassigned catalog identity');
   const items=page.slice(0,100);
   return {items,nextCursor:page.length>100?items.at(-1).id:null};
  },
  async read(actor,kind,id){
   const args=scope(actor,kind,id);
   return item(await query('SELECT hollowgate_vtt.get_unassigned_catalog_entry($1,$2,$3) AS item',args),args);
  },
  async create(actor,kind,body){
   const args=scope(actor,kind),draft=validateUnassignedCatalogBody(kind,body);
   return item(await query('SELECT hollowgate_vtt.create_unassigned_catalog_entry($1,$2,$3,$4,$5::jsonb) AS item',
    [...args,draft.name,draft.ruleset,JSON.stringify(draft.data)]),args);
  },
  async save(actor,kind,id,body){
   const args=scope(actor,kind,id),draft=validateUnassignedCatalogBody(kind,body,{saving:true});
   return item(await query('SELECT hollowgate_vtt.save_unassigned_catalog_entry($1,$2,$3,$4,$5,$6,$7::jsonb) AS item',
    [...args,draft.revision,draft.name,draft.ruleset,JSON.stringify(draft.data)]),args);
  },
  async duplicate(actor,kind,id,body){
   const args=scope(actor,kind,id),draft=catalogDuplicateBody(body);
   const result=item(await query('SELECT hollowgate_vtt.duplicate_unassigned_catalog_entry($1,$2,$3,$4,$5) AS item',
    [...args,draft.revision,draft.requestId]),args.slice(0,2));
   if(result.item.id===args[2])throw new Error('Invalid catalog duplicate identity');
   return result;
  },
   async copyToCampaign(actor,kind,id,body){
    const args=scope(actor,kind,id),draft=catalogCopyToCampaignBody(body);
    const result=await query('SELECT hollowgate_vtt.copy_unassigned_catalog_to_campaign($1,$2,$3,$4,$5) AS item',
     [...args,draft.targetCampaignId,draft.revision]);
    if(!result.rows[0]?.item)throw new CatalogRejected('Contenuto non trovato o non autorizzato',404);
    const row=result.rows[0].item;
      if(row.ownerId!==args[0]||row.kind!==args[1]||row.campaignId!==draft.targetCampaignId||
       (native&&row.status!=='active')||
      row.id===args[2]||!Number.isInteger(row.revision)||row.revision<1||row.revision>=2147483647)
     throw new Error('Invalid unassigned catalog result');
    try{catalogId(row.id);}catch{throw new Error('Invalid catalog identity');}
    return {item:row};
   },
  async saveMedia(actor,kind,id,role,body){
   const args=scope(actor,kind,id),draft=validateCatalogMedia(role,body);
   return item(await query('SELECT hollowgate_vtt.save_unassigned_catalog_media($1,$2,$3,$4,$5,$6,$7) AS item',
    [...args,draft.revision,role,draft.mimeType,draft.bytes]),args);
  },
  async readMedia(actor,kind,id,role){
   const args=scope(actor,kind,id);catalogMediaRole(role);
   const {rows}=await query('SELECT * FROM hollowgate_vtt.read_unassigned_catalog_media($1,$2,$3,$4)',[...args,role]);
   if(!rows[0])throw new CatalogRejected('Immagine non trovata o non autorizzata',404);
   const row=rows[0],bytes=Buffer.from(row.bytes);
   const dataBase64=bytes.toString('base64');
   try{validateCatalogMedia(role,{mimeType:row.mime_type,revision:row.revision,dataBase64});}
   catch(error){if(error instanceof CatalogRejected)throw new Error('Invalid stored catalog media');throw error;}
   return {mimeType:row.mime_type,dataBase64,revision:row.revision};
  },
 };
}
