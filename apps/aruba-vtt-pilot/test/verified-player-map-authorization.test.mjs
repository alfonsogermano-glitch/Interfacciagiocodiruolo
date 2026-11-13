import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeVerifiedPlayerMapRequest as authorize} from '../src/ArubaVerifiedPlayerMapAuthorization.mjs';
import {createGmHostEventRouter} from '../src/ArubaGmHostEventRouter.mjs';
const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const outsider='00000000-0000-4000-8000-000000000004';
const chapter='chapter-1';
const state=()=>({
 mapTokens:[
  {id:'my-token',createdByProfileId:player,visible:true,locked:false,pinned:false},
  {id:'other-token',createdByProfileId:outsider,visible:true,locked:false,pinned:false},
  {id:'locked-token',createdByProfileId:player,locked:true},
  {id:'pinned-token',createdByProfileId:player,pinned:true},
  {id:'secret-token',createdByProfileId:gm,visible:false},
 ],
 mapPois:[
  {id:'my-poi',createdByProfileId:player,locked:false,pinned:false},
  {id:'other-poi',createdByProfileId:outsider,locked:false,pinned:false},
  {id:'locked-poi',createdByProfileId:player,locked:true},
  {id:'pinned-poi',createdByProfileId:player,pinned:true},
 ],
 mapDrawings:[
  {id:'my-drawing',createdByProfileId:player,locked:false,pinned:false},
  {id:'other-drawing',createdByProfileId:outsider,locked:false,pinned:false},
  {id:'pinned-drawing',createdByProfileId:player,pinned:true},
 ],
});
const verify=(event,payload,overrides={})=>authorize({
 authenticatedUserId:player,gmUserId:gm,verifiedCampaignId:campaign,
 campaignId:campaign,chapterId:chapter,state:state(),event,
 payload:{chapterId:chapter,actorProfileId:player,...payload},...overrides,
});
test('untrusted actor spoof and wrong campaign/chapter fail closed',()=>{
 const event='map_token_action',payload={action:'move',positions:{'my-token':{x:4,y:5}}};
 assert.equal(verify(event,{...payload,actorProfileId:gm}),null);
 assert.equal(verify(event,payload,{authenticatedUserId:gm}),null);
 assert.equal(verify(event,payload,{verifiedCampaignId:outsider}),null);
 assert.equal(verify(event,payload,{chapterId:'other'}),null);
 assert.equal(verify('active_scene_map_patch',payload),null);
 assert.equal(verify('map_history_action',payload),null);
});
test('movement allows unlocked unpinned token without ownership exactly as original GM handler',()=>{
 const p=verify('map_token_action',{action:'move',
  positions:{'other-token':{x:20,y:30}}});
 assert.deepEqual(p,{event:'map_token_action',actorProfileId:player,chapterId:chapter,
  action:'move',positions:{'other-token':{x:20,y:30}}});
 assert.equal(verify('map_token_action',{action:'move',positions:{'locked-token':{x:4,y:5}}}),null);
 assert.equal(verify('map_token_action',{action:'move',positions:{'pinned-token':{x:4,y:5}}}),null);
 assert.equal(verify('map_token_action',{action:'move',positions:{'secret-token':{x:4,y:5}}}),null);
 assert.equal(verify('map_token_action',{action:'move',positions:{'unknown':{x:4,y:5}}}),null);
 assert.equal(verify('map_token_action',{action:'move',positions:{'my-token':{x:Infinity,y:2}}}),null);
});
test('transform, edit, layer control requires verified creator of every token',()=>{
 const trans=verify('map_token_action',{action:'transform',tokenIds:['my-token'],
  updates:{'my-token':{x:10,y:12,size:50,rotation:90,visible:false}}});
 assert.deepEqual(trans.updates,{'my-token':{x:10,y:12,size:50,rotation:90}});
 assert.equal(verify('map_token_action',{action:'transform',tokenIds:['other-token'],
  updates:{'other-token':{x:10,y:12,size:50,rotation:90}}}),null);
 assert.equal(verify('map_token_action',{action:'transform',tokenIds:['my-token'],
  updates:{'my-token':{x:10,y:12,size:-1,rotation:90}}}),null);
 assert.equal(verify('map_token_action',{action:'update',tokenIds:['my-token'],
  update:{visible:false}}),null);
 assert.deepEqual(verify('map_token_action',{action:'update',tokenIds:['my-token'],
  update:{light:{enabled:true,radius:5}}}).update,{light:{enabled:true,radius:5}});
 assert.equal(verify('map_token_action',{action:'layer',tokenIds:['my-token','pinned-token'],
  move:'front'}),null);
 assert.equal(verify('map_token_action',{action:'layer',tokenIds:['my-token'],
  move:'top-secret-command'}),null);
 assert.equal(verify('map_token_action',{action:'delete',tokenIds:['my-token']}),null);
});
test('POI move is unlocked/unpinned; privileged updates require verified owner',()=>{
 assert.equal(verify('map_poi_action',{action:'move',poiId:'other-poi',
  position:{x:2,y:3}}).position.x,2);
 assert.equal(verify('map_poi_action',{action:'move',poiId:'locked-poi',
  position:{x:2,y:3}}),null);
 assert.equal(verify('map_poi_action',{action:'move',poiId:'pinned-poi',
  position:{x:2,y:3}}),null);
 assert.equal(verify('map_poi_action',{action:'update',poiId:'other-poi',
  update:{label:'Forged'}}),null);
 assert.deepEqual(verify('map_poi_action',{action:'update',poiId:'my-poi',
  update:{rotation:90,size:22}}).update,{rotation:90,size:22});
 assert.equal(verify('map_poi_action',{action:'update',poiId:'my-poi',
  update:{pinned:false}}),null);
});
test('layer movement only permits controlled existing refs, all or nothing',()=>{
 const allowed=verify('map_object_layer_action',{refs:[
  {family:'drawing',id:'my-drawing'},
  {family:'token',id:'my-token'},
 ],move:'forward'});
 assert.deepEqual(allowed.refs,[
  {family:'drawing',id:'my-drawing'},{family:'token',id:'my-token'},
 ]);
 assert.equal(verify('map_object_layer_action',{refs:[
  {family:'drawing',id:'my-drawing'},{family:'poi',id:'other-poi'},
 ],move:'front'}),null);
 assert.equal(verify('map_object_layer_action',{refs:[
  {family:'drawing',id:'pinned-drawing'},
 ],move:'front'}),null);
 assert.equal(verify('map_object_layer_action',{refs:[
  {family:'drawing',id:'my-drawing'},{family:'drawing',id:'my-drawing'},
 ],move:'front'}),null);
 assert.equal(verify('map_object_layer_action',{refs:[
  {family:'nonexistent',id:'my-drawing'},
 ],move:'front'}),null);
});
test('normalization strips extra positional fields and cannot mutate GM state',()=>{
 const current=state();
 const result=verify('map_token_action',{action:'move',
  positions:{'my-token':{x:7,y:8,magic:'hack'}}},{state:current});
 assert.deepEqual(result.positions,{'my-token':{x:7,y:8}});
 result.positions['my-token'].x=999;
 assert.equal(current.mapTokens[0].x,undefined);
});

