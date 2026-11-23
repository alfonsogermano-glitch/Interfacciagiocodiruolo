import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogClient} from '../src/catalog-client.mjs';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const campaign='33333333-3333-4333-8333-333333333333';
const item=(patch={})=>({id,ownerId:owner,kind:'npcs',campaignId:campaign,status:'active',revision:8,data:{},...patch});
const ok=body=>({ok:true,json:async()=>body});
test('native listing includes assigned identities without masquerading as historical records',async()=>{
 let path;
 const client=createCatalogClient(async url=>{path=url;return ok({items:[item()],nextCursor:null});},{native:true});
 assert.equal((await client.list('npcs',owner))[0].campaignId,campaign);
 assert.equal(path,'/vtt/catalog/native/npcs');
 for(const patch of [{status:'archived'},{ownerId:id},{campaignId:'bad'}]){
  await assert.rejects(createCatalogClient(async()=>ok({items:[item(patch)],nextCursor:null}),{native:true}).list('npcs',owner));
 }
});
test('native assignment is PATCH, exact revision/campaign and distinct from copy',async()=>{
 let request;
 const client=createCatalogClient(async(url,init)=>{request={url,init};return ok({item:item()});},{native:true});
 await client.assign('npcs',id,owner,7,campaign);
 assert.equal(request.url,`/vtt/catalog/native/npcs/${id}/assignment`);
 assert.equal(request.init.method,'PATCH');
 assert.deepEqual(JSON.parse(request.init.body),{revision:7,campaignId:campaign});
 for(const patch of [{campaignId:null},{revision:7}]){
  const wrong=createCatalogClient(async()=>ok({item:item(patch)}),{native:true});
  await assert.rejects(wrong.assign('npcs',id,owner,7,campaign));
 }
 await assert.rejects(client.assign('characters',id,owner,7,campaign),/nessuna modifica eseguita/);
});
test('native archive requires canonical identity, archived status and revision acknowledgement',async()=>{
 let request;
 const client=createCatalogClient(async(url,init)=>{request={url,init};
  return ok({item:item({status:'archived'}),archivedId:id});},{native:true});
 await client.archive('npcs',id,owner,7);
 assert.equal(request.init.method,'DELETE');assert.deepEqual(JSON.parse(request.init.body),{revision:7});
 for(const patch of [{status:'active'},{revision:7},{id:campaign}]){
  await assert.rejects(createCatalogClient(async()=>ok({item:item(patch),archivedId:id}),{native:true}).archive('npcs',id,owner,7));
 }
});
