import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSourceInventory,inspectSql,schemaProbeSql} from './recovery-source-inventory.mjs';

test('relation inventory ignores comments and distinguishes creations from dependencies',()=>{
  const result=inspectSql(`-- CREATE TABLE hollowgate_vtt.fake(id uuid);
    CREATE TABLE IF NOT EXISTS hollowgate_vtt.invites (
      campaign_id uuid REFERENCES hollowgate_vtt.campaigns(id));
    CREATE OR REPLACE FUNCTION hollowgate_vtt.join_invite() RETURNS void AS $$
      INSERT INTO hollowgate_vtt.campaign_members SELECT * FROM hollowgate_auth.users;
    $$ LANGUAGE sql;`);
  assert.deepEqual(result.createsTables,['hollowgate_vtt.invites']);
  assert.deepEqual(result.declaresRoutines,['hollowgate_vtt.join_invite']);
  assert(result.relationReferences.includes('hollowgate_vtt.campaign_members'));
  assert(!result.relationReferences.includes('hollowgate_vtt.fake'));
});
test('033 membership dependency and 016 Notes dependency cannot be omitted',()=>{
  const inventory=buildSourceInventory();
  const find=name=>inventory.migrations.find(m=>m.file.endsWith('/'+name));
  assert(find('033_vtt_campaign_invites.sql').tableDependencies.some(file=>file.endsWith('/016_vtt_campaign_members.sql')));
  assert(find('016_vtt_campaign_members.sql').tableDependencies.some(file=>file.endsWith('/015_vtt_campaign_notes.sql')));
  assert(find('030_vtt_joined_player_campaigns.sql').tableDependencies.some(file=>file.endsWith('/016_vtt_campaign_members.sql')));
  assert(!inventory.migrations.some(m=>m.file.includes('/test_')));
  assert.equal(inventory.certified,false);
});
test('inventory includes build gates and missing-in-pilot original public pages',()=>{
  const inventory=buildSourceInventory();
  assert(inventory.buildFlags.includes('HG_CAMPAIGN_NOTES_CONTRACT'));
  assert(inventory.apiFlags.includes('AUTH_VTT_PLAYER_CHARACTERS_ENABLED'));
  assert.deepEqual(inventory.explicitOriginalPublicRoutes,['/elimina-dati','/news','/privacy']);
});
test('presence probe is a read-only catalog transaction, not a migration or data export',()=>{
  const probe=schemaProbeSql(buildSourceInventory());
  assert.match(probe,/BEGIN READ ONLY;/);
  assert.match(probe,/ROLLBACK;/);
  assert.match(probe,/pg_proc/);
  assert.doesNotMatch(probe,/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT)\b/);
  assert.doesNotMatch(probe,/FROM hollowgate_/);
});
