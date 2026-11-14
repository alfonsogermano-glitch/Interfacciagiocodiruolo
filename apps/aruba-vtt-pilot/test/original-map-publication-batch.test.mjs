import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePendingMapPublication} from '../../../src/app/components/session/mapPublicationBatch.ts';
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
