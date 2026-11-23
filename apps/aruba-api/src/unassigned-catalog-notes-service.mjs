import {CatalogRejected,catalogId,catalogKind} from './unassigned-catalog-contract.mjs';
import {catalogNoteCreate,catalogNoteSave,catalogNoteOrder,catalogRevisionBody} from './unassigned-catalog-notes-contract.mjs';

export function createUnassignedCatalogNotesService({pool,native=false}){
 if(typeof native!=='boolean')throw new TypeError('Invalid native catalog notes mode');
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 const scope=(actor,kind,id)=>[catalogId(actor),catalogKind(kind),catalogId(id)];
 const returnedId=value=>{try{return catalogId(value);}catch{throw new Error('Invalid catalog note identity');}};
 async function query(sql,args,expected){
  let result;
   try{result=await pool.query(native?sql.replaceAll('_unassigned_catalog_','_native_catalog_'):sql,args);}
  catch(error){
   if(error.code==='40001')throw new CatalogRejected('Il contenuto è cambiato: ricarica prima di salvare.',409);
   if(['23514','23502','22023','22001'].includes(error.code))throw new CatalogRejected('Dati nota catalogo non validi');
   throw error;
  }
  const value=result.rows[0]?.result;
  if(!value)throw new CatalogRejected('Nota o contenuto non trovato o non autorizzato',404);
  const item=value.item;
   if(!item||item.ownerId!==args[0]||item.kind!==args[1]||item.id!==args[2]||
    (!native&&item.campaignId!==null)||(native&&item.status!=='active')||
   !Number.isInteger(item.revision)||item.revision<1||item.revision>=2147483647)
   throw new Error('Invalid catalog notes context');
   if(expected&&value.note?.id!==expected)throw new Error('Invalid catalog note acknowledgement');
   if(native&&item.campaignId!==null){
    try{catalogId(item.campaignId);}catch{throw new Error('Invalid native notes campaign identity');}
   }
  return value;
 }
 return {
  async list(actor,kind,id,parentId=null){
   const args=scope(actor,kind,id),parent=parentId===null?null:catalogId(parentId);
   const value=await query('SELECT hollowgate_vtt.list_unassigned_catalog_notes($1,$2,$3,$4) AS result',[...args,parent]);
   if(!Array.isArray(value.notes)||value.notes.length>100||new Set(value.notes.map(n=>n.id)).size!==value.notes.length||
    value.notes.some(n=>n.parent_note_id!==parent))throw new Error('Invalid catalog note list');
   for(const note of value.notes)returnedId(note.id);
   return value;
  },
  async create(actor,kind,id,body){
   const args=scope(actor,kind,id),draft=catalogNoteCreate(body);
   const value=await query('SELECT hollowgate_vtt.create_unassigned_catalog_note($1,$2,$3,$4,$5,$6) AS result',
    [...args,draft.revision,draft.tabName,draft.parentId]);
   if(!value.note||value.note.parent_note_id!==draft.parentId)throw new Error('Invalid created catalog note');
   returnedId(value.note.id);return value;
  },
  async save(actor,kind,id,noteId,body){
   const args=scope(actor,kind,id),note=catalogId(noteId),draft=catalogNoteSave(body);
   return query('SELECT hollowgate_vtt.save_unassigned_catalog_note($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) AS result',
    [...args,note,draft.revision,draft.tabName,draft.content,draft.contentRich===null?null:JSON.stringify(draft.contentRich),draft.position,draft.hidden,draft.visibility],note);
  },
  async reorder(actor,kind,id,parentId,body){
   const args=scope(actor,kind,id),parent=catalogId(parentId),draft=catalogNoteOrder(body);
   return query('SELECT hollowgate_vtt.order_unassigned_catalog_subtabs($1,$2,$3,$4,$5,$6::jsonb) AS result',
    [...args,parent,draft.revision,JSON.stringify(draft.tabOrder)],parent);
  },
  async archive(actor,kind,id,noteId,body){
   const args=scope(actor,kind,id),note=catalogId(noteId),revision=catalogRevisionBody(body);
   const value=await query('SELECT hollowgate_vtt.archive_unassigned_catalog_note($1,$2,$3,$4,$5) AS result',[...args,note,revision]);
   if(value.archivedId!==note)throw new Error('Invalid catalog note archive acknowledgement');
   return value;
  },
 };
}
