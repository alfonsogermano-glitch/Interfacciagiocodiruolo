// Multi-connection PostgreSQL race QA for character claim/assign and catalog copy.
// Requires a real PostgreSQL instance (PGlite serializes statements and cannot
// prove genuine lock contention). Set PGHOST/PGPORT/PGUSER/PGDATABASE and
// PGPASSWORD_FILE to connect. Skips all cases when no server is reachable.
// No VPS, credentials, exports or active databases are used here; this file
// only defines the test. It must be run against a disposable staging/test DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Pool} from 'pg';

const PGHOST=process.env.PGHOST;
const PGPORT=process.env.PGPORT??'5432';
const PGUSER=process.env.PGUSER??'hollowgate_auth_app';
const PGDATABASE=process.env.PGDATABASE??'hollowgate_auth_test';
let pgPasswordFile=process.env.PGPASSWORD_FILE;
let pgPool;let pgReady=false;

async function openPg(){
 if(!PGHOST)return;
 try{
  const cfg={host:PGHOST,port:Number(PGPORT),user:PGUSER,database:PGDATABASE};
  if(pgPasswordFile){
   const fs=await import('node:fs');
   cfg.password=fs.readFileSync(pgPasswordFile,'utf8').trim();
  }
  pgPool=new Pool(cfg);
  await pgPool.query('SELECT 1');
  pgReady=true;
 }catch{pgReady=false;pgPool=undefined;}
}

await openPg();

const gm='71000000-0000-4000-8000-000000000001';
const playerA='71000000-0000-4000-8000-000000000002';
const playerB='71000000-0000-4000-8000-000000000003';
const campaign='71000000-0000-4000-8000-000000000004';
const campaignB='71000000-0000-4000-8000-000000000005';
const character='71000000-0000-4000-8000-000000000006';
const catalogId='71000000-0000-4000-8000-000000000007';
const catalogKind='characters';
const sheet='{"style":"Jock","viaggio":"Race","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}';

async function applyMigrations(){
 const directory=new URL('../sql/',import.meta.url);
 const names=readdirSync(directory).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=38&&![35,36,37].includes(Number(name.slice(0,3)))).sort();
 for(const name of names) await pgPool.query(readFileSync(new URL(name,directory),'utf8'));
 for(const rel of ['catalog/001_unassigned_catalog.sql','catalog/002_notes_and_duplication.sql','catalog/003_catalog_assign_copy.sql']){
  await pgPool.query(readFileSync(new URL(rel,directory),'utf8'));
 }
 await pgPool.query(`GRANT EXECUTE ON FUNCTION hollowgate_vtt.claim_available_character(uuid,uuid) TO hollowgate_api_runtime;`);
 await pgPool.query(`GRANT EXECUTE ON FUNCTION hollowgate_vtt.release_claimed_character(uuid,uuid) TO hollowgate_api_runtime;`);
 await pgPool.query(`GRANT EXECUTE ON FUNCTION hollowgate_vtt.assign_logical_character_to_campaign(uuid,uuid,uuid) TO hollowgate_api_runtime;`);
 await pgPool.query(`GRANT EXECUTE ON FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign(uuid,text,uuid,uuid,integer) TO hollowgate_api_runtime;`);
}

