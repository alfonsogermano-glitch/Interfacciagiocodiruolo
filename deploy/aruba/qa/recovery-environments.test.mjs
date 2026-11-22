import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {selectRuntime,safeFlags,selectExpectedObjects,collectSnapshot} from '../../../apps/aruba-api/qa/collect-recovery-environment.mjs';
import {campaignPlayerRequirements,assessCampaignPlayer,compareSnapshots} from './compare-recovery-environments.mjs';
import {buildSourceInventory} from './recovery-source-inventory.mjs';

const productionEnv={PGDATABASE:'hollowgate',PGUSER:'hollowgate_auth_app',AUTH_ORIGIN:'https://www.hollowgate.quest',
  AUTH_PRODUCTION_ENABLED:'true',AUTH_STAGING_ENABLED:'false'};
function fixture(environment='staging'){
  return {schemaVersion:1,scope:'runtime-catalog-only',environment,
    database:environment==='staging'?'hollowgate_auth_test':'hollowgate',
    role:environment==='staging'?'hollowgate_auth_staging_app':'hollowgate_auth_app',
    origin:environment==='staging'?'https://staging.hollowgate.quest':'https://www.hollowgate.quest',
    flags:Object.fromEntries(campaignPlayerRequirements.flags.map(flag=>[flag,'true'])),
    tables:Object.entries(campaignPlayerRequirements.tables).map(([name,columns])=>({name,present:true,kind:'r',
      can_select:false,can_insert:false,can_update:false,can_delete:false,columns:columns.map(name=>({name,type:'fixture'}))})),
    routines:campaignPlayerRequirements.routines.map(({name,types})=>({name,present:true,
      input_types:types,can_execute:true,security_definer:true,definition_md5:'a'.repeat(32)}))};
}
test('runtime identity guards reject production/staging mismatch and legacy shared staging login',()=>{
  assert.equal(selectRuntime(productionEnv,'production').database,'hollowgate');
  assert.throws(()=>selectRuntime(productionEnv,'staging'));
  assert.throws(()=>selectRuntime({...productionEnv,PGUSER:'hollowgate'},'production'));
  assert.throws(()=>selectRuntime({...productionEnv,AUTH_STAGING_ENABLED:'true'},'production'));
});
test('flags are an allowlist and never echo environment secrets or arbitrary flag values',()=>{
  const env={...productionEnv,AUTH_OAUTH_ENABLED:'true',AUTH_SIGNUP_ENABLED:'private-string',
    POSTGRES_PASSWORD_FILE:'private-file',AUTH_RATE_LIMIT_KEY_FILE:'private-file',SECRET:'private-secret'};
  const safe=safeFlags(env,['AUTH_OAUTH_ENABLED','AUTH_SIGNUP_ENABLED','AUTH_RATE_LIMIT_KEY_FILE','SECRET']);
  assert.deepEqual(safe,{AUTH_OAUTH_ENABLED:'true',AUTH_SIGNUP_ENABLED:'invalid'});
  assert(!JSON.stringify(safe).includes('private'));
});
test('schema name inventory rejects injection before a database query',()=>{
  const inventory={schemaVersion:1,scope:'local-source-only',migrations:[{createsTables:['hollowgate_vtt.campaigns;DROP TABLE x'],declaresRoutines:[]}]};
  assert.throws(()=>selectExpectedObjects(inventory));
});
test('all required routine names really exist in local migration sources',()=>{
  const names=new Set(buildSourceInventory().migrations.flatMap(m=>m.declaresRoutines));
  for(const routine of campaignPlayerRequirements.routines)assert(names.has(routine.name),routine.name);
});
test('a catalog pass never claims full gameplay readiness or a deploy approval',()=>{
  const result=assessCampaignPlayer(fixture());
  assert.equal(result.blockers.length,0);
  assert.equal(result.status,'catalog-checks-passed-browser-qa-required');
  assert.equal(result.completeFeatureCertification,false);
});
test('staging missing membership and unset invites stays blocked',()=>{
  const snapshot=fixture();
  snapshot.tables=snapshot.tables.filter(row=>row.name!=='hollowgate_vtt.campaign_members');
  snapshot.flags.AUTH_VTT_CAMPAIGN_INVITES_ENABLED=null;
  const result=assessCampaignPlayer(snapshot);
  assert(result.blockers.some(row=>row.name==='hollowgate_vtt.campaign_members'));
  assert(result.blockers.some(row=>row.name==='AUTH_VTT_CAMPAIGN_INVITES_ENABLED'));
});
test('wrong overload and missing execute grant fail even when a routine NAME exists',()=>{
  const snapshot=fixture();
  snapshot.routines[0].input_types=['text'];snapshot.routines[1].can_execute=false;
  const result=assessCampaignPlayer(snapshot);
  assert(result.blockers.some(row=>row.kind==='routine-signature-missing-or-ambiguous'));
  assert(result.blockers.some(row=>row.kind==='routine-grant-or-security-missing'));
});
test('missing assignment column and direct membership writes are blockers',()=>{
  const snapshot=fixture();
  snapshot.tables.find(row=>row.name==='hollowgate_vtt.character_drafts').columns=[];
  snapshot.tables.find(row=>row.name==='hollowgate_vtt.campaign_members').can_insert=true;
  const result=assessCampaignPlayer(snapshot);
  assert(result.blockers.some(row=>row.kind==='column-missing'));
  assert(result.blockers.some(row=>row.kind==='direct-table-grant-or-unknown'));
});
test('comparison reports exact flag/body drift without claiming build evidence',()=>{
  const left=fixture(),right=fixture('production');
  left.flags.AUTH_VTT_PLAYER_CHARACTERS_ENABLED=null;
  right.routines[0].definition_md5='b'.repeat(32);
  const result=compareSnapshots(left,right);
  assert.equal(result.flagDrift.length,1);assert.equal(result.routineDefinitionDrift.length,1);
  assert.equal(result.certified,false);
  assert.equal(result.buildEvidence.production,'not-established-by-api-snapshot');
  assert.throws(()=>compareSnapshots(left,left));
});
test('real embedded PostgreSQL catalog queries expose signatures/grants, never application rows',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE ROLE qa_recovery LOGIN;
      CREATE SCHEMA hollowgate_vtt;
      CREATE TABLE hollowgate_vtt.qa_private(id uuid, secret_payload text);
      INSERT INTO hollowgate_vtt.qa_private VALUES (gen_random_uuid(),'DO_NOT_EXPORT_THIS_PAYLOAD');
      CREATE FUNCTION hollowgate_vtt.qa_callable(p uuid) RETURNS uuid
        LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT p $$;
      REVOKE ALL ON FUNCTION hollowgate_vtt.qa_callable(uuid) FROM PUBLIC;
      GRANT USAGE ON SCHEMA hollowgate_vtt TO qa_recovery;
      GRANT EXECUTE ON FUNCTION hollowgate_vtt.qa_callable(uuid) TO qa_recovery;
      SET ROLE qa_recovery;`);
    const calls=[];
    const client={query:async(sql,params)=>{calls.push(sql);return db.query(sql,params);}};
    const inventory={schemaVersion:1,scope:'local-source-only',apiFlags:['AUTH_OAUTH_ENABLED'],
      migrations:[{createsTables:['hollowgate_vtt.qa_private','hollowgate_vtt.qa_missing'],
        declaresRoutines:['hollowgate_vtt.qa_callable','hollowgate_vtt.qa_absent']}]};
    const snapshot=await collectSnapshot(client,inventory,{environment:'fixture',database:'postgres',role:'qa_recovery'},
      {AUTH_OAUTH_ENABLED:'true',SECRET:'DO_NOT_EXPORT_SECRET'});
    assert.equal(snapshot.tables.find(row=>row.name.endsWith('qa_private')).can_select,false);
    assert.equal(snapshot.tables.find(row=>row.name.endsWith('qa_missing')).present,false);
    const routine=snapshot.routines.find(row=>row.name.endsWith('qa_callable'));
    assert.deepEqual(routine.input_types,['uuid']);assert.equal(routine.can_execute,true);
    assert.equal(routine.security_definer,true);assert.match(routine.definition_md5,/^[a-f0-9]{32}$/);
    assert(!JSON.stringify(snapshot).includes('DO_NOT_EXPORT'));
    assert.equal(calls[0],'BEGIN READ ONLY');assert.equal(calls.at(-1),'ROLLBACK');
    assert(calls.every(sql=>!(/(?:FROM|JOIN)\s+hollowgate_/i.test(sql))));
    const tx=await db.query('SHOW transaction_read_only');
    assert.equal(tx.rows[0].transaction_read_only,'off');
  }finally{await db.close();}
});
test('failure rolls back metadata transaction and rejects elevated runtime',async()=>{
  const calls=[];
  const client={query:async sql=>{calls.push(sql);return {rows:[{database:'hollowgate',role:'hollowgate_auth_app',elevated:true}]};}};
  const inventory={schemaVersion:1,scope:'local-source-only',apiFlags:[],migrations:[]};
  await assert.rejects(()=>collectSnapshot(client,inventory,{database:'hollowgate',role:'hollowgate_auth_app'},{}));
  assert.equal(calls.at(-1),'ROLLBACK');
});
