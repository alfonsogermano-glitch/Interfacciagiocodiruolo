// In-memory PostgreSQL, actual SQL + restricted role + real service/HTTP.
// No VPS, credentials, exports or active databases are used.
// Applies migrations 001-038 (excluding 35/36/37 staging-only DO blocks) plus
// native catalog migrations 001-005 (copy, authorization and lifecycle).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createUnassignedCatalogService} from '../../../apps/aruba-api/src/unassigned-catalog-service.mjs';
import {createUnassignedCatalogNotesService} from '../../../apps/aruba-api/src/unassigned-catalog-notes-service.mjs';
import {configureNativeCatalog} from '../../../apps/aruba-api/src/native-catalog-startup.mjs';
const owner='00000000-0000-4000-8000-000000000001';
const unknownCampaign='00000000-0000-4000-8000-000000000099';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=';
const body=kind=>({name:kind==='characters'?'Mara':'Custode',ruleset:'hsc',data:kind==='characters'?
 {style:'Jock',viaggio:'Campione',ambiti:{Fisico:1},abilita:{},tratti:[],equipment:[],tabOrder:['scheda']}:
 {description:'Dato originale',notes:'Note',tabOrder:['scheda'],freschezza:12,attacco:'Base'}});
async function fixture(){
 const db=new PGlite();
 const directory=new URL('../sql/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=38&&![35,36,37].includes(Number(name.slice(0,3)))).sort())
  await db.exec(readFileSync(new URL(name,directory),'utf8'));
 await db.exec(readFileSync(new URL('catalog/001_unassigned_catalog.sql',directory),'utf8'));
 await db.exec(readFileSync(new URL('catalog/002_notes_and_duplication.sql',directory),'utf8'));
  await db.exec(readFileSync(new URL('catalog/003_catalog_assign_copy.sql',directory),'utf8'));
  await db.exec(readFileSync(new URL('catalog/004_catalog_copy_authorization.sql',directory),'utf8'));
  await db.exec(readFileSync(new URL('catalog/005_native_catalog_lifecycle.sql',directory),'utf8'));
 await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
  VALUES($1,'catalog-owner@example.invalid','Catalog Owner','active',now(),'local')`,[owner]);
 const campaignId=(await db.query(`INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset)
  VALUES($1,'Catalog Campaign','','hsc') RETURNING id`,[owner])).rows[0].id;
 await db.query(`GRANT EXECUTE ON FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign(uuid,text,uuid,uuid,integer) TO hollowgate_api_runtime;`);
 await db.exec('SET ROLE hollowgate_api_runtime;');
 const pool={query:(text,args)=>db.query(text,args)};
 return {db,service:createUnassignedCatalogService({pool}),
  notes:createUnassignedCatalogNotesService({pool}),campaignId};
}
const rejected=status=>error=>error.status===status;

test('copy to campaign creates assigned entity with media and notes in one transaction',async()=>{
 const {db,service,notes,campaignId}=await fixture();
 try{
  const draft=body('characters');
  const {item:src}=await service.create(owner,'characters',draft);
  let rev=src.revision;
  await service.saveMedia(owner,'characters',src.id,'portrait',{mimeType:'image/png',dataBase64:png,revision:rev});
  rev++;
  await service.saveMedia(owner,'characters',src.id,'cover',{mimeType:'image/png',dataBase64:png,revision:rev});
  rev++;
  const rootNote=await notes.create(owner,'characters',src.id,{revision:rev,tabName:'Radice'});
  rev=rootNote.item.revision;
  const child=await notes.create(owner,'characters',src.id,{revision:rev,tabName:'Figlio',parentId:rootNote.note.id});
  rev=child.item.revision;
  const copy=await service.copyToCampaign(owner,'characters',src.id,{revision:rev,targetCampaignId:campaignId});
  assert.notEqual(copy.item.id,src.id);
  assert.equal(copy.item.campaignId,campaignId);
  assert.equal(copy.item.ownerId,owner);
  assert.equal(copy.item.media.length,2);
  assert.equal(copy.item.media.filter(m=>m.role==='portrait').length,1);
  assert.equal(copy.item.media.filter(m=>m.role==='cover').length,1);
  const source=await service.read(owner,'characters',src.id);
  assert.equal(source.item.campaignId,null);
  assert.equal(source.item.id,src.id);
  await db.exec('RESET ROLE;');
  const noteRows=await db.query(`SELECT count(*)::int AS n,count(DISTINCT parent_note_id)::int AS roots
   FROM hollowgate_vtt.catalog_entity_notes WHERE kind='characters' AND entity_id=$1 AND status='active'`,
   [copy.item.id]);
  assert.equal(noteRows.rows[0].n,2);
  assert.equal(noteRows.rows[0].roots,1);
  const copyRow=await db.query(`SELECT campaign_id FROM hollowgate_vtt.catalog_entities WHERE kind='characters' AND id=$1`,
   [copy.item.id]);
  assert.equal(copyRow.rows[0].campaign_id,campaignId);
 }finally{await db.close();}
});

test('copy to campaign refuses stale revision with 409 and keeps source intact',async()=>{
 const {db,service,campaignId}=await fixture();
 try{
  const draft=body('npcs');
  const {item:src}=await service.create(owner,'npcs',draft);
  await assert.rejects(()=>service.copyToCampaign(owner,'npcs',src.id,{revision:999,targetCampaignId:campaignId}),rejected(409));
  const unchanged=await service.read(owner,'npcs',src.id);
  assert.equal(unchanged.item.revision,1);
  assert.equal(unchanged.item.campaignId,null);
 }finally{await db.close();}
});

test('copy to campaign refuses unknown campaign and unowned source',async()=>{
 const {db,service,campaignId}=await fixture();
 try{
  const draft=body('monsters');
  const {item:src}=await service.create(owner,'monsters',draft);
  await assert.rejects(()=>service.copyToCampaign(owner,'monsters',src.id,{revision:1,targetCampaignId:unknownCampaign}),rejected(404));
  const other='00000000-0000-4000-8000-000000000002';
  await assert.rejects(()=>service.copyToCampaign(other,'monsters',src.id,{revision:1,targetCampaignId:campaignId}),rejected(404));
 }finally{await db.close();}
});

test('copy rejects another GM campaign for all kinds without copying anything',async()=>{
 const {db,service,campaignId}=await fixture();
 try{
  const other='00000000-0000-4000-8000-000000000002';
  await db.exec('RESET ROLE');
  await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
   VALUES($1,'other@example.invalid','Other','active',now(),'local')`,[other]);
  const target=(await db.query(`INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset)
   VALUES($1,'Other Campaign','','hsc') RETURNING id`,[other])).rows[0].id;
  await db.exec('SET ROLE hollowgate_api_runtime');
  for(const kind of ['characters','npcs','monsters']){
   const {item}=await service.create(owner,kind,body(kind));
   await assert.rejects(service.copyToCampaign(owner,kind,item.id,{revision:item.revision,targetCampaignId:target}),rejected(404));
   assert.equal((await service.read(owner,kind,item.id)).item.revision,item.revision);
  }
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hollowgate_vtt.catalog_entities WHERE campaign_id IS NOT NULL')).rows[0].n,0);
  assert.equal((await db.query(`SELECT has_function_privilege('hollowgate_api_runtime',
   'hollowgate_vtt.copy_unassigned_catalog_to_campaign_v003(uuid,text,uuid,uuid,integer)','EXECUTE') AS allowed`)).rows[0].allowed,false);
 }finally{await db.close();}
});

