import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('original SessionWorkspace uses Aruba owner persistence and verified realtime',()=>{
 const vite=read('../vite.config.mjs');
 const entities=read('../src/ArubaSessionEntitiesService.ts');
 const active=read('../src/ArubaSessionActiveScene.ts');
 const original=read('../../../src/app/components/session/SessionWorkspace.tsx');
 const contract=read('../../aruba-api/src/campaign-document-contract.mjs');
 assert.match(vite,/SessionWorkspace\.tsx/);
 assert.match(vite,/ArubaSessionEntitiesService\.ts/);
 assert.match(vite,/ArubaSessionCampaignChannel\.ts/);
 assert.match(vite,/ArubaSessionActiveScene\.ts/);
 assert.match(entities,/listArubaChapters\(fetch,campaignId\)/);
 assert.match(entities,/listArubaScenes\(fetch,campaignId\)/);
 assert.match(active,/const KEY='active-scene'/);
 assert.match(active,/saveCampaignDocument\(target,KEY,persisted\)/);
 assert.match(active,/useCampaignChannel\(campaignId/);
 assert.match(active,/return \{activeScene,loading,channelReady,publish,publishMapPatch,clear\}/);
 assert.match(active,/buildPersistedMapPublication\(latest\.current,next,queued\.fields\)/);
 assert.match(active,/mergePendingMapPublication\(pending\.current,value,fields\)/);
 assert.match(active,/await flushPending\(\);\s*if\(!owner\|\|!campaignId/);
 assert.doesNotMatch(active,/supabase|WebSocket|localStorage/i);
 for(const key of ['session-map-placements','session-map-grids','session-map-tokens','session-map-drawings','session-map-pois','session-map-fog','session-map-object-order']){
  assert.ok(original.includes(`"${key}"`),`original key missing ${key}`);
  assert.ok(contract.includes(`'${key}'`),`Aruba document contract missing ${key}`);
 }
});

test('player mounts only non-owner workspace during verified live session',()=>{
 const main=read('../src/main.tsx');
 assert.match(main,/section==='map'&&activeCampaign&&activeCampaignOwned&&user\.campaignDocumentsEnabled/);
 assert.match(main,/section==='map'&&activeCampaign&&!activeCampaignOwned&&user\.gameSessionEnabled&&liveCampaignId===activeCampaign\.id/);
 assert.match(main,/<ArubaOriginalPlayerSessionWorkspace/);
 assert.match(main,/<ArubaOriginalGameMap[\s\S]*enabled=\{false\}/);
});
