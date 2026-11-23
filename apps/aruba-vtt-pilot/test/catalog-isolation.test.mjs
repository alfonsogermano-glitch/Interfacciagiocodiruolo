import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build,transform} from 'esbuild';
import {acknowledgeOriginalCatalogCreation} from '../src/ArubaCatalogTransforms.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('real pilot entry remains valid TSX with intact Italian text',async()=>{
 const pilot=source('src/main.tsx');
 await transform(pilot,{loader:'tsx'});
 assert.doesNotMatch(pilot,/Ã|â\?|âo§|placeholder-mark -Aruba/);
 assert.match(pilot,/disponibilità/);
});
test('incomplete original catalog is separated from the public bundle',()=>{
 const config=source('vite.config.mjs'),pilot=source('src/main.tsx');
 assert.match(config,/HG_CATALOG_CONTRACT==='1'\?'src\/ArubaOriginalCatalog.tsx':'src\/ArubaCatalogUnavailable.tsx'/);
 assert.doesNotMatch(pilot,/import.*from.*\/gm\/MyCharactersPage/);
 assert.doesNotMatch(pilot,/user\.catalogEnabled/);
});
test('original adapter unavailable actions reject instead of returning fake success',async()=>{
 const compiled=await build({entryPoints:[new URL('../src/ArubaCatalogService.ts',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],
  bundle:true,write:false,format:'esm',platform:'node'});
 const adapter=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 await assert.rejects(adapter.deleteCharacter('unknown'));
 await assert.rejects(adapter.duplicateEntityNotes('npc','source','target'));
});
test('native archive tombstone prevents a delayed autosave from recreating the record',async()=>{
 const compiled=await build({entryPoints:[new URL('../src/ArubaCatalogService.ts',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],
  bundle:true,write:false,format:'esm',platform:'node'});
 const adapter=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
 const originalFetch=globalThis.fetch,identity=globalThis.__HG_ARUBA_TOPBAR_IDENTITY__;
 const item={id,ownerId:owner,kind:'npcs',campaignId:null,status:'active',revision:1,name:'Custode',ruleset:'hsc',data:{description:'Test'}};
 let creates=0;
 try{
  globalThis.__HG_ARUBA_TOPBAR_IDENTITY__={id:owner};
  globalThis.fetch=async(_url,init)=>{
   if(init.method==='POST'){creates++;return {ok:true,json:async()=>({item})};}
   assert.equal(init.method,'DELETE');
   return {ok:true,json:async()=>({item:{...item,status:'archived',revision:2},archivedId:id})};
  };
  const saved=await adapter.saveNPC(null,{name:'Custode',ruleset:'hsc',description:'Test',ownerProfileId:owner});
  await adapter.deleteNPC(saved.id);
  await assert.rejects(adapter.saveNPC(null,{...saved,name:'Salvataggio tardivo'}),/archiviato/);
  await assert.rejects(adapter.saveNPC(null,{...saved,ownerProfileId:id}),/Sessione catalogo cambiata/);
  assert.equal(creates,1);
 }finally{globalThis.fetch=originalFetch;globalThis.__HG_ARUBA_TOPBAR_IDENTITY__=identity;}
});
test('original draft transport waits for canonical identity and preserves failed drafts',async()=>{
 const original=readFileSync(new URL('../../../src/app/components/gm/MyCharactersPage.tsx',import.meta.url),'utf8');
 const isolated=acknowledgeOriginalCatalogCreation(original);
 await transform(isolated,{loader:'tsx'});
 assert.match(isolated,/const saved = await saveNPC/);
 assert.match(isolated,/const saved = await saveMonster/);
 assert.match(isolated,/onOpenDetail\('npc', saved.id\)/);
 assert.match(isolated,/onOpenDetail\('monster', saved.id\)/);
 assert.match(isolated,/disabled=\{catalogCreating \|\| !detailData.name.trim\(\)\}/);
 assert.throws(()=>acknowledgeOriginalCatalogCreation('upstream changed'),/contract changed/);
});