async function resetFixture(){
 await pgPool.query(`DELETE FROM hollowgate_vtt.character_claims WHERE character_id IN ($1,$2) OR campaign_id IN ($3,$4)`,[character,catalogId,campaign,campaignB]);
 await pgPool.query(`DELETE FROM hollowgate_vtt.character_player_assignments WHERE character_id IN ($1,$2) OR campaign_id IN ($3,$4)`,[character,catalogId,campaign,campaignB]);
 await pgPool.query(`DELETE FROM hollowgate_vtt.catalog_entities WHERE id IN ($1,$2)`,[catalogId]);
 await pgPool.query(`DELETE FROM hollowgate_vtt.character_drafts WHERE id IN ($1,$2)`,[character]);
 await pgPool.query(`DELETE FROM hollowgate_vtt.campaign_members WHERE campaign_id IN ($1,$2)`,[campaign,campaignB]);
 await pgPool.query(`DELETE FROM hollowgate_vtt.campaigns WHERE id IN ($1,$2)`,[campaign,campaignB]);
 await pgPool.query(`DELETE FROM hollowgate_auth.users WHERE id IN ($1,$2,$3)`,[gm,playerA,playerB]);
 await pgPool.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
  ($1,'race-gm@example.invalid','Race GM','active',now(),'local'),
  ($2,'race-a@example.invalid','Race A','active',now(),'local'),
  ($3,'race-b@example.invalid','Race B','active',now(),'local')`,[gm,playerA,playerB]);
 await pgPool.query(`INSERT INTO hollowgate_vtt.campaigns(id,owner_id,name,description,ruleset) VALUES
  ($1,$2,'Race campaign','','hsc'),($3,$2,'Race campaign B','','hsc')`,[campaign,gm,campaignB]);
 await pgPool.query(`SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,'player',true)`,[gm,campaign,playerA]);
 await pgPool.query(`SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,'player',true)`,[gm,campaign,playerB]);
 await pgPool.query(`INSERT INTO hollowgate_vtt.character_drafts(id,campaign_id,owner_id,name,sheet_data,status,available_for_players,logical_owner_id,original_owner_id,claimable_origin,ruleset)
  VALUES($1,$2,$3,'Race PG',$4::jsonb,'active',true,NULL,NULL,false,NULL)`,[character,campaign,gm,sheet]);
 await pgPool.query(`INSERT INTO hollowgate_vtt.catalog_entities(kind,id,owner_id,name,ruleset,data,campaign_id,revision)
  VALUES($1,$2,$3,'Race Entity','hsc',$5::jsonb,NULL,1)`,[catalogKind,catalogId,gm,JSON.stringify({style:'Jock'})]);
}

async function roleQuery(sql,args){
 return pgPool.query(`SET ROLE hollowgate_api_runtime;${sql}`,args);
}

async function claimConcurrent(winnerId){
 const a=pgPool.query(`SET ROLE hollowgate_api_runtime;SELECT coalesce(hollowgate_vtt.claim_available_character($1,$2)::text,'NONE')`,[winnerId===playerA?playerB:playerA,character]);
 const b=pgPool.query(`SET ROLE hollowgate_api_runtime;SELECT coalesce(hollowgate_vtt.claim_available_character($1,$2)::text,'NONE')`,[winnerId===playerA?playerA:playerB,character]);
 const [ra,rb]=await Promise.all([a,b]);
 return {a:ra.rows[0].coalesce,b:rb.rows[0].coalesce};
}

test('postgres race: claim allows exactly one winner and atomic claim+assignment',{skip:!pgReady},async()=>{
 assert.ok(pgPool,'PostgreSQL pool required for race test');
 await applyMigrations();
 await resetFixture();
 try{
  const {a,b}=await claimConcurrent(playerA);
  const winnerCount=(a===campaign?1:0)+(b===campaign?1:0);
  const noneCount=(a==='NONE'?1:0)+(b==='NONE'?1:0);
  assert.equal(winnerCount,1,`Expected exactly one claim winner, got A=${a} B=${b}`);
  assert.equal(noneCount,1,`Expected exactly one claim loser, got A=${a} B=${b}`);
  const winner=a===campaign?playerA:playerB;
  const state=await pgPool.query(`SELECT count(*)::int,min(player_id::text) FROM hollowgate_vtt.character_claims WHERE character_id=$1`,[character]);
  assert.equal(state.rows[0].count,1);
  assert.equal(state.rows[0].min,winner);
  const assignment=await pgPool.query(`SELECT count(*)::int,min(player_id::text) FROM hollowgate_vtt.character_player_assignments WHERE character_id=$1`,[character]);
  assert.equal(assignment.rows[0].count,1);
  assert.equal(assignment.rows[0].min,winner);
  // Release by winner is atomic and clears claim+assignment.
  const released=await roleQuery(`SELECT hollowgate_vtt.release_claimed_character($1,$2)`,[winner,character]);
  assert.equal(released.rows[0].release_claimed_character,character);
  const remaining=await pgPool.query(`SELECT (SELECT count(*) FROM hollowgate_vtt.character_claims WHERE character_id=$1)::int||':'||(SELECT count(*) FROM hollowgate_vtt.character_player_assignments WHERE character_id=$1)::int AS remaining`,[character]);
  assert.equal(remaining.rows[0].remaining,'0:0');
 }finally{
  await pgPool.query(`DELETE FROM hollowgate_vtt.character_claims WHERE character_id=$1`,[character]);
  await pgPool.query(`DELETE FROM hollowgate_vtt.character_player_assignments WHERE character_id=$1`,[character]);
 }
});

test('postgres race: concurrent save CAS allows exactly one writer on same revision',{skip:!pgReady},async()=>{
 assert.ok(pgPool,'PostgreSQL pool required for race test');
 await applyMigrations();
 await resetFixture();
 try{
  const saveA=pgPool.query(`SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.save_unassigned_catalog_entry($1,$2,$3,$4,$5,$6,$7::jsonb) AS item`,
   [gm,catalogKind,catalogId,1,'Race Entity','hsc',JSON.stringify({style:'Jock',version:'A'})]);
  const saveB=pgPool.query(`SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.save_unassigned_catalog_entry($1,$2,$3,$4,$5,$6,$7::jsonb) AS item`,
   [gm,catalogKind,catalogId,1,'Race Entity','hsc',JSON.stringify({style:'Jock',version:'B'})]);
  const results=await Promise.allSettled([saveA,saveB]);
  const fulfilled=results.filter(r=>r.status==='fulfilled').length;
  const rejected=results.filter(r=>r.status==='rejected').length;
  assert.equal(fulfilled,1,'Expected exactly one successful CAS save');
  assert.equal(rejected,1,'Expected exactly one rejected CAS save');
  const entry=await pgPool.query(`SELECT revision,data->>'version' AS version FROM hollowgate_vtt.catalog_entities WHERE id=$1`,[catalogId]);
  assert.equal(entry.rows[0].revision,2);
  assert.match(entry.rows[0].version,/^[AB]$/);
 }finally{
  await pgPool.query(`DELETE FROM hollowgate_vtt.catalog_entities WHERE id=$1`,[catalogId]);
 }
});

test('postgres race: concurrent copy creates distinct copies with atomic media+notes',{skip:!pgReady},async()=>{
 assert.ok(pgPool,'PostgreSQL pool required for race test');
 await applyMigrations();
 await resetFixture();
 try{
  // Add media and a note to the catalog entity.
  await pgPool.query(`SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.save_unassigned_catalog_media($1,$2,$3,$4,'portrait','image/png',decode('89504e470d0a1a0a00000000','hex'))`,
   [gm,catalogKind,catalogId,1]);
  await pgPool.query(`SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.create_unassigned_catalog_note($1,$2,$3,$4,$5,NULL)`,
   [gm,catalogKind,catalogId,2,'Nota radice']);
  // Two concurrent copies toward different campaigns, same observed revision.
  const copyA=pgPool.query(`SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.copy_unassigned_catalog_to_campaign($1,$2,$3,$4,$5) AS item`,
   [gm,catalogKind,catalogId,campaign,3]);
  const copyB=pgPool.query(`SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.copy_unassigned_catalog_to_campaign($1,$2,$3,$4,$5) AS item`,
   [gm,catalogKind,catalogId,campaignB,3]);
  const [ra,rb]=await Promise.all([copyA,copyB]);
  const idA=ra.rows[0].item.id;const idB=rb.rows[0].item.id;
  assert.ok(idA&&idB,'Both concurrent copies must produce a result');
  assert.notEqual(idA,idB,'Concurrent copies must create distinct entities');
  assert.equal(ra.rows[0].item.campaign_id,campaign);
  assert.equal(rb.rows[0].item.campaign_id,campaignB);
  assert.equal(ra.rows[0].item.media.length,1);
  assert.equal(rb.rows[0].item.media.length,1);
  // Source remains unassigned.
  const src=await pgPool.query(`SELECT campaign_id FROM hollowgate_vtt.catalog_entities WHERE id=$1`,[catalogId]);
  assert.equal(src.rows[0].campaign_id,null);
 }finally{
  await pgPool.query(`DELETE FROM hollowgate_vtt.catalog_entities WHERE id IN ($1,$2,$3)`,[catalogId]);
 }
});
