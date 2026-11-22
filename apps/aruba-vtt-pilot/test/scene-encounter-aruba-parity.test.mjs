import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const manager=read('../src/ArubaSceneEncounterManager.tsx');
const pilot=read('../src/main.tsx');
test('Preparation mounts an Aruba-only Scene Encounter adapter behind all dependencies',()=>{
 assert.match(pilot,/section==='preparation'&&activeCampaign&&<ArubaSceneEncounterManager/);
 assert.match(pilot,/enabled=\{user\.chaptersEnabled&&user\.scenesEnabled&&user\.narrativeContentEnabled\}/);
 for(const call of ['listArubaChapters','listArubaScenes','listArubaNarrativeContent'])assert.match(manager,new RegExp(call));
 assert.doesNotMatch(manager,/localStorage|supabase/i);
});
test('Preparation keeps original scene ordering, linked scopes and four columns',()=>{
 assert.match(manager,/a\.sortOrder-b\.sortOrder/);
 assert.match(manager,/item\.sceneId===scene\.id/);
 assert.match(manager,/item\.chapterId===scene\.chapterId/);
 assert.match(manager,/item\.environmentId===scene\.environmentId/);
 for(const title of ['PNG','Mostri','Indizi','Eventi'])assert.ok(manager.includes(`title:'${title}'`));
});
