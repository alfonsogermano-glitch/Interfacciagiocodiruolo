import {createUnassignedCatalogService} from './unassigned-catalog-service.mjs';
import {createUnassignedCatalogNotesService} from './unassigned-catalog-notes-service.mjs';
const requiredFunctions=[
 'create_unassigned_catalog_entry(uuid,text,text,text,jsonb)',
 'get_unassigned_catalog_entry(uuid,text,uuid)',
 'list_unassigned_catalog_entries(uuid,text,uuid)',
 'save_unassigned_catalog_entry(uuid,text,uuid,integer,text,text,jsonb)',
 'save_unassigned_catalog_media(uuid,text,uuid,integer,text,text,bytea)',
 'read_unassigned_catalog_media(uuid,text,uuid,text)',
 'list_unassigned_catalog_notes(uuid,text,uuid,uuid)',
 'create_unassigned_catalog_note(uuid,text,uuid,integer,text,uuid)',
 'save_unassigned_catalog_note(uuid,text,uuid,uuid,integer,text,text,jsonb,integer,boolean,text)',
 'order_unassigned_catalog_subtabs(uuid,text,uuid,uuid,integer,jsonb)',
 'archive_unassigned_catalog_note(uuid,text,uuid,uuid,integer)',
 'duplicate_unassigned_catalog_entry(uuid,text,uuid,integer,uuid)',
 'copy_unassigned_catalog_to_campaign(uuid,text,uuid,uuid,integer)',
].flatMap(name=>['hollowgate_vtt.'+name,'hollowgate_vtt.'+name.replace('_unassigned_catalog_','_native_catalog_')]).concat([
 'hollowgate_vtt.assign_native_catalog_entry(uuid,text,uuid,integer,uuid)',
 'hollowgate_vtt.archive_native_catalog_entry(uuid,text,uuid,integer)',
]);

// Explicit partial capability: this never means historical/global UI parity.
// Default-off, no migrations or DDL performed by the application principal.
export async function configureNativeCatalog({flag,authEnabled,campaigns,pool}){
 if(flag!==undefined&&flag!==''&&!['true','false'].includes(flag))
  throw Error('Unsupported AUTH_VTT_NATIVE_CATALOG_ENABLED value');
 if(flag!=='true')return {unassignedCatalog:null,unassignedCatalogNotes:null,nativeCatalog:null,nativeCatalogNotes:null};
 if(!authEnabled)throw Error('Native catalog requires authenticated runtime');
 if(!campaigns)throw Error('Native catalog requires campaigns');
 if(typeof pool?.query!=='function')throw TypeError('PostgreSQL pool required');
 const {rows}=await pool.query(`SELECT
  coalesce(bool_and(to_regprocedure(signature) IS NOT NULL
   AND has_function_privilege(current_user,to_regprocedure(signature),'EXECUTE')),false)
  AND to_regprocedure('hollowgate_vtt.copy_unassigned_catalog_to_campaign_v003(uuid,text,uuid,uuid,integer)') IS NOT NULL
  AND NOT has_function_privilege(current_user,to_regprocedure('hollowgate_vtt.copy_unassigned_catalog_to_campaign_v003(uuid,text,uuid,uuid,integer)'),'EXECUTE')
  AND to_regprocedure('hollowgate_vtt.copy_native_catalog_to_campaign_internal(uuid,text,uuid,uuid,integer)') IS NOT NULL
  AND NOT has_function_privilege(current_user,to_regprocedure('hollowgate_vtt.copy_native_catalog_to_campaign_internal(uuid,text,uuid,uuid,integer)'),'EXECUTE')
  AS ready FROM unnest($1::text[]) AS required(signature)`,[requiredFunctions]);
 if(rows[0]?.ready!==true)throw Error('Native catalog requires migrations 001-005 and restricted runtime grants');
 return {unassignedCatalog:createUnassignedCatalogService({pool}),
  unassignedCatalogNotes:createUnassignedCatalogNotesService({pool}),
  nativeCatalog:createUnassignedCatalogService({pool,native:true}),
  nativeCatalogNotes:createUnassignedCatalogNotesService({pool,native:true})};
}