test('real GM-authoritative router rejects spoof and delivers only verified player action',()=>{
 const observed=[];
 const current=state();
 const route=createGmHostEventRouter({
  campaignId:campaign,gmUserId:gm,
  authorizePlayerEvent:({userId,event,payload})=>!!authorize({
   authenticatedUserId:userId,gmUserId:gm,campaignId:campaign,
   verifiedCampaignId:campaign,chapterId:chapter,state:current,event,payload,
  }),
 });
 const host=route.openVerifiedHost({authenticatedUserId:gm,
  receiveFromPlayer:message=>{
   const normalized=authorize({
    authenticatedUserId:message.fromUserId,gmUserId:gm,campaignId:campaign,
    verifiedCampaignId:campaign,chapterId:chapter,state:current,
    event:message.event,payload:message.payload,
   });
   if(normalized)observed.push(normalized);
  }});
 assert.ok(host);
 const connection=route.attachVerifiedPlayer({peerId:'peer-verified',
  authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 assert.ok(connection);
 assert.equal(connection.publish('map_token_action',{
  chapterId:chapter,actorProfileId:gm,action:'move',
  positions:{'my-token':{x:4,y:5}},
 }),false);
 assert.equal(connection.publish('map_token_action',{
  chapterId:chapter,action:'move',
  positions:{'my-token':{x:4,y:5}},
 }),true);
 assert.equal(connection.publish('map_object_layer_action',{
  chapterId:chapter,refs:[{family:'token',id:'my-token'}],move:'front',
 }),true); // explicitly approved by GM-side verified player policy
 assert.equal(connection.publish('map_object_layer_action',{
  chapterId:chapter,refs:[{family:'token',id:'locked-token'}],move:'front',
 }),false);
 assert.equal(connection.publish('map_object_layer_action',{
  chapterId:chapter,actorProfileId:outsider,
  refs:[{family:'token',id:'my-token'}],move:'back',
 }),false);
 assert.equal(connection.publish('map_poi_action',{
  chapterId:chapter,action:'update',poiId:'other-poi',
  update:{noteVisibleToPlayers:true},
 }),false);
 assert.deepEqual(observed,[{
  event:'map_token_action',actorProfileId:player,chapterId:chapter,
  action:'move',positions:{'my-token':{x:4,y:5}},
 },{
  event:'map_object_layer_action',actorProfileId:player,chapterId:chapter,
  refs:[{family:'token',id:'my-token'}],move:'front',
 }]);
 connection.disconnect();
 assert.equal(connection.publish('map_token_action',{
  chapterId:chapter,action:'move',positions:{'my-token':{x:7,y:8}},
 }),false);
 assert.equal(observed.length,1);
 host.disconnect();
});

test('layer requests remain fail-closed for default router and broad policies cannot elevate GM events',()=>{
 const observed=[];
 const closed=createGmHostEventRouter({campaignId:campaign,gmUserId:gm});
 closed.openVerifiedHost({authenticatedUserId:gm,receiveFromPlayer:f=>observed.push(f)});
 const denied=closed.attachVerifiedPlayer({peerId:'denied-layer',
  authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 assert.equal(denied.publish('map_object_layer_action',{
  chapterId:chapter,refs:[{family:'token',id:'my-token'}],move:'front',
 }),false);
 assert.deepEqual(observed,[]);
 const broad=createGmHostEventRouter({campaignId:campaign,gmUserId:gm,
  authorizePlayerEvent:()=>true});
 broad.openVerifiedHost({authenticatedUserId:gm,receiveFromPlayer:f=>observed.push(f)});
 const peer=broad.attachVerifiedPlayer({peerId:'broad-layer',
  authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 for(const event of ['active_scene_change','active_scene_map_patch','notes_change',
   'map_history_action','map_object_drag_preview']){
  assert.equal(peer.publish(event,{chapterId:chapter}),false);
 }
 assert.equal(peer.publish('map_object_layer_action',{
  refs:[{family:'token',id:'my-token'}],move:'front',
 }),true);
 assert.deepEqual(observed.map(f=>f.event),['map_object_layer_action']);
 peer.disconnect();
 assert.equal(peer.publish('map_object_layer_action',{refs:[],move:'back'}),false);
 closed.close();broad.close();
});
