import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../../deploy/aruba/sql/scenes/001_scene_documents.sql',import.meta.url),'utf8');
test('scene SQL keeps original chapter relation and campaign-scoped foreign key',()=>{
 assert.match(sql,/FOREIGN KEY\(chapter_id,campaign_id\) REFERENCES hollowgate_vtt\.chapter_documents\(id,campaign_id\)/);
 assert.match(sql,/REFERENCES hollowgate_vtt\.campaigns\(id\) ON DELETE CASCADE/);
 assert.match(sql,/p_payload->>'chapterId' IS DISTINCT FROM p_chapter::text/);
 assert.match(sql,/p_payload->>'campaignId' IS DISTINCT FROM p_campaign::text/);
});
test('scene SQL denies direct runtime access and only exposes owner-checked routines',()=>{
 assert.match(sql,/REVOKE ALL ON hollowgate_vtt\.scene_documents FROM PUBLIC,hollowgate_api_runtime/);
 assert.match(sql,/chapter_owner_authorized\(p_owner,p_campaign\)/);
 for(const fn of ['list_owned_scene_documents','save_owned_scene_document','delete_owned_scene_document']){
  assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION hollowgate_vtt\\.'+fn+'\\('));
  assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION hollowgate_vtt\\.'+fn+'\\('));
 }
});
