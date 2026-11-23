import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogClient,validateCatalogImage} from '../src/catalog-client.mjs';
import {validateBootstrap} from '../src/client.mjs';
const owner='11111111-1111-4111-8111-111111111111',entity='22222222-2222-4222-8222-222222222222';
const root='33333333-3333-4333-8333-333333333333',child='44444444-4444-4444-8444-444444444444';
const item=(revision=8)=>({id:entity,kind:'npcs',ownerId:owner,campaignId:null,data:{},revision});
const note=(patch={})=>({id:root,tab_name:'Nota',content:'Testo',content_rich:null,position:0,
 hidden:false,visibility:'private',parent_note_id:null,tab_order:null,...patch});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=';
const image={mimeType:'image/png',dataBase64:png};
const ok=body=>({ok:true,json:async()=>body});
test('native capability is optional, explicit and cannot claim global catalog parity',()=>{
 const data={backend:'aruba-staging',user:{id:owner,email:'test@example.invalid',displayName:'Test',role:'standard'},
  capabilities:{campaigns:{read:true,write:true},characters:{read:false,write:false},gameSession:false}};
 assert.equal(validateBootstrap(data).nativeCatalogEnabled,false);
 assert.equal(validateBootstrap({...data,capabilities:{...data.capabilities,nativeCatalog:{read:true,write:true}}}).nativeCatalogEnabled,true);
 for(const nativeCatalog of [{read:true,write:false},{read:'true',write:'true'}])
  assert.throws(()=>validateBootstrap({...data,capabilities:{...data.capabilities,nativeCatalog}}));
 assert.throws(()=>validateBootstrap({...data,capabilities:{...data.capabilities,
  campaigns:{read:false,write:false},nativeCatalog:{read:true,write:true}}}));
});
test('native image validation checks signatures, size, MIME and canonical base64',()=>{
 assert.deepEqual(validateCatalogImage('portrait',image),image);
 for(const media of [{...image,mimeType:'image/jpeg'},{...image,dataBase64:'not-base64'},
  {...image,mimeType:'text/html'},{...image,dataBase64:'A'.repeat(700000)}]){
  assert.throws(()=>validateCatalogImage('portrait',media));
 }
 assert.throws(()=>validateCatalogImage('../other',image));
});
test('media writes use observed revision and authenticated native endpoint',async()=>{
 let request;
 const client=createCatalogClient(async(url,init)=>{request={url,init};return ok({item:item()});});
 const saved=await client.saveMedia('npcs',entity,owner,7,'portrait',image);
 assert.equal(saved.revision,8);
 assert.equal(request.url,`/vtt/catalog/unassigned/npcs/${entity}/media/portrait`);
 assert.deepEqual(JSON.parse(request.init.body),{...image,revision:7});
 assert.equal(request.init.credentials,'same-origin');assert.equal(request.init.redirect,'error');
 assert.equal(request.init.headers.Authorization,undefined);
});
test('media reads reject invalid role before network and validate returned bytes',async()=>{
 let calls=0;
 const client=createCatalogClient(async()=>{calls++;return ok({...image,revision:8});});
 await assert.rejects(client.readMedia('npcs',entity,'../other'));assert.equal(calls,0);
 assert.equal((await client.readMedia('npcs',entity,'portrait')).dataBase64,png);
 const bad=createCatalogClient(async()=>ok({...image,mimeType:'image/jpeg',revision:8}));
 await assert.rejects(bad.readMedia('npcs',entity,'portrait'));
});
test('note lists validate owner, parent scope and unique sibling identities',async()=>{
 const client=createCatalogClient(async()=>ok({item:item(),notes:[note()]}));
 assert.equal((await client.listNotes('npcs',entity,owner)).notes[0].id,root);
 for(const notes of [[note(),note()],[note({parent_note_id:child})],[note({visibility:'public'})]]){
  const bad=createCatalogClient(async()=>ok({item:item(),notes}));
  await assert.rejects(bad.listNotes('npcs',entity,owner));
 }
});
test('note creation acknowledges entity revision and exact parent',async()=>{
 let body;
 const client=createCatalogClient(async(_url,init)=>{body=JSON.parse(init.body);
  return ok({item:item(),note:note({id:child,parent_note_id:root})});});
 const result=await client.createNote('npcs',entity,owner,7,' Figlio ',root);
 assert.equal(result.note.id,child);
 assert.deepEqual(body,{revision:7,tabName:'Figlio',parentId:root});
 const wrong=createCatalogClient(async()=>ok({item:item(),note:note({id:child})}));
 await assert.rejects(wrong.createNote('npcs',entity,owner,7,'Figlio',root));
});
test('note saves and archive require exact acknowledgement, not just HTTP 200',async()=>{
 const client=createCatalogClient(async(_url,init)=>ok(init.method==='DELETE'?
  {item:item(),archivedId:root}:{item:item(),note:note()}));
 assert.equal((await client.saveNote('npcs',entity,owner,7,root,note())).note.id,root);
 assert.equal((await client.archiveNote('npcs',entity,owner,7,root)).archivedId,root);
 const wrong=createCatalogClient(async()=>ok({item:item(),archivedId:child,note:note({id:child})}));
 await assert.rejects(wrong.archiveNote('npcs',entity,owner,7,root));
 await assert.rejects(wrong.saveNote('npcs',entity,owner,7,root,note()));
});
test('sub-tab ordering validates exact returned order and rejects duplicate IDs before network',async()=>{
 let calls=0;
 const client=createCatalogClient(async()=>{calls++;return ok({item:item(),note:note({tab_order:[child]})});});
 assert.deepEqual((await client.reorderNotes('npcs',entity,owner,7,root,[child])).note.tab_order,[child]);
 await assert.rejects(client.reorderNotes('npcs',entity,owner,7,root,[child,child]));
 assert.equal(calls,1);
});
test('media/notes reject non-advancing revisions and expose conflicts without automatic retry',async()=>{
 const stale=createCatalogClient(async()=>ok({item:item(7),note:note()}));
 await assert.rejects(stale.saveMedia('npcs',entity,owner,7,'portrait',image),/Revisione/);
 await assert.rejects(stale.saveNote('npcs',entity,owner,7,root,note()),/Revisione/);
 let calls=0;
 const conflict=createCatalogClient(async()=>{calls++;return {ok:false,status:409};});
 await assert.rejects(conflict.archiveNote('npcs',entity,owner,7,root),{status:409});
 assert.equal(calls,1);
});
