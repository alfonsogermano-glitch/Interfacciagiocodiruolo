import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaGmRevisionedCampaignSource} from '../src/ArubaGmRevisionedCampaignSource.mjs';
import {createArubaVerifiedGmMapDispatch} from '../src/ArubaVerifiedGmMapDispatch.mjs';
import {createArubaVerifiedRevisionConfirmation} from '../src/ArubaVerifiedRevisionConfirmation.mjs';
import {createArubaObservedGmMapCommandCoordinator} from '../src/ArubaObservedGmMapCommandCoordinator.mjs';
import {projectOriginalMapForPlayer,projectOriginalMapDelta} from '../src/ArubaOriginalMapRevisionProjection.mjs';
const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const peerId='00000000-0000-4000-8000-000000000004';
const req='00000000-0000-4000-8000-000000000005';
const req2='00000000-0000-4000-8000-000000000006';
function setup(){
 const state={mapTokens:[
  {id:'mine',createdByProfileId:player,visible:true,locked:false,pinned:false,x:0,y:0},
  {id:'private',createdByProfileId:gm,visible:false,x:20,y:30},
 ],mapPois:[],mapDrawings:[],mapFog:[],mapObjectOrder:[
  {family:'token',id:'mine'},{family:'token',id:'private'},
 ]};
 const members=new Set([player]),sent=[],handled=[];
 let chapterId='chapter-1';
 const source=createArubaGmRevisionedCampaignSource({
  campaignId:campaign,gmUserId:gm,initialState:structuredClone(state),
  applyGmEvent:()=>{throw Error('Should never use second reducer');},
  projectVisibleSnapshot:({state})=>projectOriginalMapForPlayer(state),
  projectVisibleEvent:projectOriginalMapDelta,
 });
 const session=source.registerVerifiedPeer({peerId,userId:player,verifiedCampaignId:campaign});
 const tracker=createArubaVerifiedRevisionConfirmation({
  campaignId:campaign,gmUserId:gm,
  isVerifiedMember:({userId})=>members.has(userId),
  getPublishedRevision:()=>session.revision,
  sendVerifiedResult:result=>sent.push(result),
 });
 const context=()=>({chapterId,state});
 const dispatcher=createArubaVerifiedGmMapDispatch({
  campaignId:campaign,gmUserId:gm,
  getCurrentMapContext:context,
  isVerifiedMember:({userId})=>members.has(userId),
  onTokenAction:cmd=>{
   handled.push(cmd);
   if(cmd.action==='move'){
    for(const [id,position] of Object.entries(cmd.positions))
     Object.assign(state.mapTokens.find(t=>t.id===id),position);
   }
  },
  onPoiAction:()=>{},onLayerAction:()=>{},
 });
 const coordinator=createArubaObservedGmMapCommandCoordinator({
  campaignId:campaign,gmUserId:gm,dispatcher,source,tracker,
  getCurrentMapContext:context,
  getVerifiedPlayerPeer:({userId})=>members.has(userId)
   ?{peerId,revision:session.revision}:null,
  isVerifiedMember:({userId})=>members.has(userId),
  sendVerifiedResult:result=>sent.push(result),
 });
 const frame=(requestId=req,positions={mine:{x:9,y:11}})=>({
  campaignId:campaign,fromUserId:player,event:'map_token_action',
  payload:{chapterId:'chapter-1',requestId,action:'move',positions},
 });
 const close=()=>{coordinator.close();tracker.close();source.close();};
 return {state,members,sent,handled,source,session,tracker,dispatcher,
  coordinator,frame,close,changeChapter:v=>{chapterId=v;}};
}
test('one original handler invocation publishes one player-visible revision',()=>{
 const x=setup();
 assert.equal(x.coordinator.receiveFromPlayer(x.frame()),true);
 assert.equal(x.handled.length,1);
 assert.equal(x.session.revision,1);
 assert.equal(x.session.snapshot().payload.mapTokens[0].x,9);
 assert.equal(x.session.snapshot().payload.mapTokens.length,1);
 assert.equal(x.tracker.pendingCount,1);
 assert.equal(x.sent.at(-1).result.outcome,'dispatched');
 assert.equal(x.tracker.acknowledge({
  authenticatedUserId:player,verifiedCampaignId:campaign,peerId,revision:1,
 }),true);
 assert.equal(x.sent.at(-1).result.outcome,'received-revision');
 assert.equal(x.sent.at(-1).result.requestId,req);
 x.close();
});
test('replayed command cannot mutate twice or create another revision',()=>{
 const x=setup();
 assert.equal(x.coordinator.receiveFromPlayer(x.frame()),true);
 assert.equal(x.coordinator.receiveFromPlayer(x.frame()),true);
 assert.equal(x.handled.length,1);
 assert.equal(x.session.revision,1);
 assert.equal(x.tracker.pendingCount,1);
 assert.equal(x.coordinator.receiveFromPlayer(x.frame(req,{mine:{x:99,y:99}})),false);
 assert.equal(x.session.snapshot().payload.mapTokens[0].x,9);
 x.close();
});
test('private-only updates have no visible revision and no receipt expectation',()=>{
 const x=setup();
 // Simulate a GM operation on a visible token which ends at its existing
 // position. Original handler executes, but player-visible projection equals
 // the previous state and hence must NOT receive a revision/confirmation.
 assert.equal(x.coordinator.receiveFromPlayer(x.frame(req,{mine:{x:0,y:0}})),true);
 assert.equal(x.handled.length,1);
 assert.equal(x.session.revision,0);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(x.sent.at(-1).result.outcome,'dispatched');
 x.close();
});
test('locked objects and chapter changes never reach the original handler',()=>{
 const x=setup();
 x.state.mapTokens[0].locked=true;
 assert.equal(x.coordinator.receiveFromPlayer(x.frame()),false);
 assert.equal(x.handled.length,0);
 assert.equal(x.session.revision,0);
 x.state.mapTokens[0].locked=false;
 x.changeChapter('chapter-2');
 assert.equal(x.coordinator.receiveFromPlayer(x.frame(req2)),false);
 assert.equal(x.handled.length,0);
 x.close();
});
test('revocation blocks further dispatch and prevents revision acknowledgment',()=>{
 const x=setup();
 assert.equal(x.coordinator.receiveFromPlayer(x.frame()),true);
 x.members.delete(player);
 assert.equal(x.coordinator.receiveFromPlayer(x.frame(req2)),false);
 assert.equal(x.tracker.acknowledge({
  authenticatedUserId:player,verifiedCampaignId:campaign,peerId,revision:1,
 }),false);
 assert.equal(x.sent.some(m=>m.result.outcome==='received-revision'),false);
 x.close();
});
test('state source publication from trusted original handler never runs separate test reducer',()=>{
 const x=setup();
 assert.equal(x.coordinator.receiveFromPlayer(x.frame()),true);
 const next=structuredClone(x.state);
 next.mapTokens[1].x=900;
 assert.equal(x.source.publishObservedMap({
  authenticatedGmUserId:player,nextState:next,
 }),false);
 assert.equal(x.source.publishObservedMap({
  authenticatedGmUserId:gm,nextState:next,
 }),true);
 assert.equal(x.session.revision,1);
 assert.equal(x.session.snapshot().payload.mapTokens.length,1);
 x.close();
});