test('copy rejects incompatible rulesets without modifying notes or media',async()=>{
 const {db,service,notes}=await fixture();
 try{
  await db.exec('RESET ROLE');
  const target=(await db.query(`INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset)
   VALUES($1,'Custom Campaign','','custom') RETURNING id`,[owner])).rows[0].id;
  await db.exec('SET ROLE hollowgate_api_runtime');
  const {item}=await service.create(owner,'npcs',body('npcs'));
  const media=await service.saveMedia(owner,'npcs',item.id,'portrait',{revision:item.revision,mimeType:'image/png',dataBase64:png});
  const note=await notes.create(owner,'npcs',item.id,{revision:media.item.revision,tabName:'Privata'});
  await assert.rejects(service.copyToCampaign(owner,'npcs',item.id,
   {revision:note.item.revision,targetCampaignId:target}),rejected(400));
  assert.equal((await service.read(owner,'npcs',item.id)).item.revision,note.item.revision);
  assert.equal((await notes.list(owner,'npcs',item.id)).notes.length,1);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hollowgate_vtt.catalog_entities')).rows[0].n,1);
 }finally{await db.close();}
});

test('startup preflight accepts the real secure schema under restricted runtime only',async()=>{
 const {db}=await fixture();
 try{
  const config={flag:'true',authEnabled:true,campaigns:{},pool:{query:(text,args)=>db.query(text,args)}};
  const services=await configureNativeCatalog(config);
  assert.equal(typeof services.unassignedCatalog.copyToCampaign,'function');
  await db.exec('RESET ROLE');
  await db.exec(`REVOKE EXECUTE ON FUNCTION hollowgate_vtt.save_unassigned_catalog_media(uuid,text,uuid,integer,text,text,bytea)
   FROM hollowgate_api_runtime`);
  await db.exec('SET ROLE hollowgate_api_runtime');
  await assert.rejects(configureNativeCatalog(config),/restricted runtime grants/);
  await db.exec('RESET ROLE');
  await db.exec(`GRANT EXECUTE ON FUNCTION hollowgate_vtt.save_unassigned_catalog_media(uuid,text,uuid,integer,text,text,bytea)
   TO hollowgate_api_runtime`);
  await db.exec(`GRANT EXECUTE ON FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign_v003(uuid,text,uuid,uuid,integer)
   TO hollowgate_api_runtime`);
  await db.exec('SET ROLE hollowgate_api_runtime');
  await assert.rejects(configureNativeCatalog(config),/restricted runtime grants/);
 }finally{await db.close();}
});
