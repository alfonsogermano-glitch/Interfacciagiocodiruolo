// Historical PNG/Mostri transport: read-only, validated, no native writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadStoricoPngMostri} from '../src/ArubaCatalogService.ts';
const id='22222222-2222-4222-8222-222222222222';
globalThis.__HG_ARUBA_TOPBAR_IDENTITY__={id:'11111111-1111-4111-8111-111111111111'};
test('loadStoricoPngMostri returns the validated historical page',async()=>{
 const item={kind:'npcs',id,name:'Dio dei carmini',ruleset:'hsc',ownerProfileId:'11111111-1111-4111-8111-111111111111',
  campaignId:null,description:'',notes:'',environmentId:null,chapterId:null,mapLocationId:null,imageUrl:null,
  coverImageUrl:null,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
  storicoType:'npcs',source:'storico'};
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({items:[item],nextCursor:null})});
 try{
  const page=await loadStoricoPngMostri();
  assert.deepEqual(page.items,[item]);
  assert.equal(page.nextCursor,null);
 }finally{globalThis.fetch=original;}
});
test('loadStoricoPngMostri rejects malformed historical pages',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({items:[{id:'bad'}],nextCursor:null})});
 try{await assert.rejects(loadStoricoPngMostri());}finally{globalThis.fetch=original;}
});
