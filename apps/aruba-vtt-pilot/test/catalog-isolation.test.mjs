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
 for(const name of ['deleteNPC','deleteMonster','assignNPCToCampaign','assignMonsterToCampaign',
  'unassignNPCFromCampaign','unassignMonsterFromCampaign','deleteCharacter']){
  assert.throws(()=>adapter[name](),/nessuna modifica eseguita/,name);
 }
 await assert.rejects(adapter.duplicateEntityNotes('npc','source','target'));
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
