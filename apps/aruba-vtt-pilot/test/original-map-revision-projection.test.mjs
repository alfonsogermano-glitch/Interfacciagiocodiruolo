import test from 'node:test';
import assert from 'node:assert/strict';
import {
 projectOriginalMapForPlayer,projectOriginalMapDelta,
} from '../src/ArubaOriginalMapRevisionProjection.mjs';
import {createArubaGmRevisionedCampaignSource}
 from '../src/ArubaGmRevisionedCampaignSource.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const peer='00000000-0000-4000-8000-000000000004';
const original=()=>({
 mapTokens:[
  {id:'token-public',visible:true,hiddenFromPlayers:true,entityId:'secret-source'},
  {id:'token-private',visible:false,entityId:'private'},
 ],
 mapDrawings:[
  {id:'drawing-public',visible:true},
  {id:'drawing-private',visible:false,text:{content:'GM BLACKBOARD'}},
 ],
 mapPois:[
  {id:'poi-hidden',visibleToPlayers:false,noteId:'note-secret',noteVisibleToPlayers:false},
  {id:'poi-public',visibleToPlayers:true,noteId:'note-secret',noteVisibleToPlayers:false},
  {id:'poi-note-public',visibleToPlayers:true,noteId:'note-share',noteVisibleToPlayers:true},
 ],
 mapObjectOrder:[
  {family:'poi',id:'poi-hidden'},
  {family:'token',id:'token-private'},
  {family:'drawing',id:'drawing-private'},
  {family:'token',id:'token-public'},
  {family:'poi',id:'poi-public'},
  {family:'poi',id:'poi-note-public'},
  {family:'drawing',id:'drawing-public'},
 ],
 gmNotes:{text:'DO NOT SEND'},
});
test('reuses original token visibility rather than source sheet privacy',()=>{
 const projected=projectOriginalMapForPlayer(original());
 assert.deepEqual(projected.mapTokens.map(x=>x.id),['token-public']);
 assert.equal(projected.mapTokens[0].hiddenFromPlayers,true);
 assert.equal(projected.mapTokens.some(x=>x.id==='token-private'),false);
});
test('original POI projection hides note link separately from the visible marker',()=>{
 const projected=projectOriginalMapForPlayer(original());
 assert.deepEqual(projected.mapPois.map(p=>[p.id,p.noteId]),[
  ['poi-public',null],['poi-note-public','note-share'],
 ]);
 assert.equal(projected.mapDrawings.some(x=>x.id==='drawing-private'),false);
 assert.doesNotMatch(JSON.stringify(projected),/GM BLACKBOARD|DO NOT SEND|note-secret/);
});
test('original layer ordering has no hidden object identifiers',()=>{
 const projected=projectOriginalMapForPlayer(original());
 assert.deepEqual(projected.mapObjectOrder,[
  {family:'token',id:'token-public'},
  {family:'poi',id:'poi-public'},
  {family:'poi',id:'poi-note-public'},
  {family:'drawing',id:'drawing-public'},
 ]);
});
test('private-only map changes produce no revisioned delta',()=>{
 const prev=original(),next=original();
 next.mapTokens[1].x=123;
 next.mapDrawings[1].visible=false;
 next.gmNotes.text='MORE PRIVATE';
 assert.equal(projectOriginalMapDelta({event:'active_scene_map_patch',previousState:prev,state:next}),null);
});
test('revealing token or note changes projection and preserves legacy event name',()=>{
 const prev=original(),next=original();
 next.mapTokens[1].visible=true;
 next.mapPois[1].noteVisibleToPlayers=true;
 const delta=projectOriginalMapDelta({
  event:'active_scene_map_patch',previousState:prev,state:next,
 });
 assert.equal(delta.event,'active_scene_map_patch');
 assert.equal(delta.payload.mapTokens.length,2);
 assert.equal(delta.payload.mapPois[0].noteId,'note-secret');
 assert.equal(projectOriginalMapDelta({
  event:'notes_change',previousState:prev,state:next,
 }),null);
});
test('missing or malformed map data fails closed',()=>{
 assert.throws(()=>projectOriginalMapForPlayer({mapTokens:[],mapDrawings:[]}));
 assert.throws(()=>projectOriginalMapForPlayer({
  mapTokens:[{id:null}],mapDrawings:[],mapPois:[],
 }));
});
test('GM source uses original visibility for snapshots, deltas and per-player revision count',async()=>{
 const source=createArubaGmRevisionedCampaignSource({
  campaignId:campaign,gmUserId:gm,initialState:original(),
  applyGmEvent:({state,payload})=>({
   ...state,
   ...payload,
  }),
  projectVisibleSnapshot:({state})=>projectOriginalMapForPlayer(state),
  projectVisibleEvent:projectOriginalMapDelta,
 });
 const session=source.registerVerifiedPeer({
  peerId:peer,userId:player,verifiedCampaignId:campaign,
 });
 assert.equal(session.revision,0);
 const first=session.snapshot();
 assert.equal(first.payload.mapTokens.length,1);
 assert.equal(first.payload.mapPois[0].noteId,null);
 assert.equal(source.commit({
  authenticatedGmUserId:gm,event:'active_scene_map_patch',
  payload:{gmNotes:{text:'private change'}},
 }),true);
 assert.equal(session.revision,0);
 const nextMap=original();
 nextMap.mapTokens[1].visible=true;
 assert.equal(source.commit({
  authenticatedGmUserId:gm,event:'active_scene_map_patch',
  payload:{mapTokens:nextMap.mapTokens},
 }),true);
 assert.equal(session.revision,1);
 assert.equal(session.snapshot().payload.mapTokens.length,2);
 source.close();
});
