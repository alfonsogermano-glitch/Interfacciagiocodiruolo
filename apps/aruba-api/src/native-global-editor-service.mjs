import {CatalogRejected,catalogId,catalogKind,catalogRevision} from './unassigned-catalog-contract.mjs';

function validateEntry(item){
 if(!item||typeof item!=='object'||typeof item.name!=='string'||item.name.length===0)
  throw new CatalogRejected('Elemento catalogo non valido');
 const kind=catalogKind(item.kind),id=catalogId(item.id),ownerId=catalogId(item.ownerId),campaignId=catalogId(item.campaignId);
 catalogRevision(item.revision);
 if(typeof item.data!=='object'||item.data===null||Array.isArray(item.data)||item.status!=='active')
  throw new CatalogRejected('Elemento catalogo non valido');
 return {kind,id,ownerId,campaignId,name:item.name,revision:item.revision,status:item.status,data:item.data};
}
function validateMedia(role,body){
 if(role!=='portrait'&&role!=='source'&&role!=='cover')throw new CatalogRejected('Ruolo media non valido');
 if(!body||typeof body!=='object'||typeof body.mimeType!=='string'||!body.mimeType.startsWith('image/')||
    !body.dataBase64||typeof body.dataBase64!=='string')
  throw new CatalogRejected('Dati media non validi');
 const bytes=Buffer.from(body.dataBase64,'base64');
 if(bytes.length<12||bytes.length>2097152)throw new CatalogRejected('Dati media non validi');
 const revision=catalogRevision(body.revision);
 return {revision,mimeType:body.mimeType,bytes};
}
export function createNativeGlobalEditorService({pool}){
 if(!pool||typeof pool.query!=='function')throw new TypeError('PostgreSQL pool required');
 return {
  async list(actor,kind,after=null){
   const args=[catalogId(actor),catalogKind(kind),after===null?null:catalogId(after)];
   const {rows}=await pool.query(
    'SELECT v.item AS item FROM hollowgate_vtt.list_native_catalog_entries_global($1,$2,$3) AS v',args);
   if(rows.length>101)throw new Error('Invalid global catalog page');
   return rows.slice(0,100).map(row=>validateEntry(row.item));
  },
  async mediaRead(actor,kind,id,role){
   if(!['portrait','source','cover'].includes(role))throw new CatalogRejected('Ruolo media non valido');
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.read_native_catalog_media_global($1,$2,$3,$4)',
    [catalogId(actor),catalogKind(kind),catalogId(id),role]);
   if(!rows[0]?.mime_type)throw new CatalogRejected('Immagine non trovata o non autorizzata',404);
   const bytes=Buffer.from(rows[0].bytes||[]);
   if(bytes.length<12)throw new Error('Invalid stored catalog media');
   return {mimeType:rows[0].mime_type,dataBase64:bytes.toString('base64'),
    revision:catalogRevision(rows[0].revision)};
  },
  async mediaSave(actor,kind,id,body,role){
   const {revision,mimeType,bytes}=validateMedia(role,body);
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.save_native_catalog_media_global($1,$2,$3,$4,$5,$6,$7::bytea) AS item',
    [catalogId(actor),catalogKind(kind),catalogId(id),revision,role,mimeType,bytes]);
   if(!rows[0]?.item)throw new CatalogRejected('Immagine non trovata o non autorizzata',404);
   return validateEntry(rows[0].item);
  },
  async notesList(actor,kind,id,parentId=null){
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.list_native_catalog_notes_global($1,$2,$3,$4) AS result',
    [catalogId(actor),catalogKind(kind),catalogId(id),parentId===null?null:catalogId(parentId)]);
   if(!rows[0]?.result)throw new CatalogRejected('Contenuto non trovato o non autorizzato',404);
   return {item:validateEntry(rows[0].result.item),notes:rows[0].result.notes};
  },
  async noteCreate(actor,kind,id,body,parentId=null){
   if(!body||typeof body!=='object'||typeof body.name!=='string'||body.name.length===0)
    throw new CatalogRejected('Dati nota non validi');
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.create_native_catalog_note_global($1,$2,$3,$4,$5,$6::uuid) AS result',
    [catalogId(actor),catalogKind(kind),catalogId(id),catalogRevision(body.revision),body.name,parentId===null?null:catalogId(parentId)]);
   if(!rows[0]?.result)throw new CatalogRejected('Contenuto non trovato o non autorizzato',404);
   return {item:validateEntry(rows[0].result.item),note:rows[0].result.note};
  },
  async noteSave(actor,kind,id,noteId,body){
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.save_native_catalog_note_global($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) AS result',
    [catalogId(actor),catalogKind(kind),catalogId(id),catalogId(noteId),catalogRevision(body.revision),
     body.name,body.content,body.rich===undefined?null:body.rich,body.position,
     body.hidden===undefined?false:!!body.hidden,body.visibility===undefined?'visible':body.visibility]);
   if(!rows[0]?.result)throw new CatalogRejected('Contenuto non trovato o non autorizzato',404);
   return rows[0].result;
  },
 };
}
