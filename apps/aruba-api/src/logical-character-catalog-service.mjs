import {CatalogRejected,catalogId,catalogRevision,validateUnassignedCatalogBody} from './unassigned-catalog-contract.mjs';
export function createLogicalCharacterCatalogService({pool}){
 if(typeof pool?.query!=='function')throw TypeError('PostgreSQL pool required');
 async function query(sql,args){
  try{return await pool.query(sql,args);}
  catch(error){
   if(['40001','40P01'].includes(error.code))throw new CatalogRejected('Il personaggio è cambiato: ricarica prima di salvare.',409);
   if(error.code==='42501')throw new CatalogRejected('Operazione non autorizzata per questo personaggio',403);
   if(error.code==='22023'&&error.message==='ORIGINI_LOCKED')throw new CatalogRejected('ORIGINI_LOCKED',400);
   if(['23514','23502','22023','22001'].includes(error.code))throw new CatalogRejected('Scheda personaggio non valida',400);
   throw error;
  }
 }
 function checked(row,actor,id,statuses=['draft','active']){
  if(!row)throw new CatalogRejected('Personaggio non trovato o non autorizzato',404);
  try{
   catalogId(row.id);catalogId(row.ownerId);catalogRevision(row.revision);
   if(row.campaignId!==null)catalogId(row.campaignId);
  }catch{throw Error('Invalid logical character catalog identity');}
  if(row.logicalOwnerId!==actor||(id!==undefined&&row.id!==id)||!statuses.includes(row.status)||
   typeof row.name!=='string'||!row.sheetData||typeof row.sheetData!=='object'||Array.isArray(row.sheetData))
   throw Error('Invalid logical character catalog context');
  return row;
 }
 function draft(body,saving){
  const expected=saving?'name,revision,ruleset,sheetData':'name,ruleset,sheetData';
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!==expected)
   throw new CatalogRejected('Dati personaggio non validi');
  if(!saving&&body.ruleset===null)throw new CatalogRejected('Seleziona un regolamento');
  // Null is preserved for a historical ruleset, never inferred from JSON.
  validateUnassignedCatalogBody('characters',{name:body.name,ruleset:body.ruleset===null?'custom':body.ruleset,data:body.sheetData});
  if(saving)catalogRevision(body.revision);
  return body;
 }
 return {
  async list(actor,after=null){
   actor=catalogId(actor);if(after!==null)after=catalogId(after);
   const {rows}=await query('SELECT hollowgate_vtt.list_logical_character_catalog_entries($1,$2) AS item',[actor,after]);
   if(rows.length>101)throw Error('Invalid logical character page');
   const all=rows.map(row=>checked(row.item,actor));
   if(new Set(all.map(row=>row.id)).size!==all.length)throw Error('Duplicate logical character identity');
   const characters=all.slice(0,100);
   return {characters,nextCursor:all.length>100?characters.at(-1).id:null};
  },
  async read(actor,id){
   actor=catalogId(actor);id=catalogId(id);
   const result=await query('SELECT hollowgate_vtt.get_logical_character_catalog_entry($1,$2) AS item',[actor,id]);
   return {character:checked(result.rows[0]?.item,actor,id)};
  },
  async create(actor,body){
   actor=catalogId(actor);const value=draft(body,false);
   const result=await query('SELECT hollowgate_vtt.create_logical_character_catalog_entry($1,$2,$3,$4::jsonb) AS item',
    [actor,value.name,value.ruleset,JSON.stringify(value.sheetData)]);
   return {character:checked(result.rows[0]?.item,actor)};
  },
  async save(actor,id,body){
   actor=catalogId(actor);id=catalogId(id);const value=draft(body,true);
   const result=await query('SELECT hollowgate_vtt.save_logical_character_catalog_entry($1,$2,$3,$4,$5,$6::jsonb) AS item',
    [actor,id,value.revision,value.name,value.ruleset,JSON.stringify(value.sheetData)]);
   const character=checked(result.rows[0]?.item,actor,id);
   if(character.revision!==value.revision+1)throw Error('Invalid character revision acknowledgement');
   return {character};
  },
  async archive(actor,id,body){
   actor=catalogId(actor);id=catalogId(id);
   if(!body||Object.keys(body).join(',')!=='revision')throw new CatalogRejected('Archiviazione personaggio non valida');
   const revision=catalogRevision(body.revision);
   const result=await query('SELECT hollowgate_vtt.archive_logical_character_catalog_entry($1,$2,$3) AS item',[actor,id,revision]);
   const character=checked(result.rows[0]?.item,actor,id,['archived']);
   if(character.revision!==revision+1)throw Error('Invalid character archive acknowledgement');
   return {character,archivedId:id};
  },
  async duplicate(actor,id,body){
   actor=catalogId(actor);id=catalogId(id);
   if(!body||Object.keys(body).sort().join(',')!=='requestId,revision')throw new CatalogRejected('Duplicazione personaggio non valida');
   const revision=catalogRevision(body.revision),requestId=catalogId(body.requestId);
   const result=await query('SELECT hollowgate_vtt.duplicate_logical_character_catalog_entry($1,$2,$3,$4) AS item',
    [actor,id,revision,requestId]);
   const character=checked(result.rows[0]?.item,actor);
   if(character.id===id)throw Error('Invalid character duplicate identity');
   return {character};
  },
 };
}
