import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePendingMapPublication,buildPersistedMapPublication} from '../../../src/app/components/session/mapPublicationBatch.ts';
const base={campaignId:'campaign',chapterId:'chapter',sceneId:'scene',id:'scene-1',publishedAt:'2026-11-14T09:00:00.000Z'};
test('coalesced map patches retain independent fields and prefer the newest field value',()=>{
 const placement={x:5,y:6,locked:false};
 const tokens=[{id:'t',x:1,y:2}];
 const first=mergePendingMapPublication(null,base,{mapPlacement:placement});
 const second=mergePendingMapPublication(first,{...base,id:'scene-2'}, {mapTokens:tokens});
 assert.deepEqual(second.fields,{mapPlacement:placement,mapTokens:tokens});
 const updated={x:8,y:9,locked:false};
 const third=mergePendingMapPublication(second,base,{mapPlacement:updated});
 assert.deepEqual(third.fields,{mapPlacement:updated,mapTokens:tokens});
});
test('different campaign, chapter or scene requires flushing the old patch',()=>{
 const first=mergePendingMapPublication(null,base,{mapFog:[{id:'fog'}]});
 for(const update of [{campaignId:'other'},{chapterId:'other'},{sceneId:'other'}]){
  assert.equal(mergePendingMapPublication(first,{...base,...update},{mapTokens:[]}),null);
 }
});

test('queued map state preserves earlier fields when React regenerates the publication ID',()=>{
 const old={...base,id:'first',mapTokens:[{id:'t',x:10}],mapFog:[{id:'fog'}]};
 const stale={...base,id:'second',publishedAt:'2026-11-14T09:00:00.100Z',
  mapTokens:[],mapFog:[]};
 const next=buildPersistedMapPublication(old,stale,{mapPlacement:{x:2,y:3,locked:false}});
 assert.equal(next.id,'second');
 assert.deepEqual(next.mapTokens,[{id:'t',x:10}]);
 assert.deepEqual(next.mapFog,[{id:'fog'}]);
 assert.deepEqual(next.mapPlacement,{x:2,y:3,locked:false});
});
test('different chapter never inherits prior scene fields',()=>{
 const old={...base,mapTokens:[{id:'t',x:10}]};
 const next=buildPersistedMapPublication(old,{...base,chapterId:'new',mapTokens:[]},
  {mapFog:[{id:'new-fog'}]});
 assert.deepEqual(next.mapTokens,[]);
 assert.deepEqual(next.mapFog,[{id:'new-fog'}]);
});

test('original hook flushes a pending map patch before publishing a new scene',async()=>{
 const {readFile}=await import('node:fs/promises');
 const hook=await readFile(new URL('../../../src/app/components/session/useActiveScene.ts',import.meta.url),'utf8');
 assert.match(hook,/const publish = useCallback\(async \(value: ActiveScenePublication\) => \{[\s\S]*?flushPendingPublication\(\);[\s\S]*?const publishedAtMs/);
});
test('original hook cancels pending debounce and queues clearing after map writes',async()=>{
 const {readFile}=await import('node:fs/promises');
 const hook=await readFile(new URL('../../../src/app/components/session/useActiveScene.ts',import.meta.url),'utf8');
 const clear=hook.slice(hook.indexOf('const clear = useCallback'));
 assert.match(clear,/publicationPendingRef\.current = null;/);
 assert.match(clear,/const operation = publicationQueueRef\.current\.then\(async \(\) => \{/);
 assert.match(clear,/await clearActiveScene\(campaignId\)/);
});

test('scene clear is serialized as a queued operation and not merely preceded by a queue wait',async()=>{
 const {readFile}=await import('node:fs/promises');
 const hook=await readFile(new URL('../../../src/app/components/session/useActiveScene.ts',import.meta.url),'utf8');
 const clear=hook.slice(hook.indexOf('const clear = useCallback'));
 assert.match(clear,/const operation = publicationQueueRef\.current\.then\(async \(\) => \{/);
 assert.match(clear,/await clearActiveScene\(campaignId\)/);
 assert.match(clear,/publicationQueueRef\.current = operation\.catch\(/);
 assert.doesNotMatch(clear,/await publicationQueueRef\.current;[\s\S]*?await clearActiveScene/);
});
test('failed scene changes and clears notify correlation listeners',async()=>{
 const {readFile}=await import('node:fs/promises');
 const hook=await readFile(new URL('../../../src/app/components/session/useActiveScene.ts',import.meta.url),'utf8');
 assert.match(hook,/Cambio scena non riuscito:/);
 assert.match(hook,/Cancellazione scena non riuscita:/);
 const calls=[...hook.matchAll(/notifyFailedMapPublication\(campaignId\)/g)];
 assert.ok(calls.length>=3);
});
