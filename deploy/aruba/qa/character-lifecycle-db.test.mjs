// In-memory PostgreSQL, actual SQL + restricted role + real services.
// No VPS, credentials, exports or active databases are used. Migration 038 is
// applied here; the incremental catalog migrations are not part of this scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createCharacterService} from '../../../apps/aruba-api/src/character-service.mjs';
import {createCharacterClaimService} from '../../../apps/aruba-api/src/character-claim-service.mjs';
import {createCharacterAssignmentService} from '../../../apps/aruba-api/src/character-assignment-service.mjs';
import {createCharacterAvailabilityService} from '../../../apps/aruba-api/src/character-availability-service.mjs';
import {createLogicalCharacterService} from '../../../apps/aruba-api/src/logical-character-service.mjs';
const owner='71000000-0000-4000-8000-000000000001';
const player='71000000-0000-4000-8000-000000000002';
const campaign='71000000-0000-4000-8000-000000000003';
const campaign2='71000000-0000-4000-8000-000000000004';
const char='71000000-0000-4000-8000-000000000005';
const sheet={style:'Jock',viaggio:'Campione',ambiti:{},abilita:{},tratti:[],equipment:[]};
const sheetBody={campaignId:campaign,name:'Available A',sheetData:sheet};
const bad=status=>error=>error.status===status;
async function fixture(){
 const db=new PGlite();
 const directory=new URL('../sql/',import.meta.url);
 const names=readdirSync(directory).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=38&&![35,36,37].includes(Number(name.slice(0,3)))).sort();
 for(const name of names) await db.exec(readFileSync(new URL(name,directory),'utf8'));
 const routines=[
  ['hollowgate_vtt.create_owned_campaign','uuid,text,text,text'],
  ['hollowgate_vtt.set_campaign_membership','uuid,uuid,uuid,text,boolean'],
  ['hollowgate_vtt.create_character_draft','uuid,uuid,text'],
  ['hollowgate_vtt.list_character_drafts','uuid,uuid'],
  ['hollowgate_vtt.save_owned_character_sheet','uuid,uuid,uuid,text,jsonb'],
  ['hollowgate_vtt.save_owned_character_portrait','uuid,uuid,uuid,text,bytea'],
  ['hollowgate_vtt.save_authorized_character_portrait','uuid,uuid,uuid,text,bytea'],
  ['hollowgate_vtt.list_claimable_characters','uuid,uuid'],
  ['hollowgate_vtt.release_claimed_character','uuid,uuid'],
  ['hollowgate_vtt.get_player_character_claim','uuid,uuid'],
  ['hollowgate_vtt.save_claimed_character_sheet','uuid,uuid,uuid,text,jsonb'],
  ['hollowgate_vtt.list_owned_character_claims','uuid,uuid'],
  ['hollowgate_vtt.list_logical_owner_characters','uuid,uuid'],
  ['hollowgate_vtt.assign_logical_character_to_campaign','uuid,uuid,uuid'],
  ['hollowgate_vtt.list_owned_character_player_assignments','uuid,uuid'],
  ['hollowgate_vtt.set_owned_character_player_assignment','uuid,uuid,uuid,uuid'],
  ['hollowgate_vtt.list_owned_character_availability','uuid,uuid'],
  ['hollowgate_vtt.set_owned_character_availability','uuid,uuid,uuid,boolean'],
  ['hollowgate_vtt.list_assigned_player_character_sheets','uuid,uuid'],
 ];
 for(const [name,types] of routines) await db.exec(`GRANT EXECUTE ON FUNCTION ${name}(${types}) TO hollowgate_api_runtime;`);
 await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
  ($1,'lifecycle-owner@example.invalid','Lifecycle Owner','active',now(),'local'),
  ($2,'lifecycle-player@example.invalid','Lifecycle Player','active',now(),'local')`,
  [owner,player]);
 const campaignId=(await db.query(`INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset) VALUES($1,'Lifecycle QA','' ,'hsc') RETURNING id`,[owner])).rows[0].id;
 await db.query(`SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,'player',true)`,[owner,campaignId,player]);
 await db.exec('SET ROLE hollowgate_api_runtime;');
 const pool={query:(text,args)=>db.query(text,args)};
 const services={
  character:createCharacterService({pool}),
  claims:createCharacterClaimService({pool}),
  assignments:createCharacterAssignmentService({pool}),
  availability:createCharacterAvailabilityService({pool}),
  logical:createLogicalCharacterService({pool}),
 };
 return {db,services,campaignId};
 }
async function createdCharacter(services,campaignId,name='Available A'){
 const {character}=await services.character.create(owner,campaignId,{name});
 await services.character.save(owner,campaignId,character.id,{campaignId,name,sheetData:sheet});
 return character;
 }

test('claim transfers logical ownership, revocation keeps frozen ownership and release returns GM control',async()=>{
 const {db,services,campaignId}=await fixture();
 try{
  const character=await createdCharacter(services,campaignId);
  assert.equal((await services.availability.set(owner,campaignId,character.id,true)).id,character.id);
  const claim=await services.claims.claim(player,character.id);
  assert.equal(claim.campaignId,campaignId);
  assert.equal((await services.claims.current(player,campaignId)).claim.characterId,character.id);
  const mine=await services.logical.list(player);
  assert.equal(mine.characters.length,1);
  assert.equal(mine.characters[0].id,character.id);
  assert.equal(mine.characters[0].campaignId,campaignId);
  // Revoke membership: the claim row drops, frozen logical ownership survives.
  await db.query(`SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,'player',$4)`,[owner,campaignId,player,false]);
  const release=await services.claims.release(player,character.id);
  assert.equal(release.characterId,character.id);
  const back=await services.logical.list(owner);
  assert.equal(back.characters.length,1);
  assert.equal(back.characters[0].id,character.id);
  assert.equal(back.characters[0].logicalOwnerId,owner);
  assert.equal(back.characters[0].campaignId,campaignId);
  assert.equal(back.characters[0].availableForPlayers,true);
 }finally{await db.close();}
 });

test('GM cannot republish or reassign a claimed character',async()=>{
 const {db,services,campaignId}=await fixture();
 try{
  const character=await createdCharacter(services,campaignId);
  assert.equal((await services.availability.set(owner,campaignId,character.id,true)).id,character.id);
  await services.claims.claim(player,character.id);
  await assert.rejects(()=>services.availability.set(owner,campaignId,character.id,true),bad(404));
  await assert.rejects(()=>services.assignments.set(owner,campaignId,character.id,player),bad(404));
 }finally{await db.close();}
 });

test('logical assignment detaches with claimant ownership and enforces ruleset compatibility',async()=>{
 const {db,services,campaignId}=await fixture();
 try{
  const character=await createdCharacter(services,campaignId);
  const detached=await services.logical.assign(owner,character.id,null);
  assert.equal(detached.assignment.outcome,'detached');
  const otherCampaign=(await db.query(`SELECT hollowgate_vtt.create_owned_campaign($1,$2,$3,$4) AS id`,[owner,'Lifecycle QA 2e','', 'dnd5e'])).rows[0].id;
  const moved=await services.logical.assign(owner,character.id,otherCampaign);
  assert.equal(moved.assignment.outcome,'assigned');
  assert.equal(moved.assignment.ruleset,'dnd5e');
  const ownerCampaign=(await db.query(`SELECT hollowgate_vtt.create_owned_campaign($1,$2,$3,$4) AS id`,[owner,'Lifecycle QA Owner','', 'hsc'])).rows[0].id;
  await assert.rejects(()=>services.logical.assign(owner,character.id,ownerCampaign),error=>error.status===400);
 }finally{await db.close();}
 });
