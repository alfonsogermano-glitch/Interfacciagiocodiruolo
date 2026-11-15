import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
 reconcileMapObjectOrder,moveMapObjectBlock,filterMapObjectOrder,
 getRotatedRectBounds,getRotatedSquareBounds,doBoundsOverlap,
} from '../../../src/app/components/session/mapObjectLayers.ts';
import {
 projectOriginalMapForPlayer,projectOriginalMapDelta,
} from '../src/ArubaOriginalMapRevisionProjection.mjs';
import {createArubaGmRevisionedCampaignSource} from '../src/ArubaGmRevisionedCampaignSource.mjs';

const root=fileURLToPath(new URL('../../../src/app/components/session/SessionWorkspace.tsx',import.meta.url));
const owner='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const campaign='00000000-0000-4000-8000-000000000001';
const peer='00000000-0000-4000-8000-000000000004';
const map=()=>({
 mapTokens:[
  {id:'token-owner',x:0,y:0,size:40,rotation:0,createdByProfileId:player,visible:true,locked:false,pinned:false},
  {id:'token-locked',x:0,y:0,size:40,rotation:0,createdByProfileId:player,visible:true,locked:true,pinned:false},
  {id:'token-pinned',x:0,y:0,size:40,rotation:0,createdByProfileId:player,visible:true,locked:false,pinned:true},
  {id:'token-secret',x:20,y:20,size:40,visible:false,pinned:false},
 ],
 mapDrawings:[
  {id:'drawing-1',x:0,y:0,width:40,height:40,rotation:0,visible:true,locked:false,pinned:false},
  {id:'drawing-pinned',x:0,y:0,width:40,height:40,rotation:0,visible:true,pinned:true},
 ],
 mapPois:[{id:'poi-1',x:20,y:20,size:15,rotation:0,visibleToPlayers:true,noteId:'private-note',noteVisibleToPlayers:false}],
 mapObjectOrder:[
  {family:'token',id:'token-secret'},
  {family:'drawing',id:'drawing-1'},
  {family:'token',id:'token-owner'},
  {family:'poi',id:'poi-1'},
  {family:'token',id:'token-locked'},
  {family:'drawing',id:'drawing-pinned'},
  {family:'token',id:'token-pinned'},
 ],
});
const project=state=>projectOriginalMapForPlayer(state);
test('original SessionWorkspace retains owner authority and player ownership/pinned guards',()=>{
 const original=readFileSync(root,'utf8');
 for(const guarded of [
  "if (!isOwner) runAsHistoryActor(payload, () => playerMapLayerActionHandlerRef.current(payload));",
 ]){
  // Source-independent check below is intentionally used because player
  // dispatch is conditioned on isOwner (not !isOwner).
  assert.equal(original.includes(guarded),false);
 }
 assert.match(original,/if \(isOwner\) runAsHistoryActor\(message\?\.payload, \(\) => playerMapLayerActionHandlerRef\.current\(message\?\.payload\)\)/);
 assert.match(original,/!object\.pinned && \(actorProfileId === currentUserId \|\| \(!object\.locked && object\.createdByProfileId === actorProfileId\)\)/);
 assert.match(original,/!token\.locked &&\s*!token\.pinned &&\s*token\.createdByProfileId === payload\.actorProfileId/);
 assert.match(original,/!poi\.locked &&\s*!poi\.pinned/);
 assert.match(original,/!drawing\.locked && !drawing\.pinned/);
 assert.match(original,/Object\.keys\(update\)\.length === 1 && update\.pinned === false/);
 assert.match(original,/!\['forward', 'backward', 'front', 'back'\]\.includes\(payload\.move\)/);
});
test('original layer overlap functions reorder only requested selected object',()=>{
 const state=map(),families=[['drawing',state.mapDrawings],['token',state.mapTokens],['poi',state.mapPois]];
 const order=reconcileMapObjectOrder(state.mapObjectOrder,families);
 const ref={family:'drawing',id:'drawing-1'};
 const firstBounds=getRotatedRectBounds(state.mapDrawings[0],40,40,0);
 const secondBounds=getRotatedSquareBounds(state.mapTokens[0],40,0);
 assert.equal(doBoundsOverlap(firstBounds,secondBounds),true);
 const changed=moveMapObjectBlock(order,[ref],'forward',(a,b)=>{
  const bounds=({drawing:getRotatedRectBounds({x:0,y:0},40,40,0),
   token:getRotatedSquareBounds({x:0,y:0},40,0),poi:getRotatedSquareBounds({x:10,y:10},15,0)});
  return doBoundsOverlap(bounds[a.family],bounds[b.family]);
 });
 assert.notDeepEqual(changed,order);
 assert.deepEqual(changed.map(x=>x.family+':'+x.id).sort(),order.map(x=>x.family+':'+x.id).sort());
 const projected=project({...state,mapObjectOrder:changed});
 assert.equal(projected.mapObjectOrder.some(x=>x.id==='token-secret'),false);
 assert.deepEqual(projected.mapObjectOrder,filterMapObjectOrder(changed,[
  ...projected.mapDrawings.map(({id})=>({family:'drawing',id})),
  ...projected.mapTokens.map(({id})=>({family:'token',id})),
  ...projected.mapPois.map(({id})=>({family:'poi',id})),
 ]));
});
test('original movement, transform, locked and pinned data survive snapshot and revisioned delta',()=>{
 const before=map(),after=structuredClone(before);
 after.mapTokens[0]={...after.mapTokens[0],x:100,y:12,size:52,rotation:135,locked:true};
 after.mapDrawings[0]={...after.mapDrawings[0],x:40,y:55,width:80,height:30,rotation:90,pinned:true};
 after.mapPois[0]={...after.mapPois[0],x:80,y:90,size:22,rotation:270,locked:true};
 const result=projectOriginalMapDelta({event:'active_scene_map_patch',previousState:before,state:after});
 assert.deepEqual(result.payload.mapTokens[0],after.mapTokens[0]);
 assert.deepEqual(result.payload.mapDrawings[0],after.mapDrawings[0]);
 assert.deepEqual(result.payload.mapPois[0],{...after.mapPois[0],noteId:null});
 assert.equal(result.payload.mapTokens.some(t=>t.id==='token-secret'),false);
 assert.equal(result.payload.mapTokens.find(t=>t.id==='token-pinned').pinned,true);
 assert.equal(result.payload.mapDrawings.find(d=>d.id==='drawing-pinned').pinned,true);
 const beforeSnapshot=project(before);
 assert.deepEqual(projectOriginalMapDelta({event:'active_scene_map_patch',previousState:before,state:before}),null);
 assert.notDeepEqual(beforeSnapshot,result.payload);
});
test('GM-only changes do not affect player revision; transforms and layers do',()=>{
 const initial=map();
 const source=createArubaGmRevisionedCampaignSource({
  campaignId:campaign,gmUserId:owner,initialState:initial,
  applyGmEvent:({state,payload})=>({...state,...payload}),
  projectVisibleSnapshot:({state})=>project(state),
  projectVisibleEvent:projectOriginalMapDelta,
 });
 const handle=source.registerVerifiedPeer({peerId:peer,userId:player,verifiedCampaignId:campaign});
 assert.ok(handle);
 assert.equal(handle.revision,0);
 assert.equal(source.commit({authenticatedGmUserId:owner,event:'active_scene_map_patch',
  payload:{gmNoteOnly:'classified'}}),true);
 assert.equal(handle.revision,0);
 const tokens=structuredClone(initial.mapTokens);
 tokens[0].rotation=90;tokens[0].x=91;
 assert.equal(source.commit({authenticatedGmUserId:owner,event:'active_scene_map_patch',
  payload:{mapTokens:tokens}}),true);
 assert.equal(handle.revision,1);
 const reordered=moveMapObjectBlock(initial.mapObjectOrder,
  [{family:'poi',id:'poi-1'}],'front');
 assert.equal(source.commit({authenticatedGmUserId:owner,event:'active_scene_map_patch',
  payload:{mapObjectOrder:reordered}}),true);
 assert.equal(handle.revision,2);
 assert.deepEqual(handle.snapshot().payload.mapObjectOrder.at(-1),{family:'poi',id:'poi-1'});
 assert.equal(source.commit({authenticatedGmUserId:player,event:'active_scene_map_patch',
  payload:{mapTokens:[]}}),false);
 assert.equal(handle.revision,2);
 source.close();
});
