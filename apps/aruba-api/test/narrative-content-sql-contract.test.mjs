import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../../../deploy/aruba/sql/narrative/001_narrative_content.sql',import.meta.url),'utf8');
const integration=readFileSync(new URL('../../../deploy/aruba/sql/narrative/test_narrative_content.sql',import.meta.url),'utf8');
const installer=readFileSync(new URL('../../../deploy/aruba/scripts/apply-narrative-staging-schema.sh',import.meta.url),'utf8');
test('narrative SQL denies direct runtime access and exposes owner-only routines',()=>{
 assert.match(migration,/REVOKE ALL ON hollowgate_vtt\.narrative_content_documents FROM PUBLIC,hollowgate_api_runtime/);
 for(const name of ['narrative_content_owner_authorized','list_owned_narrative_content','save_owned_narrative_content','delete_owned_narrative_content']){
  assert.match(migration,new RegExp(`SECURITY DEFINER|${name}`));assert.ok(migration.includes(name));
 }
 assert.match(migration,/CHECK\(kind IN \('npcs','monsters','clues','events'\)\)/);
 assert.match(migration,/chapter_documents[\s\S]*scene_documents/);
 assert.match(migration,/environmentId[\s\S]*mapLocationId[\s\S]*folderId/);
 assert.match(migration,/protect_narrative_scene_references/);
 assert.match(migration,/protect_narrative_chapter_references/);
 assert.match(migration,/protect_narrative_visual_asset_references/);
 assert.match(migration,/portraitImageUrl[\s\S]*portraitSourceImageUrl[\s\S]*coverImageUrl/);
 assert.match(migration,/FROM hollowgate_vtt\.visual_assets a WHERE a\.id=v_asset AND a\.campaign_id=p_campaign/);
});
test('real SQL test rolls back and staging installer is explicitly guarded',()=>{
 assert.match(integration,/^BEGIN;/m);assert.match(integration,/ROLLBACK;/);assert.doesNotMatch(integration,/COMMIT;/);
 assert.match(integration,/Foreign owner wrote narrative content/);assert.match(integration,/has_table_privilege/);
 assert.match(integration,/Valid Chapter\/Scene placement rejected/);
 assert.match(integration,/Cross-Chapter Scene placement accepted/);
 assert.match(integration,/Unsupported Environment placement accepted/);
 assert.match(integration,/Referenced Scene deletion accepted/);
 assert.match(integration,/Referenced Chapter deletion accepted/);
 assert.match(integration,/Referenced visual asset deletion accepted/);
 assert.match(integration,/Missing narrative visual asset accepted/);
 assert.match(installer,/APPLY_NARRATIVE_TO_DISPOSABLE_STAGING/);assert.match(installer,/current_database\(\)='hollowgate_auth_test'/);
 assert.match(installer,/scene_documents/);assert.doesNotMatch(installer,/hollowgate_production|AUTH_STAGING_ENABLED=true/);
});
