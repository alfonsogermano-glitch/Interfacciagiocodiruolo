import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../../deploy/aruba/sql/narrative/002_narrative_entity_notes.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../../.github/workflows/aruba-api.yml',import.meta.url),'utf8');
const proof=readFileSync(new URL('../../../deploy/aruba/sql/narrative/test_narrative_entity_notes.sql',import.meta.url),'utf8');

test('PNG and monster custom notes have a dedicated owner-scoped SQL model',()=>{
 assert.match(sql,/CREATE TABLE hollowgate_vtt\.narrative_entity_notes/);
 assert.match(sql,/kind text NOT NULL CHECK\(kind IN\('npcs','monsters'\)\)/);
 assert.match(sql,/narrative_note_owner_authorized/);
 assert.match(sql,/narrative_content_documents/);
 assert.match(sql,/parent_note_id uuid REFERENCES hollowgate_vtt\.narrative_entity_notes/);
 assert.match(sql,/set_owned_narrative_note_subtab_order/);
 assert.match(sql,/REVOKE ALL ON hollowgate_vtt\.narrative_entity_notes FROM PUBLIC,hollowgate_api_runtime/);
});

test('narrative note PostgreSQL proof covers scope, TipTap, order and archive in CI',()=>{
 assert.match(proof,/Foreign owner created narrative note/);
 assert.match(proof,/Narrative TipTap save failed/);
 assert.match(proof,/set_owned_narrative_note_subtab_order/);
 assert.match(proof,/Narrative note reversible archive failed/);
 assert.match(workflow,/test_narrative_entity_notes\.sql/);
 assert.match(workflow,/node qa\/notes-db-http\.mjs/);
});

test('narrative notes install only after scenes, visual assets and narrative documents',()=>{
 const scene=workflow.indexOf('scenes/001_scene_documents.sql');
 const assets=workflow.indexOf('visual-assets/001_visual_assets.sql');
 const narrative=workflow.indexOf('narrative/001_narrative_content.sql');
 const notes=workflow.indexOf('narrative/002_narrative_entity_notes.sql');
 assert.ok(scene>=0&&assets>scene&&narrative>assets&&notes>narrative);
});
