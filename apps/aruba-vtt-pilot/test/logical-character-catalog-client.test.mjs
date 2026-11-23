import test from 'node:test';
import assert from 'node:assert/strict';
import {createLogicalCharacterCatalogClient} from '../src/logical-character-catalog-client.mjs';
import {validateBootstrap} from '../src/client.mjs';
const actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const copy='33333333-3333-4333-8333-333333333333';
const row=(patch={})=>({id,logicalOwnerId:actor,ownerId:actor,campaignId:null,status:'active',revision:7,sheetData:{},...patch});
const ok=value=>({ok:true,json:async()=>value});
test('logical catalog paging validates owner and follows exact cursors',async()=>{
 let count=0;
 const client=createLogicalCharacterCatalogClient(async url=>{
  if(++count===2)assert.equal(url,'/vtt/catalog/logical-characters?after='+id);
  return ok({characters:[row(count===1?{}:{id:copy})],nextCursor:count===1?id:null});
 });
 assert.equal((await client.list(actor)).length,2);
 await assert.rejects(createLogicalCharacterCatalogClient(async()=>ok({characters:[row({logicalOwnerId:copy})],nextCursor:null})).list(actor));
});
test('logical save/duplicate/archive use cookie transport and observed revisions',async()=>{
 const calls=[];
 const client=createLogicalCharacterCatalogClient(async(url,init)=>{
  calls.push({url,init});
  if(init.method==='DELETE')return ok({character:row({status:'archived',revision:8}),archivedId:id});
  return ok({character:url.endsWith('/duplicate')?row({id:copy,claimableOrigin:false,availableForPlayers:false}):row({revision:8})});
 });
 await client.save(actor,id,{revision:7,name:'Mara',ruleset:'hsc',sheetData:{}});
 await client.duplicate(actor,id,7,copy);await client.archive(actor,id,7);
 assert.deepEqual(calls.map(c=>c.init.method),['PUT','POST','DELETE']);
 assert.ok(calls.every(c=>c.init.credentials==='same-origin'&&c.init.redirect==='error'));
 assert.equal(JSON.parse(calls[0].init.body).revision,7);
 const wrong=createLogicalCharacterCatalogClient(async()=>ok({character:row()}));
 await assert.rejects(wrong.save(actor,id,{revision:7}));
});
test('logical catalog capability cannot be enabled without logical character reads',()=>{
 const data={backend:'aruba-staging',user:{id:actor,email:'qa@example.invalid',displayName:'QA',role:'standard'},
  capabilities:{campaigns:{read:true,write:true},characters:{read:true,write:true},logicalCharacters:{read:true,write:true},
   logicalCharacterCatalog:{read:true,write:true},gameSession:false}};
 assert.equal(validateBootstrap(data).logicalCharacterCatalogEnabled,true);
 assert.throws(()=>validateBootstrap({...data,capabilities:{...data.capabilities,logicalCharacters:{read:false,write:false}}}));
});
