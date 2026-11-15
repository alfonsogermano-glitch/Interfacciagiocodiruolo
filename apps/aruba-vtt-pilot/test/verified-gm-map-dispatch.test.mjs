import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaVerifiedGmMapDispatch} from '../src/ArubaVerifiedGmMapDispatch.mjs';
import {createGmHostEventRouter} from '../src/ArubaGmHostEventRouter.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const stranger='00000000-0000-4000-8000-000000000004';
const chapter='chapter-one';
const make=()=>{
 const members=new Set([player]),events=[];
 let activeChapter=chapter;
 const state={
  mapTokens:[
   {id:'mine',visible:true,createdByProfileId:player,x:0,y:0,locked:false,pinned:false},
   {id:'their-token',visible:true,createdByProfileId:stranger,x:0,y:0,locked:false,pinned:false},
   {id:'locked',visible:true,createdByProfileId:player,locked:true,pinned:false},
  ],
  mapPois:[{id:'poi',visibleToPlayers:true,createdByProfileId:player,locked:false,pinned:false}],
  mapDrawings:[{id:'draw',visible:true,createdByProfileId:player,locked:false,pinned:false}],
 };
 const errors=[];
 const dispatch=createArubaVerifiedGmMapDispatch({
  campaignId:campaign,gmUserId:gm,
  getCurrentMapContext:()=>({chapterId:activeChapter,state}),
  isVerifiedMember:({userId})=>members.has(userId),
  onTokenAction:payload=>{
   events.push({event:'token',payload});
   if(payload.action==='move'){
    for(const [id,pos] of Object.entries(payload.positions))
     Object.assign(state.mapTokens.find(t=>t.id===id),pos);
   }
  },
  onPoiAction:payload=>{events.push({event:'poi',payload});},
  onLayerAction:payload=>{events.push({event:'layer',payload});},
  onError:error=>errors.push(error.message),
 });
 const frame=(event,payload={})=>({
  campaignId:campaign,fromUserId:player,event,
  payload:{chapterId:chapter,...payload},
 });
 return {dispatch,state,members,events,errors,frame,
  changeChapter:value=>{activeChapter=value;}};
};

