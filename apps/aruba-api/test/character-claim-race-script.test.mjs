import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../../../deploy/aruba/scripts/test-character-claim-race.sh',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../../.github/workflows/aruba-api.yml',import.meta.url),'utf8');

test('real claim race script is disposable, concurrent and wired into PostgreSQL CI',()=>{
 assert.match(script,/\[\[ "\$database" == 'hollowgate_test' \]\]/);
 assert.match(script,/\[\[ "\$container" =~ \^hg-/);
 assert.match(script,/claim_available_character[\s\S]*>"\$work\/a" &[\s\S]*claim_available_character[\s\S]*>"\$work\/b" &/);
 assert.match(script,/winner_count[\s\S]*loser_count/);
 assert.match(script,/character_claims[\s\S]*character_player_assignments/);
 assert.match(script,/release_claimed_character/);
 assert.match(script,/set_campaign_membership[\s\S]*'player',false/);
 assert.match(script,/save_claimed_character_sheet[\s\S]*save_authorized_character_portrait/);
 assert.match(script,/Membership revocation retained state/);
 assert.match(script,/trap cleanup EXIT/);
 assert.match(script,/reset_fixture\(\)\{[\s\S]*docker exec -i "\$container" psql/);
 assert.match(script,/cleanup\(\)\{\s*reset_fixture[\s\S]*rm -rf "\$work"/);
 assert.match(script,/trap cleanup EXIT\s*reset_fixture/);
 assert.match(script,/DELETE FROM hollowgate_vtt\.character_claims[\s\S]*DELETE FROM hollowgate_vtt\.character_player_assignments[\s\S]*DELETE FROM hollowgate_vtt\.character_drafts/);
 assert.match(script,/SET ROLE hollowgate_api_runtime;SELECT coalesce\(hollowgate_vtt\.claim_available_character/);
 assert.match(script,/has_function_privilege[\s\S]*has_table_privilege/);
 assert.match(workflow,/test-character-claim-race\.sh hg-chapter-real-pg/);
 assert.doesNotMatch(script,/DATABASE_URL|psql\s+-h/);
});
