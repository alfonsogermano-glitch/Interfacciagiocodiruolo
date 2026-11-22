import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const migration=read('../../../deploy/aruba/sql/034_vtt_character_claims.sql');
const regression=read('../../../deploy/aruba/sql/test_vtt_character_claims.sql');

test('claim schema keeps physical GM ownership and transfers logical ownership atomically',()=>{
 assert.match(migration,/CREATE TABLE hollowgate_vtt\.character_claims/);
 assert.match(migration,/UNIQUE\(campaign_id,player_id\)/);
 assert.match(migration,/FOR UPDATE OF d/);
 assert.match(migration,/list_claimable_characters/);
 assert.match(migration,/get_player_character_claim/);
 assert.match(migration,/save_authorized_character_portrait/);
 assert.match(migration,/character_claims cl[\s\S]*cl\.player_id=p_user/);
 assert.match(migration,/NOT EXISTS\(SELECT 1 FROM hollowgate_vtt\.character_player_assignments/);
 assert.match(migration,/INSERT INTO hollowgate_vtt\.character_claims[\s\S]*INSERT INTO hollowgate_vtt\.character_player_assignments/);
 assert.doesNotMatch(migration,/UPDATE hollowgate_vtt\.character_drafts[\s\S]*SET owner_id=/);
});

test('release and membership revocation remove claim and assignment in one SQL transaction',()=>{
 assert.match(migration,/release_claimed_character[\s\S]*DELETE FROM hollowgate_vtt\.character_player_assignments[\s\S]*DELETE FROM hollowgate_vtt\.character_claims/);
 assert.match(migration,/revoke_invalid_character_assignments[\s\S]*DELETE FROM hollowgate_vtt\.character_claims[\s\S]*DELETE FROM hollowgate_vtt\.character_player_assignments/);
 assert.match(regression,/Player claimed second campaign PG/);
 assert.match(regression,/Revocation retained claim/);
 assert.match(regression,/Revoked player saved PG/);
});

test('claim table remains inaccessible to the runtime role',()=>{
 assert.match(migration,/REVOKE ALL ON hollowgate_vtt\.character_claims FROM PUBLIC,hollowgate_api_runtime/);
 for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.match(regression,new RegExp(`has_table_privilege\\('hollowgate_api_runtime','hollowgate_vtt\\.character_claims','${privilege}'\\)`));
});
