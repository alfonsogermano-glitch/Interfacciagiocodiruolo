import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogRejected} from '../src/unassigned-catalog-contract.mjs';
import {catalogNoteCreate,catalogNoteSave,catalogNoteOrder,catalogRevisionBody,catalogDuplicateBody} from '../src/unassigned-catalog-notes-contract.mjs';
import {createUnassignedCatalogNotesService} from '../src/unassigned-catalog-notes-service.mjs';
import {createUnassignedCatalogService} from '../src/unassigned-catalog-service.mjs';
const actor='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const note='ABCDEFAB-1234-4000-8000-ABCDEFABCDEF';
const draft={revision:1,tabName:'  Tab  ',content:'Testo precedente',contentRich:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Testo'}]}]},position:0,hidden:true,visibility:'private'};
const invalid=fn=>assert.throws(fn,error=>error instanceof CatalogRejected&&error.status===400);

test('catalog note contracts preserve original legacy/rich text, hidden/private and normalized UUID order',()=>{
 assert.deepEqual(catalogNoteCreate({revision:1,tabName:' Tab '}),{revision:1,tabName:'Tab',parentId:null});
 assert.equal(catalogNoteCreate({revision:1,tabName:'Tab',parentId:note}).parentId,note.toLowerCase());
 const saved=catalogNoteSave(draft);
 assert.equal(saved.tabName,'Tab');assert.deepEqual(saved.contentRich,draft.contentRich);assert.notEqual(saved.contentRich,draft.contentRich);
 assert.equal(saved.hidden,true);assert.equal(saved.visibility,'private');
 assert.equal(catalogNoteSave({...draft,contentRich:null}).contentRich,null);
 assert.deepEqual(catalogNoteOrder({revision:1,tabOrder:[note]}).tabOrder,[note.toLowerCase()]);
 assert.equal(catalogRevisionBody({revision:1}),1);
 assert.deepEqual(catalogDuplicateBody({revision:1,requestId:note}),{revision:1,requestId:note.toLowerCase()});
});

test('catalog notes never accept browser owner, entity/campaign IDs, author, parent changes, or arbitrary metadata',()=>{
 for(const key of ['ownerId','owner_profile_id','campaignId','entityId','status','parentId','tab_order','createdAt']){
  invalid(()=>catalogNoteSave({...draft,[key]:id}));
  invalid(()=>catalogDuplicateBody({revision:1,requestId:id,[key]:actor}));
 }
 for(const revision of [undefined,null,0,-1,'1',1.1,2147483647]){
  invalid(()=>catalogNoteSave({...draft,revision}));
  invalid(()=>catalogRevisionBody({revision}));
 }
 for(const tabName of ['', ' ',null,'x'.repeat(121)])invalid(()=>catalogNoteCreate({revision:1,tabName}));
 invalid(()=>catalogNoteCreate({revision:1,tabName:'Tab',parentId:'bad'}));
 invalid(()=>catalogNoteOrder({revision:1,tabOrder:[note,note.toLowerCase()]}));
 invalid(()=>catalogNoteOrder({revision:1,tabOrder:Array(101).fill(id)}));
 invalid(()=>catalogNoteOrder({revision:1,tabOrder:['scheda']}));
 invalid(()=>catalogDuplicateBody({revision:1}));
 invalid(()=>catalogRevisionBody({revision:1,requestId:id}));
});

test('catalog notes reject oversized UTF-8, malformed/unsafe/deep rich documents and unmigrated image transports',()=>{
 for(const content of [null,'é'.repeat(16385),'https://legacy.supabase.co/object','data:image/png;base64,x'])
  invalid(()=>catalogNoteSave({...draft,content}));
 let deep={type:'doc'};for(let i=0;i<65;i++)deep={child:deep};
 const cyclic={};cyclic.self=cyclic;
 for(const contentRich of [undefined,[],new Date(),deep,cyclic,JSON.parse('{"__proto__":{}}'),
  {value:Infinity},{text:'é'.repeat(475001)},{src:'https://old.supabase.in/x'},{src:'data:image/jpeg;base64,abc'}])
  invalid(()=>catalogNoteSave({...draft,contentRich}));
 for(const patch of [{hidden:'yes'},{visibility:'gm'},{position:-1},{position:1.2},{position:10001}])
  invalid(()=>catalogNoteSave({...draft,...patch}));
});

test('invalid notes/duplication requests fail before SQL, and database revision conflicts become sanitized 409',async()=>{
 let calls=0;
 const pool={query:async()=>{calls++;throw Object.assign(new Error('raw database detail'),{code:'40001'});}};
 const notes=createUnassignedCatalogNotesService({pool}),catalog=createUnassignedCatalogService({pool});
 await assert.rejects(()=>notes.create(actor,'characters',id,{revision:1,tabName:'Tab',ownerId:actor}),CatalogRejected);
 await assert.rejects(()=>notes.reorder(actor,'characters',id,note,{revision:1,tabOrder:[id,id]}),CatalogRejected);
 await assert.rejects(()=>catalog.duplicate(actor,'characters',id,{revision:1,requestId:'bad'}),CatalogRejected);
 assert.equal(calls,0);
 await assert.rejects(()=>notes.create(actor,'characters',id,{revision:1,tabName:'Tab'}),error=>error.status===409&&!/raw/.test(error.message));
 await assert.rejects(()=>catalog.duplicate(actor,'characters',id,{revision:1,requestId:id}),error=>error.status===409&&!/raw/.test(error.message));
 assert.equal(calls,2);
});

test('note acknowledgements cannot change context, saved ID or archived ID; duplicate cannot echo the source identity',async()=>{
 const item={id,ownerId:actor,kind:'characters',campaignId:null,revision:2};
 for(const result of [{item:{...item,ownerId:id},note:{id:note.toLowerCase()}},
  {item,note:{id:actor}},{item:{...item,campaignId:actor},note:{id:note.toLowerCase()}}]){
  const notes=createUnassignedCatalogNotesService({pool:{query:async()=>({rows:[{result}]})}});
  await assert.rejects(()=>notes.save(actor,'characters',id,note,draft),/Invalid catalog/);
 }
 const notes=createUnassignedCatalogNotesService({pool:{query:async()=>({rows:[{result:{item,archivedId:actor}}]})}});
 await assert.rejects(()=>notes.archive(actor,'characters',id,note,{revision:1}),/Invalid catalog note archive acknowledgement/);
 const catalog=createUnassignedCatalogService({pool:{query:async()=>({rows:[{item}]})}});
 await assert.rejects(()=>catalog.duplicate(actor,'characters',id,{revision:1,requestId:actor}),/Invalid catalog duplicate identity/);
});
