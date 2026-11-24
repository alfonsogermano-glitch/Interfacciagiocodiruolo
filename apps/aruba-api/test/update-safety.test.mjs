import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('old initial installer refuses normal invocation before any operation',()=>{
 const source=read('../../../deploy/aruba/production/install-private.sh');
 const guard=source.indexOf('HG_ALLOW_INITIAL_INSTALL');
 assert.ok(guard>0);
 assert.ok(guard<source.indexOf('test -d "$release"'));
 assert.ok(guard<source.indexOf('sudo docker'));
 assert.match(source.slice(guard,source.indexOf('release=')),/exit 64/);
});
test('historical runtime is quarantined and global editor is not activated',()=>{
 const index=read('../src/index.mjs');
 assert.match(index,/const storicoPngMostri=configureHistoricalCatalog/);
 assert.doesNotMatch(index,/createStoricoPngMostriService\(\{pool\}\)/);
 const startup=read('../src/native-catalog-startup.mjs');
 assert.doesNotMatch(startup,/createNativeGlobalEditorService/);
 assert.match(startup,/nativeGlobalEditor:null/);
 assert.doesNotMatch(startup,/lock_native_catalog_entry_global/);
});
