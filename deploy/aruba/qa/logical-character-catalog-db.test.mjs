import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createLogicalCharacterCatalogService} from '../../../apps/aruba-api/src/logical-character-catalog-service.mjs';
import {configureLogicalCharacterCatalog} from '../../../apps/aruba-api/src/logical-character-catalog-startup.mjs';
const gm='71000000-0000-4000-8000-000000000001',player='71000000-0000-4000-8000-000000000002';
const sheetData={style:'Jock',viaggio:'Campione',ambiti:{},abilita:{},tratti:[],equipment:[],description:'Integro'};
const body={name:'Mara',ruleset:'hsc',sheetData};
async function fixture({legacyAssignment=false}={}){
 const db=new PGlite(),directory=new URL('../sql/',import.meta.url);
 for(const name of readdirSync(directory).filter(n=>/^\d{3}_.*\.sql$/.test(n)&&Number(n.slice(0,3))<=39&&![35,36,37].includes(Number(n.slice(0,3)))).sort()){
  if(name.startsWith('039_')&&legacyAssignment){
   const result=await db.query("SELECT pg_get_functiondef('hollowgate_vtt.assign_logical_character_to_campaign(uuid,uuid,uuid)'::regprocedure) AS definition");
   const legacy=result.rows[0].definition.replaceAll(';RETURN;',';').replace(
    'v_may_manage := COALESCE(v_logical_owner_id,v_owner_id)=p_actor;',
    `v_may_manage := (v_logical_owner_id=p_actor) OR (v_logical_owner_id IS NULL AND v_owner_id=p_actor);
 IF v_campaign_id IS NOT NULL THEN
  v_may_manage := v_may_manage OR EXISTS(
   SELECT 1 FROM hollowgate_vtt.campaigns c WHERE c.id=v_campaign_id AND c.owner_id=p_actor);
 END IF;`);
   await db.exec(legacy);
  }
  await db.exec(readFileSync(new URL(name,directory),'utf8'));
 }
 await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
  ($1,'pg-gm@example.invalid','GM','active',now(),'local'),($2,'pg-player@example.invalid','Player','active',now(),'local')`,[gm,player]);
 const campaign=(await db.query("INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset) VALUES($1,'QA','','hsc') RETURNING id",[gm])).rows[0].id;
 await db.query("SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,'player',true)",[gm,campaign,player]);
 await db.exec('SET ROLE hollowgate_api_runtime');
 return {db,campaign,service:createLogicalCharacterCatalogService({pool:{query:(sql,args)=>db.query(sql,args)}})};
}
async function claimed(f){
 let {character}=await f.service.create(gm,body);
 await f.db.query('SELECT hollowgate_vtt.assign_logical_character_to_campaign($1,$2,$3)',[gm,character.id,f.campaign]);
 await f.db.query('SELECT hollowgate_vtt.set_owned_character_availability($1,$2,$3,true)',[gm,f.campaign,character.id]);
 await f.db.query('SELECT hollowgate_vtt.claim_available_character($1,$2)',[player,character.id]);
 return (await f.service.read(player,character.id)).character;
}
const rejected=status=>error=>error.status===status;
test('logical PG create/save/archive supports no campaign, CAS and never resurrects archived data',async()=>{
 const f=await fixture();
 try{
  const configured=await configureLogicalCharacterCatalog({flag:'true',logicalCharacters:{},
   pool:{query:(sql,args)=>f.db.query(sql,args)}});
  assert.equal(typeof configured.duplicate,'function');
  const {character}=await f.service.create(gm,body);
  assert.equal(character.campaignId,null);assert.equal(character.logicalOwnerId,gm);
  const saved=await f.service.save(gm,character.id,{...body,name:'Mara 2',revision:character.revision});
  await assert.rejects(f.service.save(gm,character.id,{...body,revision:character.revision}),rejected(409));
  assert.equal((await f.service.list(gm)).characters.length,1);
  await f.service.archive(gm,character.id,{revision:saved.character.revision});
  await assert.rejects(f.service.read(gm,character.id),rejected(404));
  assert.equal((await f.service.list(gm)).characters.length,0);
  await f.db.exec('RESET ROLE');
  await assert.rejects(f.db.query("UPDATE hollowgate_vtt.character_drafts SET status='active' WHERE id=$1",[character.id]),e=>e.code==='22023');
  assert.equal((await f.db.query('SELECT sheet_data FROM hollowgate_vtt.character_drafts WHERE id=$1',[character.id])).rows[0].sheet_data.description,'Integro');
 }finally{await f.db.close();}
});
test('claimed PG can be saved by logical player, not archived/overwritten by physical GM',async()=>{
 const f=await fixture();
 try{
  const character=await claimed(f);
  assert.equal((await f.db.query('SELECT * FROM hollowgate_vtt.assign_logical_character_to_campaign($1,$2,NULL)',
   [gm,character.id])).rows[0].outcome,'forbidden');
  await assert.rejects(f.service.save(gm,character.id,{...body,revision:character.revision}),rejected(404));
  assert.equal((await f.db.query('SELECT hollowgate_vtt.archive_owned_character($1,$2,$3) AS id',[gm,f.campaign,character.id])).rows[0].id,null);
  const saved=await f.service.save(player,character.id,{...body,revision:character.revision});
  await assert.rejects(f.service.save(player,character.id,{...body,revision:saved.character.revision,
   sheetData:{...sheetData,style:'Cambiato'}}),e=>e.status===400&&e.message==='ORIGINI_LOCKED');
  assert.equal(saved.character.originalOwnerId,gm);assert.equal(saved.character.ownerId,gm);
  assert.equal(saved.character.logicalOwnerId,player);assert.equal(saved.character.availableForPlayers,true);
  const claim=await f.db.query('SELECT hollowgate_vtt.get_player_character_claim($1,$2) AS value',[player,f.campaign]);
  assert.ok(claim.rows.length);
  const archived=await f.service.archive(player,character.id,{revision:saved.character.revision});
  assert.equal(archived.character.status,'archived');
  await f.db.exec('RESET ROLE');
  assert.equal((await f.db.query("SELECT status FROM hollowgate_vtt.campaign_members WHERE campaign_id=$1 AND user_id=$2",[f.campaign,player])).rows[0].status,'revoked');
  assert.equal((await f.db.query('SELECT 1 FROM hollowgate_vtt.character_claims WHERE character_id=$1',[character.id])).rows.length,0);
 }finally{await f.db.close();}
});
test('membership revocation preserves readable logical ownership but refuses write and allows release',async()=>{
 const f=await fixture();
 try{
  const character=await claimed(f);
  await f.db.query("SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,'player',false)",[gm,f.campaign,player]);
  assert.equal((await f.service.read(player,character.id)).character.logicalOwnerId,player);
  await assert.rejects(f.service.save(player,character.id,{...body,revision:character.revision}),rejected(404));
  await f.db.query('SELECT hollowgate_vtt.release_claimed_character($1,$2)',[player,character.id]);
  assert.equal((await f.service.read(gm,character.id)).character.logicalOwnerId,gm);
  await assert.rejects(f.service.read(player,character.id),rejected(404));
 }finally{await f.db.close();}
});
test('legacy writes invalidate CAS and cannot alter imported provenance',async()=>{
 const f=await fixture();
 try{
  const {character}=await f.service.create(gm,body);
  await f.db.exec('RESET ROLE');
  await f.db.query("INSERT INTO hollowgate_vtt.character_drafts(owner_id,logical_owner_id,name,status,sheet_data,ruleset) VALUES($1,NULL,'Storico','active',$2::jsonb,'hsc')",
   [gm,JSON.stringify({...sheetData,sourceRecord:{original:true},chapterId:'retained-placement'})]);
  await f.db.exec('SET ROLE hollowgate_api_runtime');
  const imported=(await f.service.list(gm)).characters.find(row=>row.name==='Storico');
  assert.equal(imported.logicalOwnerId,gm);
  const saved=await f.service.save(gm,imported.id,{...body,revision:imported.revision});
  assert.deepEqual(saved.character.sheetData.sourceRecord,{original:true});
  assert.equal(saved.character.sheetData.chapterId,'retained-placement');
  await f.db.query('SELECT hollowgate_vtt.assign_logical_character_to_campaign($1,$2,$3)',[gm,character.id,f.campaign]);
  const observed=(await f.service.read(gm,character.id)).character;
  await f.db.query('SELECT hollowgate_vtt.save_owned_character_sheet($1,$2,$3,$4,$5::jsonb)',[gm,f.campaign,character.id,'Old editor',JSON.stringify(sheetData)]);
  await assert.rejects(f.service.save(gm,character.id,{...body,revision:observed.revision}),rejected(409));
 }finally{await f.db.close();}
});
test('GM duplicate copies portraits and hidden sub-tabs atomically, remapping only structural UUIDs',async()=>{
 const f=await fixture();
 try{
  let {character}=await f.service.create(gm,body);
  await f.db.query('SELECT hollowgate_vtt.assign_logical_character_to_campaign($1,$2,$3)',[gm,character.id,f.campaign]);
  await f.db.exec('RESET ROLE');
  const root=(await f.db.query(`INSERT INTO hollowgate_vtt.entity_notes(campaign_id,character_id,owner_id,tab_name,content,hidden,visibility)
   VALUES($1,$2,$3,'Privata','Testo intatto',true,'private') RETURNING id`,[f.campaign,character.id,gm])).rows[0].id;
  const child=(await f.db.query(`INSERT INTO hollowgate_vtt.entity_notes(campaign_id,character_id,owner_id,parent_note_id,tab_name,content)
   VALUES($1,$2,$3,$4::uuid,'Figlio',$4::uuid::text) RETURNING id`,[f.campaign,character.id,gm,root])).rows[0].id;
  await f.db.query('UPDATE hollowgate_vtt.entity_notes SET tab_order=$2::jsonb WHERE id=$1',[root,JSON.stringify([child])]);
  await f.db.query(`UPDATE hollowgate_vtt.character_drafts SET sheet_data=jsonb_set(sheet_data,'{tabOrder}',$2::jsonb) WHERE id=$1`,
   [character.id,JSON.stringify(['scheda',root])]);
  await f.db.query(`INSERT INTO hollowgate_vtt.character_portraits(character_id,mime_type,bytes)
   VALUES($1,'image/png',decode('89504e470d0a1a0a00000000','hex'))`,[character.id]);
  await f.db.query(`INSERT INTO hollowgate_vtt.character_portrait_sources(character_id,mime_type,bytes)
   VALUES($1,'image/jpeg',decode('ffd8ff000000000000000000','hex'))`,[character.id]);
  await f.db.exec('SET ROLE hollowgate_api_runtime');
  ({character}=await f.service.read(gm,character.id));
  const request={revision:character.revision,requestId:crypto.randomUUID()};
  const copy=await f.service.duplicate(gm,character.id,request);
  const retried=await f.service.duplicate(gm,character.id,request);
  assert.equal(copy.character.id,retried.character.id);
  assert.equal(copy.character.campaignId,f.campaign);assert.equal(copy.character.name,'Copia di Mara');
  assert.equal(copy.character.availableForPlayers,false);assert.equal(copy.character.claimableOrigin,false);
  const newRoot=copy.character.sheetData.tabOrder[1];assert.notEqual(newRoot,root);
  await f.db.exec('RESET ROLE');
  const notes=(await f.db.query('SELECT * FROM hollowgate_vtt.entity_notes WHERE character_id=$1',[copy.character.id])).rows;
  assert.equal(notes.length,2);
  const parent=notes.find(n=>n.id===newRoot),sub=notes.find(n=>n.parent_note_id===newRoot);
  assert.equal(parent.hidden,true);assert.equal(parent.visibility,'private');
  assert.deepEqual(parent.tab_order,[sub.id]);assert.equal(sub.content,root);
  for(const table of ['character_portraits','character_portrait_sources'])
   assert.equal((await f.db.query(`SELECT count(*)::int AS n FROM hollowgate_vtt.${table} WHERE character_id=$1`,[copy.character.id])).rows[0].n,1);
 }finally{await f.db.close();}
});
test('claimed-player duplicate cannot copy GM-private material',async()=>{
 const f=await fixture();
 try{
  const character=await claimed(f);
  await assert.rejects(f.service.duplicate(player,character.id,{revision:character.revision,requestId:crypto.randomUUID()}),rejected(403));
  assert.equal((await f.service.list(player)).characters.length,1);
 }finally{await f.db.close();}
});
test('039 repairs installed legacy assignment: NULL owner and denied outcomes never mutate the DB',async()=>{
 const f=await fixture({legacyAssignment:true});
 try{
  await f.db.exec('RESET ROLE');
  const id=(await f.db.query(`INSERT INTO hollowgate_vtt.character_drafts(owner_id,campaign_id,name,status,sheet_data,ruleset)
   VALUES($1,$2,'Legacy','active',$3::jsonb,'hsc') RETURNING id`,[gm,f.campaign,JSON.stringify(sheetData)])).rows[0].id;
  await f.db.exec('SET ROLE hollowgate_api_runtime');
  for(const actor of [player,'71000000-0000-4000-8000-000000000099']){
   const {rows}=await f.db.query('SELECT * FROM hollowgate_vtt.assign_logical_character_to_campaign($1,$2,NULL)',[actor,id]);
   assert.deepEqual(rows,[{outcome:'forbidden',campaign_id:null,ruleset:null}]);
  }
  const character=(await f.service.read(gm,id)).character;
  assert.equal(character.revision,1);assert.equal(character.campaignId,f.campaign);
  await f.db.exec('RESET ROLE');
  assert.equal((await f.db.query('SELECT logical_owner_id FROM hollowgate_vtt.character_drafts WHERE id=$1',[id])).rows[0].logical_owner_id,null);
 }finally{await f.db.close();}
});
test('notes and portrait writes invalidate character CAS without losing child data',async()=>{
 const f=await fixture();
 try{
  const {character}=await f.service.create(gm,body);
  await f.db.query('SELECT hollowgate_vtt.assign_logical_character_to_campaign($1,$2,$3)',[gm,character.id,f.campaign]);
  const before=(await f.service.read(gm,character.id)).character;
  await f.db.query(`SELECT hollowgate_vtt.save_owned_character_portrait($1,$2,$3,'image/png',
   decode('89504e470d0a1a0a00000000','hex'))`,[gm,f.campaign,character.id]);
  await assert.rejects(f.service.save(gm,character.id,{...body,revision:before.revision}),rejected(409));
  const after=(await f.service.read(gm,character.id)).character;
  await f.db.query("SELECT hollowgate_vtt.create_owned_character_note($1,$2,$3,'Nuova nota')",[gm,f.campaign,character.id]);
  await assert.rejects(f.service.save(gm,character.id,{...body,revision:after.revision}),rejected(409));
 }finally{await f.db.close();}
});
test('archiving one of multiple logically owned PG does not revoke player membership',async()=>{
 const f=await fixture();
 try{
  const character=await claimed(f);
  await f.db.exec('RESET ROLE');
  await f.db.query(`INSERT INTO hollowgate_vtt.character_drafts(owner_id,logical_owner_id,campaign_id,name,status,sheet_data,ruleset)
   VALUES($1,$2,$3,'Altro PG','active',$4::jsonb,'hsc')`,[gm,player,f.campaign,JSON.stringify(sheetData)]);
  await f.db.exec('SET ROLE hollowgate_api_runtime');
  await f.service.archive(player,character.id,{revision:character.revision});
  await f.db.exec('RESET ROLE');
  assert.equal((await f.db.query('SELECT status FROM hollowgate_vtt.campaign_members WHERE campaign_id=$1 AND user_id=$2',
   [f.campaign,player])).rows[0].status,'active');
 }finally{await f.db.close();}
});
test('detaching the last claimed PG exits membership but preserves editable logical ownership and release',async()=>{
 const f=await fixture();
 try{
  const character=await claimed(f);
  const {rows}=await f.db.query('SELECT * FROM hollowgate_vtt.assign_logical_character_to_campaign($1,$2,NULL)',[player,character.id]);
  assert.deepEqual(rows,[{outcome:'detached',campaign_id:null,ruleset:null}]);
  const detached=(await f.service.read(player,character.id)).character;
  assert.equal(detached.campaignId,null);assert.equal(detached.originalOwnerId,gm);
  await f.service.save(player,character.id,{...body,revision:detached.revision});
  await f.db.query('SELECT hollowgate_vtt.release_claimed_character($1,$2)',[player,character.id]);
  assert.equal((await f.service.read(gm,character.id)).character.logicalOwnerId,gm);
  await f.db.exec('RESET ROLE');
  assert.equal((await f.db.query('SELECT status FROM hollowgate_vtt.campaign_members WHERE campaign_id=$1 AND user_id=$2',
   [f.campaign,player])).rows[0].status,'revoked');
 }finally{await f.db.close();}
});
