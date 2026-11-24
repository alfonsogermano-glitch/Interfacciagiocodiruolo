import test from 'node:test';
import assert from 'node:assert/strict';
import {configureHistoricalCatalog} from '../src/historical-catalog-startup.mjs';
test('unverified historical catalog is off and cannot be enabled accidentally',()=>{
 for(const flag of [undefined,'','false'])
  assert.equal(configureHistoricalCatalog({flag}),null);
 assert.throws(()=>configureHistoricalCatalog({flag:'true'}),/blocked/);
 assert.throws(()=>configureHistoricalCatalog({flag:'1'}),/Unsupported/);
});
