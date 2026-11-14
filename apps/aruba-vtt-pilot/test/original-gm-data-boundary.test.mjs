import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

// Fail closed: these original managers still access Supabase and legacy local
// storage. Mounting them directly in the Aruba entry would silently bypass
// the new server-owned campaign and authorization boundaries.
test('original chapter and encounter managers remain behind the Aruba data boundary',()=>{
 const chapters=read('../../../src/app/components/gm/ChapterManager.tsx');
 const encounters=read('../../../src/app/components/gm/SceneEncounterManager.tsx');
 const pilot=read('../src/main.tsx');
 assert.match(chapters,/services\/supabase\/entitiesService/);
 assert.match(chapters,/localStorage/);
 assert.match(encounters,/services\/supabase\/entitiesService/);
 assert.match(encounters,/supabaseClient/);
 assert.doesNotMatch(pilot,/from ['"][^'"]*\/ChapterManager['"]/);
 assert.doesNotMatch(pilot,/from ['"][^'"]*\/SceneEncounterManager['"]/);
 assert.doesNotMatch(pilot,/<ChapterManager\b|<SceneEncounterManager\b/);
});

test('unfinished GM routes remain explicit in the parity release inventory',()=>{
 const inventory=JSON.parse(read('../../../deploy/aruba/qa/full-parity-contract.json'));
 for(const id of ['chapters','scene-encounter']){
  const entry=inventory.rightNavigation.find(item=>item.id===id);
  assert.ok(entry,'Missing GM release gate for '+id);
  assert.notEqual(entry.state,'verificato','Unsafe release certification for '+id);
 }
 assert.equal(inventory.acceptance.allRoutesMigrated,false);
 assert.equal(inventory.releasePolicy.allowPartialPublish,false);
});
