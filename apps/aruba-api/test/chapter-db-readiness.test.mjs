import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../scripts/check-chapter-db-readiness.mjs',import.meta.url),'utf8');
test('chapter database readiness probe is strictly read-only',()=>{
 assert.match(script,/has_table_privilege/);
 assert.match(script,/has_column_privilege/);
 assert.match(script,/to_regclass/);
 const queries=[...script.matchAll(/\x60(SELECT [^\x60]+)\x60/g)].map(match=>match[1]);
 assert.equal(queries.length,7);
 assert.ok(queries.every(query=>query.startsWith('SELECT ')));
 assert.ok(queries.every(query=>!['INSERT INTO','UPDATE ','DELETE FROM','CREATE TABLE','ALTER TABLE','GRANT ','DROP TABLE','TRUNCATE'].some(unsafe=>query.toUpperCase().includes(unsafe))));
 assert.match(script,/if\(failed\)process\.exitCode=1/);
});
