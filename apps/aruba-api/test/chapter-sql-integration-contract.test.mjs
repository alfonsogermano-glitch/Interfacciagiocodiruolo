import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../../deploy/aruba/sql/chapters/test_chapter_documents.sql',import.meta.url),'utf8');
test('chapter SQL integration checks ownership and rolls back fixtures',()=>{
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/ROLLBACK;/);
 assert.match(sql,/chapter_owner_authorized/);
 assert.match(sql,/list_owned_chapter_documents/);
 assert.match(sql,/list_owned_chapter_links/);
 assert.match(sql,/save_owned_chapter_document/);
 assert.match(sql,/delete_owned_chapter_document/);
 assert.match(sql,/has_table_privilege/);
 assert.doesNotMatch(sql,/COMMIT;/);
});
