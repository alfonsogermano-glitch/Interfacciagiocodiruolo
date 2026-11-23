import test from 'node:test';
import assert from 'node:assert/strict';
import {postgresRaceConfig,assertEmptyRaceDatabase} from './postgres-race-config.mjs';
const env={HG_DISPOSABLE_PG_RACE:'1',PGHOST:'127.0.0.1',PGUSER:'qa_owner',PGDATABASE:'hollowgate_race_20261123'};
test('race suite is off unless explicitly enabled, even with operational PG variables',()=>{
 assert.equal(postgresRaceConfig({PGHOST:'production',PGDATABASE:'live'}),null);
});
test('race suite refuses operational/staging/default database names and malformed port',()=>{
 for(const name of ['postgres','hollowgate_auth_test','hollowgate_auth','hollowgate_race_',undefined])
  assert.throws(()=>postgresRaceConfig({...env,PGDATABASE:name}));
 assert.throws(()=>postgresRaceConfig({...env,PGPORT:'5432;DROP'}));
 assert.equal(postgresRaceConfig(env).database,env.PGDATABASE);
});
test('race suite checks actual DB identity and absence of application schemas or user tables',async()=>{
 for(const row of [{name:'live',empty:true},{name:env.PGDATABASE,empty:false},{name:env.PGDATABASE,empty:null}]){
  await assert.rejects(assertEmptyRaceDatabase({query:async()=>({rows:[row]})},env.PGDATABASE));
 }
 await assertEmptyRaceDatabase({query:async()=>({rows:[{name:env.PGDATABASE,empty:true}]})},env.PGDATABASE);
});
