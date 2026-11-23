// In-memory PostgreSQL, actual SQL + restricted role + real service/HTTP.
// No VPS, credentials, exports or active databases are used.
// Applies migrations 001-038 (excluding 35/36/37 staging-only DO blocks) plus
// native catalog migrations 001-003 (assign/copy to campaign).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createUnassignedCatalogService} from '../../../apps/aruba-api/src/unassigned-catalog-service.mjs';
import {createUnassignedCatalogNotesService} from '../../../apps/aruba-api/src/unassigned-catalog-notes-service.mjs';
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
