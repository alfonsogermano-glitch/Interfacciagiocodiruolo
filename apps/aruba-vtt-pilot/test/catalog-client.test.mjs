import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogClient,catalogData,originalCatalogEntity,unavailableCatalogAction} from '../src/catalog-client.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const first='22222222-2222-4222-8222-222222222222';
const second='33333333-3333-4333-8333-333333333333';
const campaign='44444444-4444-4444-8444-444444444444';
const entry=(id=first)=>({id,kind:'npcs',ownerId:owner,campaignId:null,name:'PNG',ruleset:'hsc',
 revision:7,data:{description:'Test',customField:{preserved:true}},createdAt:'date',updatedAt:'date'});
const ok=body=>({ok:true,json:async()=>body});
test('native catalog follows every cursor using authenticated cookies only',async()=>{
 const calls=[];
 const client=createCatalogClient(async(url,init)=>{
  calls.push({url,init});return ok(calls.length===1?{items:[entry()],nextCursor:first}:{items:[entry(second)],nextCursor:null});
 });
 assert.equal((await client.list('npcs',owner)).length,2);
 assert.equal(calls[1].url,`/vtt/catalog/unassigned/npcs?after=${first}`);
 for(const {init} of calls){
  assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
  assert.equal(init.headers,undefined);
 }
});
test('native catalog refuses wrong-owner, campaign and duplicated results',async()=>{
 for(const items of [[{...entry(),ownerId:second}],[{...entry(),campaignId:campaign}],[entry(),entry()]]){
  await assert.rejects(createCatalogClient(async()=>ok({items,nextCursor:null})).list('npcs',owner));
 }
});
test('native catalog refuses looping or unrelated pagination cursors',async()=>{
 for(const body of [{items:[],nextCursor:first},{items:[entry()],nextCursor:second}]){
  await assert.rejects(createCatalogClient(async()=>ok(body)).list('npcs',owner));
 }
});
test('native catalog preserves original custom fields without spoofing identity',()=>{
 const original=originalCatalogEntity({...entry(),data:{...entry().data,id:second,name:'spoof',ownerProfileId:second}});
 assert.equal(original.id,first);assert.equal(original.name,'PNG');assert.equal(original.ownerProfileId,owner);
 assert.deepEqual(catalogData({...original,chapterId:campaign,portraitImageUrl:'legacy',_arubaMedia:[]}),
  entry().data);
});
test('native saves and duplicate use observed revisions, never a default',async()=>{
 const calls=[];
 const client=createCatalogClient(async(url,init)=>{
  calls.push({url,body:JSON.parse(init.body)});
  return ok({item:url.endsWith('/duplicate')?entry(second):{...entry(),revision:8}});
 });
 await client.save('npcs',first,owner,{name:'PNG',ruleset:'hsc',data:entry().data,revision:7});
 await client.duplicate('npcs',first,owner,8,campaign);
 assert.equal(calls[0].body.revision,7);assert.equal(calls[1].body.revision,8);
 await assert.rejects(client.save('npcs',first,owner,{revision:undefined}));
 assert.equal(calls.length,2);
});
test('HTTP failures never become successful deletes, releases or saves',async()=>{
 const client=createCatalogClient(async()=>({ok:false,status:409}));
 await assert.rejects(client.save('npcs',first,owner,{revision:7}),{status:409});
 assert.throws(unavailableCatalogAction,/nessuna modifica eseguita/);
 assert.equal(client.remove,undefined);assert.equal(client.assign,undefined);
});
test('copy validates target context and never impersonates assignment',async()=>{
 const client=createCatalogClient(async()=>ok({item:{...entry(second),campaignId:campaign}}));
 assert.equal((await client.copyToCampaign('npcs',first,owner,7,campaign)).id,second);
 const wrong=createCatalogClient(async()=>ok({item:entry(second)}));
 await assert.rejects(wrong.copyToCampaign('npcs',first,owner,7,campaign));
});
test('invalid identifiers are rejected before requests',async()=>{
 let calls=0;const client=createCatalogClient(async()=>{calls++;return ok({});});
 await assert.rejects(client.list('npcs','bad'));
 await assert.rejects(client.read('npcs','../other',owner));
 await assert.rejects(client.list('../other',owner));
 assert.equal(calls,0);
});
