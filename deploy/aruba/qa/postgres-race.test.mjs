// Real multi-connection PostgreSQL only. No fallback to PGlite.
// Explicit HG_DISPOSABLE_PG_RACE=1 + empty hollowgate_race_* DB required.
// These tests install migrations in that DB, never in operational/staging DBs.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Pool} from 'pg';
import {postgresRaceConfig,assertEmptyRaceDatabase} from './postgres-race-config.mjs';
const config=postgresRaceConfig(process.env);
const skip=config===null;
let pool;
const gm='71000000-0000-4000-8000-000000000001';
const playerA='71000000-0000-4000-8000-000000000002',playerB='71000000-0000-4000-8000-000000000003';
const campaign='71000000-0000-4000-8000-000000000004',campaignB='71000000-0000-4000-8000-000000000005';
const character='71000000-0000-4000-8000-000000000006',catalogId='71000000-0000-4000-8000-000000000007';
const sheet=JSON.stringify({style:'Jock',viaggio:'Race',ambiti:{},abilita:{},tratti:[],equipment:[]});
before(async()=>{
 if(skip)return;
 const password=process.env.PGPASSWORD_FILE?readFileSync(process.env.PGPASSWORD_FILE,'utf8').trim():undefined;
 pool=new Pool({...config,...(password===undefined?{}:{password})});
 await assertEmptyRaceDatabase(pool,config.database);
 const directory=new URL('../sql/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&
  Number(name.slice(0,3))<=39&&![35,36,37].includes(Number(name.slice(0,3)))).sort()){
  await pool.query(readFileSync(new URL(name,directory),'utf8'));
 }
 for(const name of ['001_unassigned_catalog.sql','002_notes_and_duplication.sql',
  '003_catalog_assign_copy.sql','004_catalog_copy_authorization.sql','005_native_catalog_lifecycle.sql']){
  await pool.query(readFileSync(new URL('catalog/'+name,directory),'utf8'));
 }
});
after(async()=>{await pool?.end();});
async function roleQuery(sql,args){
 const connection=await pool.connect();
 try{
  await connection.query('BEGIN');
  await connection.query('SET LOCAL ROLE hollowgate_api_runtime');
  const result=await connection.query(sql,args);
  await connection.query('COMMIT');
  return result;
 }catch(error){await connection.query('ROLLBACK');throw error;}
 finally{connection.release();}
}
async function fixture(){
 // Called only AFTER dedicated empty-DB authorization, never with app config.
 await pool.query('DELETE FROM hollowgate_vtt.catalog_duplicate_requests WHERE actor_id=$1',[gm]);
 await pool.query(`DELETE FROM hollowgate_vtt.catalog_entity_notes WHERE (kind,entity_id) IN
  (SELECT kind,id FROM hollowgate_vtt.catalog_entities WHERE owner_id=$1)`,[gm]);
 await pool.query(`DELETE FROM hollowgate_vtt.catalog_entity_media WHERE (kind,entity_id) IN
  (SELECT kind,id FROM hollowgate_vtt.catalog_entities WHERE owner_id=$1)`,[gm]);
 await pool.query('DELETE FROM hollowgate_vtt.catalog_entities WHERE owner_id=$1',[gm]);
 await pool.query('DELETE FROM hollowgate_vtt.character_claims WHERE character_id=$1',[character]);
 await pool.query('DELETE FROM hollowgate_vtt.character_player_assignments WHERE character_id=$1',[character]);
 await pool.query('DELETE FROM hollowgate_vtt.character_drafts WHERE id=$1',[character]);
 await pool.query('DELETE FROM hollowgate_vtt.campaign_members WHERE campaign_id IN ($1,$2)',[campaign,campaignB]);
 await pool.query('DELETE FROM hollowgate_vtt.campaigns WHERE id IN ($1,$2)',[campaign,campaignB]);
 await pool.query('DELETE FROM hollowgate_auth.users WHERE id IN ($1,$2,$3)',[gm,playerA,playerB]);
 await pool.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
  ($1,'race-gm@example.invalid','Race GM','active',now(),'local'),
  ($2,'race-a@example.invalid','Race A','active',now(),'local'),
  ($3,'race-b@example.invalid','Race B','active',now(),'local')`,[gm,playerA,playerB]);
 await pool.query(`INSERT INTO hollowgate_vtt.campaigns(id,owner_id,name,description,ruleset) VALUES
  ($1,$2,'Race campaign','','hsc'),($3,$2,'Race campaign B','','hsc')`,[campaign,gm,campaignB]);
 for(const player of [playerA,playerB])
  await pool.query(`SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,'player',true)`,[gm,campaign,player]);
 await pool.query(`INSERT INTO hollowgate_vtt.character_drafts
  (id,campaign_id,owner_id,name,sheet_data,status,available_for_players,logical_owner_id,original_owner_id,claimable_origin,ruleset)
  VALUES($1,$2,$3,'Race PG',$4::jsonb,'active',true,$3,$3,true,'hsc')`,[character,campaign,gm,sheet]);
 await pool.query(`INSERT INTO hollowgate_vtt.catalog_entities(kind,id,owner_id,name,ruleset,data)
  VALUES('characters',$1,$2,'Race Entity','hsc',$3::jsonb)`,[catalogId,gm,sheet]);
}
test('postgres race: claim has exactly one winner, atomic assignment and release',{skip},async()=>{
 await fixture();
 const results=await Promise.all([playerA,playerB].map(player=>
  roleQuery('SELECT hollowgate_vtt.claim_available_character($1,$2) AS campaign_id',[player,character])));
 assert.equal(results.filter(r=>r.rows[0].campaign_id===campaign).length,1);
 assert.equal(results.filter(r=>r.rows[0].campaign_id===null).length,1);
 const winner=results[0].rows[0].campaign_id===campaign?playerA:playerB;
 for(const table of ['character_claims','character_player_assignments']){
  const {rows}=await pool.query(`SELECT player_id FROM hollowgate_vtt.${table} WHERE character_id=$1`,[character]);
  assert.deepEqual(rows,[{player_id:winner}]);
 }
 assert.equal((await roleQuery('SELECT hollowgate_vtt.release_claimed_character($1,$2) AS id',[winner,character])).rows[0].id,character);
 for(const table of ['character_claims','character_player_assignments'])
  assert.equal((await pool.query(`SELECT 1 FROM hollowgate_vtt.${table} WHERE character_id=$1`,[character])).rows.length,0);
});
test('postgres race: CAS save has one writer and a real serialization conflict',{skip},async()=>{
 await fixture();
 const results=await Promise.allSettled(['A','B'].map(version=>roleQuery(
  'SELECT hollowgate_vtt.save_unassigned_catalog_entry($1,$2,$3,$4,$5,$6,$7::jsonb) AS item',
  [gm,'characters',catalogId,1,'Race Entity','hsc',JSON.stringify({...JSON.parse(sheet),version})])));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const failures=results.filter(r=>r.status==='rejected');
 assert.equal(failures.length,1);assert.equal(failures[0].reason.code,'40001');
 const {rows}=await pool.query("SELECT revision,data->>'version' AS version FROM hollowgate_vtt.catalog_entities WHERE id=$1",[catalogId]);
 assert.equal(rows[0].revision,2);assert.match(rows[0].version,/^[AB]$/);
});
test('postgres race: concurrent copies keep independent identities, notes and media',{skip},async()=>{
 await fixture();
 await roleQuery(`SELECT hollowgate_vtt.save_unassigned_catalog_media($1,'characters',$2,1,
  'portrait','image/png',decode('89504e470d0a1a0a00000000','hex'))`,[gm,catalogId]);
 await roleQuery("SELECT hollowgate_vtt.create_unassigned_catalog_note($1,'characters',$2,2,'Radice',NULL)",[gm,catalogId]);
 const copies=await Promise.all([campaign,campaignB].map(target=>roleQuery(
  "SELECT hollowgate_vtt.copy_unassigned_catalog_to_campaign($1,'characters',$2,$3,3) AS item",[gm,catalogId,target])));
 const [a,b]=copies.map(r=>r.rows[0].item);
 assert.notEqual(a.id,b.id);
 assert.equal(a.campaignId,campaign);assert.equal(b.campaignId,campaignB);
 for(const item of [a,b]){
  assert.equal(item.media.length,1);
  const {rows}=await pool.query('SELECT count(*)::int AS n FROM hollowgate_vtt.catalog_entity_notes WHERE entity_id=$1',[item.id]);
  assert.equal(rows[0].n,1);
 }
 const {rows}=await pool.query('SELECT campaign_id,revision FROM hollowgate_vtt.catalog_entities WHERE id=$1',[catalogId]);
 assert.deepEqual(rows,[{campaign_id:null,revision:3}]);
});
