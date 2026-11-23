import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogRejected,catalogId,validateUnassignedCatalogBody,validateCatalogMedia} from '../src/unassigned-catalog-contract.mjs';
import {createUnassignedCatalogService} from '../src/unassigned-catalog-service.mjs';
const draft={name:'  Mara  ',ruleset:'hsc',data:{style:'Jock',viaggio:'Campione',ambiti:{Fisico:1},abilita:{},tratti:[],equipment:[]}};
const owner='00000000-0000-4000-8000-000000000001';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=';
const invalid=fn=>assert.throws(fn,error=>error instanceof CatalogRejected&&error.status===400);

test('native catalog preserves original sheet fields but trims only the authoritative name',()=>{
 const parsed=validateUnassignedCatalogBody('characters',draft);
 assert.equal(parsed.name,'Mara');assert.deepEqual(parsed.data,draft.data);
 assert.notEqual(parsed.data,draft.data);
 for(const ruleset of ['hsc','dnd5e','pathfinder','coc7e','cocclassic','custom'])
  assert.equal(validateUnassignedCatalogBody('npcs',{name:'PNG',ruleset,data:{description:'Test',tabOrder:['scheda','segreti']}}).ruleset,ruleset);
});

test('native catalog refuses browser ownership, placement, provenance, timestamps and media references',()=>{
 for(const key of ['ownerId','campaignId','id','kind','createdAt','revision'])
  invalid(()=>validateUnassignedCatalogBody('characters',{...draft,[key]:owner}));
 for(const key of ['ownerId','ownerProfileId','owner_id','owner_profile_id','campaignId','campaign_id',
  'revision','createdAt','status','sourceRecord','sourceCampaignId','availableForPlayers',
  'originalOwnerProfileId','claimableOrigin','chapterId','sceneId','environmentId','mapLocationId',
  'folderId','portraitImageUrl','portraitSourceImageUrl','coverImageUrl','imageUrl','portraitAssetId','portraitFrameAssetId','coverFrameAssetId'])
  invalid(()=>validateUnassignedCatalogBody('characters',{...draft,data:{...draft.data,[key]:owner}}));
});

test('native catalog validates kind, name, ruleset, mechanics and bounded plain JSON',()=>{
 invalid(()=>validateUnassignedCatalogBody('clues',draft));
 for(const name of ['', ' ', 'x'.repeat(501),null])invalid(()=>validateUnassignedCatalogBody('characters',{...draft,name}));
 assert.equal(validateUnassignedCatalogBody('characters',{...draft,name:'x'.repeat(500)}).name.length,500);
 for(const ruleset of [null,'unknown',{},1])invalid(()=>validateUnassignedCatalogBody('characters',{...draft,ruleset}));
 for(const data of [null,[],new Date(),{...draft.data,ambiti:[]},{...draft.data,equipment:{}},
  {...draft.data,notes:'x'.repeat(50001)},{...draft.data,value:Infinity},
  {...draft.data,notes:'é'.repeat(45001)},
  {...draft.data,items:Array(1001).fill(1)},JSON.parse('{"__proto__":{"ownerId":"x"}}'),
  {...draft.data,notes:'https://old.supabase.co/object'},{...draft.data,notes:'data:image/png;base64,x'}])
  invalid(()=>validateUnassignedCatalogBody('characters',{...draft,data}));
 const circular={};circular.self=circular;
 invalid(()=>validateUnassignedCatalogBody('npcs',{name:'PNG',ruleset:'hsc',data:circular}));
 invalid(()=>validateUnassignedCatalogBody('npcs',{name:'PNG',ruleset:'hsc',data:{d20Stats:{hp:'bad'}}}));
});

test('save requires a bounded explicit revision; create never accepts caller-selected revisions',()=>{
 for(const revision of [0,-1,1.2,null,'1',2147483647,Number.MAX_SAFE_INTEGER])
  invalid(()=>validateUnassignedCatalogBody('characters',{...draft,revision},{saving:true}));
 invalid(()=>validateUnassignedCatalogBody('characters',draft,{saving:true}));
 invalid(()=>validateUnassignedCatalogBody('characters',{...draft,revision:1}));
 assert.equal(validateUnassignedCatalogBody('characters',{...draft,revision:1},{saving:true}).revision,1);
 invalid(()=>catalogId('------------------------------------'));
});

test('media validates exact envelope, canonical base64, byte size, role and MIME signature before SQL',()=>{
 const body={revision:1,mimeType:'image/png',dataBase64:png};
 assert.equal(validateCatalogMedia('portrait',body).bytes.toString('base64'),png);
 for(const role of ['frame','unknown',null])invalid(()=>validateCatalogMedia(role,body));
 for(const update of [{ownerId:owner},{campaignId:owner},{mimeType:'image/svg+xml'},
  {mimeType:'image/jpeg'},{dataBase64:'A'.repeat(16)},{dataBase64:png+'\n'},{revision:0}])
  invalid(()=>validateCatalogMedia('portrait',{...body,...update}));
 const large=Buffer.alloc(524289);Buffer.from(png,'base64').copy(large);
 invalid(()=>validateCatalogMedia('portrait',{...body,dataBase64:large.toString('base64')}));
 assert.equal(validateCatalogMedia('source',{...body,dataBase64:large.toString('base64')}).bytes.length,large.length);
 const tooLarge=Buffer.alloc(2097153);Buffer.from(png,'base64').copy(tooLarge);
 invalid(()=>validateCatalogMedia('cover',{...body,dataBase64:tooLarge.toString('base64')}));
});

test('invalid requests never query SQL and unknown database failures never expose raw details as client errors',async()=>{
 let calls=0;
 const service=createUnassignedCatalogService({pool:{query:async()=>{calls++;throw Object.assign(new Error('private database diagnostic'),{code:'XX000'});}}});
 await assert.rejects(()=>service.create(owner,'characters',{...draft,ownerId:owner}),CatalogRejected);
 await assert.rejects(()=>service.list(owner,'npcs','bad'),CatalogRejected);
 assert.equal(calls,0);
 await assert.rejects(()=>service.create(owner,'characters',draft),/private database diagnostic/);
 assert.equal(calls,1); // HTTP hides unknown errors; the service does not invent success.
});

test('service rejects wrong identity, owner, kind, assignment or revision returned by a broken DB boundary',async()=>{
 const id='00000000-0000-4000-8000-000000000002';
 const expected={id,kind:'characters',ownerId:owner,campaignId:null,revision:1};
 for(const patch of [{id:owner},{ownerId:id},{kind:'npcs'},{campaignId:id},{revision:0},{revision:'1'}]){
  const service=createUnassignedCatalogService({pool:{query:async()=>({rows:[{item:{...expected,...patch}}]})}});
  await assert.rejects(()=>service.read(owner,'characters',id),/Invalid unassigned catalog/);
 }
 const service=createUnassignedCatalogService({pool:{query:async()=>({rows:[{item:expected},{item:expected}]})}});
 await assert.rejects(()=>service.list(owner,'characters'),/Duplicate unassigned catalog identity/);
});
