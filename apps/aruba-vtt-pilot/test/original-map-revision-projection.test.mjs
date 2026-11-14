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

test('original fog cover/reveal, persistence, explored holes and blockers survive unchanged',()=>{
 const state=original();
 state.mapFog=[{
  id:'fog-a',kind:'polygon',operation:'cover',
  persistence:'semi-persistent',opacity:0.4,
  rings:[[{x:0,y:0},{x:5,y:0},{x:5,y:5},{x:0,y:5}],
    [{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:1,y:2}]],
  exploredAreas:[[[{x:0,y:0},{x:3,y:3},{x:0,y:3}]]],
  lightExploredAreas:[[[{x:0,y:0},{x:2,y:2},{x:0,y:2}]]],
  visionBlocker:{kind:'door',confidence:1,source:'manual'},
  enabled:true,fullMap:false,
 }];
 const projected=projectOriginalMapForPlayer(state);
 assert.deepEqual(projected.mapFog,state.mapFog);
 projected.mapFog[0].exploredAreas[0][0][0].x=987;
 assert.equal(state.mapFog[0].exploredAreas[0][0][0].x,0);
});
test('fog exploration and cover edits consume a visible revision, not other private edits',()=>{
 const before=original(),after=original();
 before.mapFog=[{id:'fog-1',kind:'rectangle',operation:'cover',opacity:1,
  persistence:'permanent',exploredAreas:[]}];
 after.mapFog=structuredClone(before.mapFog);
 after.mapFog[0].exploredAreas=[[[{x:0,y:0},{x:1,y:0},{x:1,y:1}]]];
 const revision=projectOriginalMapDelta({event:'active_scene_map_patch',
  previousState:before,state:after});
 assert.equal(revision.event,'active_scene_map_patch');
 assert.deepEqual(revision.payload.mapFog,after.mapFog);
 const privateEdit=structuredClone(after);
 privateEdit.gmNotes.text='hidden';
 assert.equal(projectOriginalMapDelta({event:'active_scene_map_patch',
  previousState:after,state:privateEdit}),null);
});
test('original light and vision sources on public tokens and POIs survive exactly',()=>{
 const state=original();
 state.mapTokens[0].light={enabled:true,radius:12,shape:'cone',coneAngle:50,
  coneDirection:125,outlineVisible:true,effect:'flicker',flickerPreset:'torch'};
 state.mapTokens[0].vision={enabled:true,radius:20,shape:'circle'};
 state.mapTokens[1].light={enabled:true,radius:999,shape:'circle'};
 state.mapPois[1].light={enabled:true,radius:7,shape:'cone',
  coneAngle:40,coneDirection:92};
 state.mapPois[1].vision={enabled:true,radius:8,shape:'circle'};
 state.mapPois[0].light={enabled:true,radius:9999};
 const projected=projectOriginalMapForPlayer(state);
 assert.deepEqual(projected.mapTokens[0].light,state.mapTokens[0].light);
 assert.deepEqual(projected.mapTokens[0].vision,state.mapTokens[0].vision);
 assert.deepEqual(projected.mapPois[0].light,state.mapPois[1].light);
 assert.deepEqual(projected.mapPois[0].vision,state.mapPois[1].vision);
 assert.doesNotMatch(JSON.stringify(projected),/9999|999/);
 const changed=structuredClone(state);
 changed.mapTokens[0].light.radius=16;
 const delta=projectOriginalMapDelta({event:'active_scene_map_patch',
  previousState:state,state:changed});
 assert.equal(delta.payload.mapTokens[0].light.radius,16);
});
test('invalid fog objects fail closed instead of emitting a partially visible scene',()=>{
 const state=original();
 state.mapFog=[{id:null,operation:'cover'}];
 assert.throws(()=>projectOriginalMapForPlayer(state),/Invalid original map object/);
 state.mapFog={invalid:true};
 assert.throws(()=>projectOriginalMapForPlayer(state),/Original GM map arrays/);
});
