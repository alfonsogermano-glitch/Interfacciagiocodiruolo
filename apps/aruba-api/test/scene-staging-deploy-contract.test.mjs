import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../../../deploy/aruba/scripts/apply-scene-staging-schema.sh',import.meta.url),'utf8');
test('Scene staging installer cannot touch production or activate HTTP',()=>{
 assert.match(script,/set -Eeuo pipefail/);
 assert.match(script,/feature\/aruba-api-foundation/);
 assert.match(script,/SCENE_STAGING_MIGRATION_CONFIRM/);
 assert.match(script,/current_database\(\)='hollowgate_auth_test'/);
 assert.match(script,/to_regclass\('hollowgate_vtt.chapter_documents'\)/);
 assert.match(script,/001_scene_documents.sql/);
 assert.match(script,/test_scene_documents.sql/);
 assert.match(script,/SCENE_STAGING_SCHEMA_APPLIED/);
 assert.doesNotMatch(script,/AUTH_VTT_SCENES_ENABLED=true/);
 assert.doesNotMatch(script,/-d hollowgate_prod\b/);
});
