import test from 'node:test';
import assert from 'node:assert/strict';
import {configureNativeCatalog} from '../src/native-catalog-startup.mjs';
test('native catalog default/false never probe the DB or construct services',async()=>{
 const pool={query:async()=>{throw Error('must not query');}};
 for(const flag of [undefined,'','false']){
  assert.deepEqual(await configureNativeCatalog({flag,pool}),
   {unassignedCatalog:null,unassignedCatalogNotes:null,nativeCatalog:null,nativeCatalogNotes:null,nativeCampaignCatalog:null,nativeGlobalEditor:null});
 }
});
test('native catalog validates flag, authentication and dependencies before DB access',async()=>{
 await assert.rejects(configureNativeCatalog({flag:'1'}),/Unsupported/);
 await assert.rejects(configureNativeCatalog({flag:'true'}),/authenticated/);
 await assert.rejects(configureNativeCatalog({flag:'true',authEnabled:true}),/campaigns/);
});
test('native startup requires secure schema and constructs catalog plus notes together',async()=>{
 const sql=[];
 const configured=await configureNativeCatalog({flag:'true',authEnabled:true,campaigns:{},
  pool:{query:async text=>{sql.push(text);return {rows:[{ready:true}]};}}});
 assert.equal(typeof configured.unassignedCatalog.copyToCampaign,'function');
 assert.equal(typeof configured.unassignedCatalogNotes.archive,'function');
 assert.equal(configured.nativeGlobalEditor,null);
 assert.equal(sql.length,1);
 assert.match(sql[0],/copy_unassigned_catalog_to_campaign_v003/);
 assert.match(sql[0],/NOT has_function_privilege/);
 assert.doesNotMatch(sql[0],/\b(?:CREATE|ALTER|GRANT|INSERT|UPDATE|DELETE)\b/);
 for(const ready of [false,null,undefined]){
  await assert.rejects(configureNativeCatalog({flag:'true',authEnabled:true,campaigns:{},
    pool:{query:async()=>({rows:[{ready}]})}}),/migrations 001-006/);
 }
});
