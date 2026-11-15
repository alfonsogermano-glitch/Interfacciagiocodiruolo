import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KNOWN_BROADCAST_EVENTS,MAP_BROADCAST_EVENTS,isBroadcastEvent}
 from '../../../src/services/realtime/campaignChannelContract.ts';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('original Realtime vocabulary is the single source for future Aruba GM-host event types',()=>{
 const expected=['INSERT','UPDATE','DELETE','session_change','active_scene_change',
  'active_scene_map_patch','members_change','notes_change','dice_roll',
  'chat_message','chat_reaction','chat_delete','notification','map_measurement',
  'map_token_action','map_poi_action','map_object_layer_action',
  'map_object_drag_preview','map_cone_direction_preview','map_history_action',
  'character_owner_change'];
 assert.deepEqual([...KNOWN_BROADCAST_EVENTS],expected);
 assert.equal(new Set(KNOWN_BROADCAST_EVENTS).size,expected.length);
 const old=read('../../../src/services/realtime/campaignChannel.ts');
 assert.match(old,/import \{ KNOWN_BROADCAST_EVENTS, type BroadcastEvent \} from '\.\/campaignChannelContract'/);
 assert.match(old,/new Map\(KNOWN_BROADCAST_EVENTS\.map/);
 assert.match(old,/for \(const event of KNOWN_BROADCAST_EVENTS\)/);
 assert.match(old,/export function useCampaignChannel\(/);
});
test('map broadcasts used by original source remain present; unknown event names are rejected',()=>{
 const source=read('../../../src/app/components/session/SessionWorkspace.tsx');
 const scene=read('../../../src/app/components/session/useActiveScene.ts');
 const viewport=read('../../../src/app/components/session/MapViewport.tsx');
 for(const name of MAP_BROADCAST_EVENTS){
  assert.ok(KNOWN_BROADCAST_EVENTS.includes(name),'event not registered: '+name);
  assert.ok(source.includes(name)||scene.includes(name)||viewport.includes(name),'orphaned map event '+name);
  assert.equal(isBroadcastEvent(name),true);
 }
 for(const unknown of [null,undefined,{},123,'','map_token_admin',
  'active_scene_changed','__proto__','MAP_TOKEN_ACTION']){
  assert.equal(isBroadcastEvent(unknown),false);
 }
 assert.equal(isBroadcastEvent('dice_roll'),true);
});
test('original reference counting, reconnect, and listener isolation remain in place',()=>{
 const old=read('../../../src/services/realtime/campaignChannel.ts');
 for(const important of ['const registry = new Map','function acquireChannel(',
  'function releaseChannel(','function safeForEach','retryTimeout',
  'hasScheduledRetry','refCount += 1','refCount -= 1',
  'presenceQueue','selectedContentMode()'])
  assert.ok(old.includes(important),important);
 assert.doesNotMatch(read('../../../src/services/realtime/campaignChannelContract.ts'),
  /import.*supabase|fetch\(|new WebSocket|new Peer|localStorage/);
});