test('revalidates current GM state and membership after router authorization preflight',()=>{
 const x=make();
 const req=x.frame('map_token_action',{action:'move',positions:{mine:{x:10,y:12}}});
 assert.equal(x.dispatch.authorizePlayerEvent({campaignId:campaign,
  userId:player,event:req.event,payload:req.payload}),true);
 x.state.mapTokens[0].locked=true;
 assert.equal(x.dispatch.receiveFromPlayer(req),false);
 assert.deepEqual(x.events,[]);
 assert.equal(x.state.mapTokens[0].x,0);
 x.state.mapTokens[0].locked=false;
 assert.equal(x.dispatch.receiveFromPlayer(req),true);
 assert.deepEqual([x.state.mapTokens[0].x,x.state.mapTokens[0].y],[10,12]);
 x.members.delete(player);
 assert.equal(x.dispatch.receiveFromPlayer(req),false);
 assert.equal(x.events.length,1);
});
test('chapter switch, claimed user identity, campaign mismatch and GM publications are rejected',()=>{
 const x=make();
 const req=x.frame('map_token_action',{action:'move',positions:{mine:{x:1,y:2}}});
 assert.equal(x.dispatch.receiveFromPlayer({...req,fromUserId:gm}),false);
 assert.equal(x.dispatch.receiveFromPlayer({...req,fromUserId:stranger}),false);
 assert.equal(x.dispatch.receiveFromPlayer({...req,campaignId:stranger}),false);
 assert.equal(x.dispatch.receiveFromPlayer({...req,
  payload:{...req.payload,actorProfileId:gm}}),false);
 assert.equal(x.dispatch.receiveFromPlayer({...req,event:'active_scene_map_patch'}),false);
 x.changeChapter('chapter-two');
 assert.equal(x.dispatch.receiveFromPlayer(req),false);
 assert.deepEqual(x.events,[]);
});
test('routes only approved normalized token/POI/layer commands into original GM handler slots',()=>{
 const x=make();
 const token=x.frame('map_token_action',{action:'move',
  positions:{mine:{x:4,y:5,clientOverride:'not-allowed'}}});
 const poi=x.frame('map_poi_action',{action:'update',poiId:'poi',
  update:{label:'Marker'}});
 const layer=x.frame('map_object_layer_action',{refs:[{family:'drawing',id:'draw'}],move:'front'});
 assert.equal(x.dispatch.receiveFromPlayer(token),true);
 assert.equal(x.dispatch.receiveFromPlayer(poi),true);
 assert.equal(x.dispatch.receiveFromPlayer(layer),true);
 assert.deepEqual(x.events,[
  {event:'token',payload:{actorProfileId:player,chapterId:chapter,
   action:'move',positions:{mine:{x:4,y:5}}}},
  {event:'poi',payload:{actorProfileId:player,chapterId:chapter,
   action:'update',poiId:'poi',update:{label:'Marker'}}},
  {event:'layer',payload:{actorProfileId:player,chapterId:chapter,
   refs:[{family:'drawing',id:'draw'}],move:'front'}},
 ]);
});
test('router and current-state bridge refuse revoked, locked and spoofed player commands',()=>{
 const x=make();
 const router=createGmHostEventRouter({campaignId:campaign,gmUserId:gm,
  authorizePlayerEvent:x.dispatch.authorizePlayerEvent});
 const host=router.openVerifiedHost({authenticatedUserId:gm,
  receiveFromPlayer:x.dispatch.receiveFromPlayer});
 assert.ok(host);
 const peer=router.attachVerifiedPlayer({peerId:'verified-1',
  authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 assert.equal(peer.publish('map_token_action',{chapterId:chapter,
  action:'move',positions:{mine:{x:7,y:8}}}),true);
 assert.equal(x.state.mapTokens[0].x,7);
 assert.equal(peer.publish('map_object_layer_action',{chapterId:chapter,
  refs:[{family:'drawing',id:'draw'}],move:'front'}),true);
 assert.equal(x.events.length,2);
 x.state.mapTokens[0].pinned=true;
 assert.equal(peer.publish('map_token_action',{chapterId:chapter,
  action:'move',positions:{mine:{x:99,y:99}}}),false);
 assert.equal(peer.publish('map_token_action',{chapterId:chapter,
  actorProfileId:gm,action:'move',positions:{mine:{x:99,y:99}}}),false);
 assert.equal(peer.publish('active_scene_map_patch',{scene:'forged'}),false);
 x.members.delete(player);
 assert.equal(peer.publish('map_object_layer_action',{chapterId:chapter,
  refs:[{family:'drawing',id:'draw'}],move:'back'}),false);
 assert.equal(x.events.length,2);
 host.disconnect();
});
test('GM handler exceptions fail closed with no subsequent false acknowledgements',()=>{
 const errors=[];
 const x=createArubaVerifiedGmMapDispatch({
  campaignId:campaign,gmUserId:gm,
  getCurrentMapContext:()=>({chapterId:chapter,state:make().state}),
  isVerifiedMember:()=>true,
  onTokenAction:()=>{throw Error('handler failed');},
  onPoiAction:()=>{},onLayerAction:()=>{},
  onError:e=>errors.push(e.message),
 });
 assert.equal(x.receiveFromPlayer({campaignId:campaign,fromUserId:player,
  event:'map_token_action',payload:{chapterId:chapter,action:'move',
   positions:{mine:{x:1,y:1}}}}),false);
 assert.deepEqual(errors,['handler failed']);
});
test('original handler cannot recursively dispatch another command inside incomplete mutation',()=>{
 let bridge;
 const seen=[];
 const context=make();
 bridge=createArubaVerifiedGmMapDispatch({
  campaignId:campaign,gmUserId:gm,
  getCurrentMapContext:()=>({chapterId:chapter,state:context.state}),
  isVerifiedMember:()=>true,
  onTokenAction:()=>{
   seen.push('outer');
   assert.equal(bridge.receiveFromPlayer(context.frame('map_poi_action',{
    action:'move',poiId:'poi',position:{x:8,y:9}})),false);
  },
  onPoiAction:()=>seen.push('nested'),onLayerAction:()=>{},
 });
 assert.equal(bridge.receiveFromPlayer(context.frame('map_token_action',{
  action:'move',positions:{mine:{x:1,y:2}}})),true);
 assert.deepEqual(seen,['outer']);
 bridge.close();
 assert.equal(bridge.receiveFromPlayer(context.frame('map_token_action',{
  action:'move',positions:{mine:{x:4,y:5}}})),false);
});
test('fail-closed on missing trusted handlers and failed membership or state callbacks',()=>{
 const x=make();
 assert.throws(()=>createArubaVerifiedGmMapDispatch({
  campaignId:campaign,gmUserId:gm,
  getCurrentMapContext:()=>({chapterId:chapter,state:x.state}),
  isVerifiedMember:()=>true,onTokenAction:()=>{},onPoiAction:()=>{},
 }),/original handlers required/);
 const errors=[];
 const bridge=createArubaVerifiedGmMapDispatch({
  campaignId:campaign,gmUserId:gm,
  getCurrentMapContext:()=>{throw Error('not ready');},
  isVerifiedMember:()=>true,
  onTokenAction:()=>{},onPoiAction:()=>{},onLayerAction:()=>{},
  onError:e=>errors.push(e.message),
 });
 assert.equal(bridge.receiveFromPlayer(x.frame('map_token_action',{
  action:'move',positions:{mine:{x:3,y:4}}})),false);
 assert.deepEqual(errors,['not ready']);
});
