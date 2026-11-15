import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../../deploy/aruba/sql/chapters/001_chapter_documents.sql',import.meta.url),'utf8');
test('Aruba chapter migration uses a composite campaign-scoped key and cascade cleanup',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS hollowgate_vtt\.chapter_documents/);
 assert.match(sql,/PRIMARY KEY\s*\(id,campaign_id\)/);
 assert.match(sql,/REFERENCES hollowgate_vtt\.campaigns\(id\) ON DELETE CASCADE/);
 assert.match(sql,/jsonb_typeof\(payload\)='object'/);
 assert.doesNotMatch(sql,/supabase|vercel|DROP TABLE|TRUNCATE|GRANT ALL/i);
});
