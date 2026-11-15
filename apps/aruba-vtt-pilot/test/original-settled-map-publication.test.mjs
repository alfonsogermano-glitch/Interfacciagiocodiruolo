import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
 subscribeCommittedMapPublication,notifyCommittedMapPublication,
} from '../../../src/app/components/session/activeScenePublicationObserver.ts';

const scene=(campaignId='campaign-A',publishedAt='2026-11-13T21:00:00.000Z')=>({
 id:'scene-1',campaignId,chapterId:'chapter-1',sceneId:'scene-1',
 publishedAt,mapTokens:[{id:'token-one',x:4,y:7}],mapDrawings:[],
 mapPois:[],mapFog:[],mapObjectOrder:[],
});
test('opt-in notifications are campaign-scoped, isolated and unsubscribable',()=>{
 const a=[],b=[];
 const cancelA=subscribeCommittedMapPublication('campaign-A',x=>a.push(x));
 const cancelB=subscribeCommittedMapPublication('campaign-B',x=>b.push(x));
 notifyCommittedMapPublication(scene());
 assert.equal(a.length,1);
 assert.deepEqual(a[0].state.mapTokens,[{id:'token-one',x:4,y:7}]);
 assert.equal(a[0].campaignId,'campaign-A');
 assert.equal(a[0].chapterId,'chapter-1');
 assert.deepEqual(b,[]);
 notifyCommittedMapPublication(scene('campaign-B'));
 assert.equal(a.length,1);
 assert.equal(b.length,1);
 cancelA();cancelA();
 notifyCommittedMapPublication(scene());
 assert.equal(a.length,1);
 cancelB();
});
test('subscriber mutation cannot corrupt the original or other observers',()=>{
 const original=scene(),observed=[];
 const stopA=subscribeCommittedMapPublication('campaign-A',result=>{
  result.state.mapTokens[0].x=999;
 });
 const stopB=subscribeCommittedMapPublication('campaign-A',result=>{
  observed.push(result.state.mapTokens[0].x);
 });
 notifyCommittedMapPublication(original);
 assert.deepEqual(observed,[4]);
 assert.equal(original.mapTokens[0].x,4);
 stopA();stopB();
});
test('subscriber errors do not stop other observer callbacks',()=>{
 const originalLog=console.error;
 const errors=[],observed=[];
 console.error=(...args)=>errors.push(args);
 const stopA=subscribeCommittedMapPublication('campaign-A',()=>{throw Error('subscriber boom');});
 const stopB=subscribeCommittedMapPublication('campaign-A',result=>observed.push(result.publishedAt));
 try{
  notifyCommittedMapPublication(scene());
  assert.equal(errors.length,1);
  assert.match(String(errors[0][1]),/subscriber boom/);
  assert.equal(observed.length,1);
 }finally{
  stopA();stopB();console.error=originalLog;
 }
});
test('original useActiveScene publishes only AFTER awaiting persist and legacy map event send',()=>{
 const original=readFileSync(fileURLToPath(new URL(
  '../../../src/app/components/session/useActiveScene.ts',import.meta.url)),'utf8');
 const flush=original.indexOf('const flushPendingPublication = useCallback(');
 const tail=original.indexOf('const publish = useCallback(',flush);
 assert.ok(flush>=0&&tail>flush);
 const functionCode=original.slice(flush,tail);
 const persisted=functionCode.indexOf('await saveActiveScene(campaignId, persisted);');
 const sent=functionCode.indexOf("await send('active_scene_map_patch', { patch });");
 const notified=functionCode.indexOf('notifyCommittedMapPublication(persisted);');
 assert.ok(persisted>=0&&sent>persisted&&notified>sent);
 assert.match(functionCode,/publicationQueueRef\.current\.then\(async \(\) =>/);
 assert.match(original,/publicationDebounceRef\.current = setTimeout\(\(\) => \{/);
 assert.match(original,/\}, 100\);/);
});