test('publishing an already-applied command fails closed and requires verified resnapshot',()=>{
 const x=setup();
 let calls=0;
 const brokenSource={
  publishObservedMap:()=>{calls++;return false;},
  resetFromObservedMap:args=>x.source.resetFromObservedMap(args),
 };
 const notices=[];
 const recovering=createArubaObservedGmMapCommandCoordinator({
  campaignId:campaign,gmUserId:gm,dispatcher:x.dispatcher,
  source:brokenSource,tracker:x.tracker,
  getCurrentMapContext:()=>({chapterId:'chapter-1',state:x.state}),
  getVerifiedPlayerPeer:()=>({peerId,revision:x.session.revision}),
  isVerifiedMember:({userId})=>x.members.has(userId),
  sendVerifiedResult:x=>x.sent.push(x),
  onResyncRequired:notice=>notices.push(notice),
 });
 assert.equal(recovering.receiveFromPlayer(x.frame()),false);
 assert.equal(x.handled.length,1);
 assert.equal(x.state.mapTokens[0].x,9);
 assert.equal(x.session.revision,0);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(recovering.suspended,true);
 assert.equal(calls,1);
 assert.equal(recovering.receiveFromPlayer(x.frame(req2,{mine:{x:17,y:18}})),false);
 assert.equal(x.handled.length,1);
 assert.equal(notices.length,1);
 assert.equal(recovering.recoverAfterVerifiedResnapshot({
  authenticatedGmUserId:player,nextState:x.state,
 }),false);
 assert.equal(recovering.recoverAfterVerifiedResnapshot({
  authenticatedGmUserId:gm,nextState:{bad:'missing original map'},
 }),false);
 assert.equal(recovering.suspended,true);
 assert.equal(recovering.recoverAfterVerifiedResnapshot({
  authenticatedGmUserId:gm,nextState:structuredClone(x.state),
 }),true);
 assert.equal(recovering.suspended,false);
 assert.equal(x.source.peerCount,0);
 assert.equal(x.session.revision,null);
 recovering.close();x.close();
});
test('source recovery revokes old sessions and restarts new peer at revision zero',()=>{
 const x=setup();
 assert.equal(x.coordinator.receiveFromPlayer(x.frame()),true);
 assert.equal(x.session.revision,1);
 const old=x.session;
 const recovered=structuredClone(x.state);
 recovered.mapTokens[0].x=45;
 assert.equal(x.source.resetFromObservedMap({
  authenticatedGmUserId:player,nextState:recovered,
 }),false);
 assert.equal(x.source.peerCount,1);
 assert.equal(x.source.resetFromObservedMap({
  authenticatedGmUserId:gm,nextState:{invalid:true},
 }),false);
 assert.equal(x.source.peerCount,1);
 assert.equal(x.source.resetFromObservedMap({
  authenticatedGmUserId:gm,nextState:recovered,
 }),true);
 assert.equal(old.revision,null);
 assert.throws(()=>old.snapshot(),/Revoked peer/);
 const latest=x.source.registerVerifiedPeer({
  peerId,userId:player,verifiedCampaignId:campaign,
 });
 assert.equal(latest.revision,0);
 assert.equal(latest.snapshot().payload.mapTokens[0].x,45);
 assert.equal(latest.snapshot().payload.mapTokens.length,1);
 latest.close();x.close();
});
