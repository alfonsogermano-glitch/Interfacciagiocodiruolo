// Real in-memory PostgreSQL query tests, synthetic rows only. Not a live audit
// or a substitute for the eventual catalog migration/permission/race tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql=readFileSync(new URL('./catalog-provenance-audit.sql',import.meta.url),'utf8').replace(/^\\set.*$/m,'');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE SCHEMA hollowgate_auth; CREATE SCHEMA hollowgate_vtt;
  CREATE TABLE hollowgate_auth.users(id uuid PRIMARY KEY,status text,email_verified_at timestamptz);
  CREATE TABLE hollowgate_vtt.campaigns(id uuid PRIMARY KEY,owner_id uuid);
  CREATE TABLE hollowgate_vtt.character_drafts(id uuid PRIMARY KEY,campaign_id uuid,owner_id uuid,status text,sheet_data jsonb);
  CREATE TABLE hollowgate_vtt.narrative_content_documents(id uuid,campaign_id uuid,kind text,payload jsonb,PRIMARY KEY(id,campaign_id,kind));
  CREATE TABLE hollowgate_vtt.migration_source_records(source_table text,source_id text,target_table text,target_id text,source_payload jsonb,PRIMARY KEY(source_table,source_id));
  CREATE TABLE hollowgate_vtt.character_claims(character_id uuid PRIMARY KEY,campaign_id uuid,original_owner_id uuid,player_id uuid);
  CREATE TABLE hollowgate_vtt.character_player_assignments(character_id uuid PRIMARY KEY,campaign_id uuid,player_id uuid);
  CREATE TABLE hollowgate_vtt.campaign_members(campaign_id uuid,user_id uuid,status text,member_role text);
 `);
 return db;
}
async function character(db,n,originalOwner=id(2)){
 await db.query('INSERT INTO hollowgate_vtt.character_drafts VALUES($1,$2,$3,\'active\',$4)',[id(n),id(20),id(1),{sourceRecord:{owner_profile_id:id(999),campaign_id:null}}]);
 await source(db,'characters',n,{owner_profile_id:originalOwner,campaign_id:id(20)});
}
async function source(db,kind,n,payload,targetId=id(n),sourceId=id(n)){
 await db.query('INSERT INTO hollowgate_vtt.migration_source_records VALUES($1,$2,$3,$4,$5)',
  [kind,sourceId,kind==='characters'?'hollowgate_vtt.character_drafts':'hollowgate_vtt.narrative_content_documents',targetId,payload]);
}
async function audit(db){
 const results=await db.exec(sql);
 const rows=results.flatMap(result=>result.rows);
 for(const row of rows)assert.deepEqual(Object.keys(row),['kind','metric','count']);
 return (kind,metric)=>Number(rows.find(row=>row.kind===kind&&row.metric===metric)?.count??0);
}

test('audit distinguishes current claim, assignment-only and absent claim without restoring historical owners',async()=>{
 const db=await fixture();
 try{
  await db.query('INSERT INTO hollowgate_vtt.campaigns VALUES($1,$2)',[id(20),id(1)]);
  await db.query("INSERT INTO hollowgate_auth.users VALUES($1,'active',now())",[id(3)]);
  await db.query("INSERT INTO hollowgate_vtt.campaign_members VALUES($1,$2,'active','player')",[id(20),id(3)]);
  for(const n of [30,31,32])await character(db,n);
  await db.query('INSERT INTO hollowgate_vtt.character_claims VALUES($1,$2,$3,$4)',[id(30),id(20),id(1),id(3)]);
  for(const n of [30,31])await db.query('INSERT INTO hollowgate_vtt.character_player_assignments VALUES($1,$2,$3)',[id(n),id(20),id(3)]);
  let metric=await audit(db);
  assert.equal(metric('characters','historical_owner_differs_physical'),3);
  assert.equal(metric('characters','historical_owner_differs_without_current_claim'),2);
  assert.equal(metric('characters','current_claims'),1);
  assert.equal(metric('characters','assignment_without_claim'),1);
  assert.equal(metric('characters','claim_assignment_mismatch'),0);
  assert.equal(metric('characters','claim_physical_context_mismatch'),0);
  assert.equal(metric('characters','claim_inactive_or_missing_player_membership'),0);
  // Simulate a later release. Historical provenance remains, but is not a
  // license to recreate the old player or the current claimant.
  await db.exec('DELETE FROM hollowgate_vtt.character_claims; DELETE FROM hollowgate_vtt.character_player_assignments;');
  metric=await audit(db);
  assert.equal(metric('characters','historical_owner_differs_without_current_claim'),3);
  assert.equal(metric('characters','current_claims'),0);
  assert.equal((await db.query('SELECT owner_id FROM hollowgate_vtt.character_drafts LIMIT 1')).rows[0].owner_id,id(1));
 }finally{await db.close();}
});

test('audit uses ledger only, treats absent/invalid historical placement as unknown and detects ID collisions',async()=>{
 const db=await fixture();
 try{
  for(const [n,payload] of [[40,{campaign_id:null,owner_profile_id:id(1)}],[41,{}],[42,{campaign_id:'bad',owner_profile_id:'old-player'}]]){
   await source(db,'npcs',n,payload);
   await db.query("INSERT INTO hollowgate_vtt.narrative_content_documents VALUES($1,$2,'npcs',$3)",[id(n),id(20),{sourceCampaignId:null,ownerProfileId:id(999)}]);
  }
  await db.query("INSERT INTO hollowgate_vtt.narrative_content_documents VALUES($1,$2,'npcs','{}')",[id(40),id(21)]);
  // Same ID in another kind is not a collision within that kind.
  await db.query("INSERT INTO hollowgate_vtt.narrative_content_documents VALUES($1,$2,'monsters','{}')",[id(40),id(20)]);
  await source(db,'npcs',43,{campaign_id:id(20)}); // missing target
  const metric=await audit(db);
  assert.equal(metric('npcs','current_rows'),4);
  assert.equal(metric('npcs','historically_unassigned'),1);
  assert.equal(metric('npcs','historical_placement_unknown'),2);
  assert.equal(metric('npcs','ledger_target_ambiguous'),1);
  assert.equal(metric('npcs','identifier_collision_groups'),1);
  assert.equal(metric('npcs','ledger_target_missing'),1);
  assert.equal(metric('monsters','identifier_collision_groups'),0);
  assert.equal(metric('monsters','current_without_ledger'),1);
 }finally{await db.close();}
});

test('duplicate provenance and non-UUID legacy owners require review, never an ownership guess',async()=>{
 const db=await fixture();
 try{
  await character(db,30,'legacy-player-id');
  await character(db,31,id(1));
  await source(db,'characters',32,{owner_profile_id:id(9),campaign_id:null},id(31));
  const metric=await audit(db);
  assert.equal(metric('characters','historical_owner_needs_user_mapping_or_review'),1);
  assert.equal(metric('characters','current_multiple_ledger_sources'),1);
  assert.equal(metric('characters','historical_owner_differs_physical'),0);
 }finally{await db.close();}
});

test('text ledger UUID casing does not turn an existing target into a missing one',async()=>{
 const db=await fixture();
 try{
  const upper='ABCDEFAB-1234-4000-8000-ABCDEFABCDEF';
  await db.query("INSERT INTO hollowgate_vtt.narrative_content_documents VALUES($1,$2,'monsters','{}')",[upper,id(20)]);
  await source(db,'monsters',30,{campaign_id:null,owner_profile_id:id(1)},upper);
  const metric=await audit(db);
  assert.equal(metric('monsters','current_rows'),1);
  assert.equal(metric('monsters','current_without_ledger'),0);
  assert.equal(metric('monsters','ledger_target_missing'),0);
 }finally{await db.close();}
});

test('inconsistent claims and inactive membership are visible, not silently repaired',async()=>{
 const db=await fixture();
 try{
  await character(db,30);
  await db.query('INSERT INTO hollowgate_vtt.campaigns VALUES($1,$2)',[id(20),id(1)]);
  await db.query('INSERT INTO hollowgate_vtt.character_claims VALUES($1,$2,$3,$4)',[id(30),id(21),id(1),id(3)]);
  let metric=await audit(db);
  assert.equal(metric('characters','claim_assignment_mismatch'),1);
  assert.equal(metric('characters','claim_physical_context_mismatch'),1);
  assert.equal(metric('characters','claim_inactive_or_missing_player_membership'),1);
  await db.query('INSERT INTO hollowgate_vtt.character_player_assignments VALUES($1,$2,$3)',[id(30),id(20),id(4)]);
  metric=await audit(db);
  assert.equal(metric('characters','claim_assignment_mismatch'),1);
  assert.equal((await db.query('SELECT player_id FROM hollowgate_vtt.character_player_assignments')).rows[0].player_id,id(4));
 }finally{await db.close();}
});

test('audit transaction is read-only, leaves no changes and needs explicit administrative read privileges',async()=>{
 const db=await fixture();
 try{
  await character(db,30);
  const before=(await db.query('SELECT * FROM hollowgate_vtt.character_drafts')).rows;
  await audit(db);
  assert.deepEqual((await db.query('SELECT * FROM hollowgate_vtt.character_drafts')).rows,before);
  const forbidden=sql.replace('SET LOCAL statement_timeout',"UPDATE hollowgate_vtt.character_drafts SET owner_id=owner_id;\nSET LOCAL statement_timeout");
  await assert.rejects(()=>db.exec(forbidden),/read-only transaction/i);
  await db.exec('ROLLBACK; CREATE ROLE catalog_audit_reader NOLOGIN; GRANT USAGE ON SCHEMA hollowgate_vtt,hollowgate_auth TO catalog_audit_reader; SET ROLE catalog_audit_reader;');
  await assert.rejects(()=>audit(db),/permission denied/i);
  await db.exec('ROLLBACK; RESET ROLE;');
  // Simulate an existing diagnostic-only role with SELECT, not a new API
  // grant. The script itself must neither create nor change permissions.
  await db.exec('GRANT SELECT ON ALL TABLES IN SCHEMA hollowgate_vtt,hollowgate_auth TO catalog_audit_reader; SET ROLE catalog_audit_reader;');
  assert.equal((await audit(db))('characters','current_rows'),1);
  await db.exec('RESET ROLE; DROP TABLE hollowgate_vtt.migration_source_records;');
  await assert.rejects(()=>audit(db),/does not exist/i);
  await db.exec('ROLLBACK;');
 }finally{await db.close();}
});

test('diagnostic executes against the actual migration chain, and existing API role cannot read it',async()=>{
 const db=new PGlite();
 try{
  const directory=new URL('../sql/',import.meta.url);
  const roots=readdirSync(directory).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=34).sort();
  assert.equal(roots.length,34);
  for(const name of roots)await db.exec(readFileSync(new URL(name,directory),'utf8'));
  for(const name of ['chapters/001_chapter_documents.sql','scenes/001_scene_documents.sql','visual-assets/001_visual_assets.sql',
   'narrative/001_narrative_content.sql','migration/001_source_records.sql']){
   await db.exec(readFileSync(new URL(name,directory),'utf8'));
  }
  assert.equal((await audit(db))('characters','current_claims'),0);
  await db.exec('SET ROLE hollowgate_api_runtime;');
  await assert.rejects(()=>audit(db),/permission denied/i);
  await db.exec('ROLLBACK; RESET ROLE;');
 }finally{await db.close();}
});
