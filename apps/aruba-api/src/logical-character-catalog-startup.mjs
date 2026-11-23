import {createLogicalCharacterCatalogService} from './logical-character-catalog-service.mjs';
export async function requireLogicalCharacterSafety({pool}){
 const {rows}=await pool.query(`SELECT
  to_regprocedure('hollowgate_vtt.lock_logical_character_catalog_entry(uuid,uuid,integer)') IS NOT NULL AS ready`);
 if(rows[0]?.ready!==true)throw Error('Logical characters require migration 039 security fixes');
}
export async function configureLogicalCharacterCatalog({flag,logicalCharacters,pool}){
 if(flag!==undefined&&flag!==''&&!['true','false'].includes(flag))
  throw Error('Unsupported AUTH_VTT_CHARACTER_CATALOG_ENABLED value');
 if(flag!=='true')return null;
 if(!logicalCharacters)throw Error('Character catalog requires logical characters');
 if(typeof pool?.query!=='function')throw TypeError('PostgreSQL pool required');
 const signatures=[
  'get_logical_character_catalog_entry(uuid,uuid)','list_logical_character_catalog_entries(uuid,uuid)',
  'create_logical_character_catalog_entry(uuid,text,text,jsonb)',
  'save_logical_character_catalog_entry(uuid,uuid,integer,text,text,jsonb)',
  'archive_logical_character_catalog_entry(uuid,uuid,integer)',
  'duplicate_logical_character_catalog_entry(uuid,uuid,integer,uuid)',
 ].map(name=>'hollowgate_vtt.'+name);
 const {rows}=await pool.query(`SELECT coalesce(bool_and(to_regprocedure(signature) IS NOT NULL
  AND has_function_privilege(current_user,to_regprocedure(signature),'EXECUTE')),false)
  AND NOT has_function_privilege(current_user,to_regprocedure('hollowgate_vtt.lock_logical_character_catalog_entry(uuid,uuid,integer)'),'EXECUTE')
  AS ready FROM unnest($1::text[]) AS required(signature)`,[signatures]);
 if(rows[0]?.ready!==true)throw Error('Character catalog requires migration 039 and restricted grants');
 return createLogicalCharacterCatalogService({pool});
}
