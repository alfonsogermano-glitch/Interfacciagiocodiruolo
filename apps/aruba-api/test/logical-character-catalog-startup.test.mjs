import test from 'node:test';
import assert from 'node:assert/strict';
import {configureLogicalCharacterCatalog,requireLogicalCharacterSafety} from '../src/logical-character-catalog-startup.mjs';
test('logical catalog startup is default off and rejects invalid flags/dependencies',async()=>{
 assert.equal(await configureLogicalCharacterCatalog({}),null);
 assert.equal(await configureLogicalCharacterCatalog({flag:'false'}),null);
 await assert.rejects(configureLogicalCharacterCatalog({flag:'1'}),/Unsupported/);
 await assert.rejects(configureLogicalCharacterCatalog({flag:'true'}),/requires logical/);
});
test('logical catalog startup requires migration 039 and restricted grants',async()=>{
 for(const ready of [false,null,undefined]){
  await assert.rejects(configureLogicalCharacterCatalog({flag:'true',logicalCharacters:{},
   pool:{query:async()=>({rows:[{ready}]})}}),/migration 039/);
 }
 let sql;
 const service=await configureLogicalCharacterCatalog({flag:'true',logicalCharacters:{},
  pool:{query:async text=>{sql=text;return {rows:[{ready:true}]};}}});
 assert.equal(typeof service.save,'function');assert.equal(typeof service.duplicate,'function');
 assert.match(sql,/NOT has_function_privilege/);
 assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|GRANT|INSERT|UPDATE|DELETE)\b/);
});
test('basic logical ownership also refuses an unpatched pre-039 database',async()=>{
 await assert.rejects(requireLogicalCharacterSafety({pool:{query:async()=>({rows:[{ready:false}]})}}),/039 security fixes/);
 await requireLogicalCharacterSafety({pool:{query:async()=>({rows:[{ready:true}]})}});
});
