import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaSettledMapRequestCorrelator} from '../src/ArubaSettledMapRequestCorrelator.mjs';
import {createArubaGmRevisionedCampaignSource} from '../src/ArubaGmRevisionedCampaignSource.mjs';
import {createArubaVerifiedRevisionConfirmation} from '../src/ArubaVerifiedRevisionConfirmation.mjs';
import {notifyCommittedMapPublication} from '../../../src/app/components/session/activeScenePublicationObserver.ts';
import {projectOriginalMapForPlayer,projectOriginalMapDelta} from '../src/ArubaOriginalMapRevisionProjection.mjs';
const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const user='00000000-0000-4000-8000-000000000003';
const peer='00000000-0000-4000-8000-000000000004';
const other='00000000-0000-4000-8000-000000000005';
const req1='00000000-0000-4000-8000-000000000006';
const req2='00000000-0000-4000-8000-000000000007';
const req3='00000000-0000-4000-8000-000000000008';
const t0='2026-11-13T21:00:00.000Z';
const t1='2026-11-13T21:00:00.101Z';
const t2='2026-11-13T21:00:00.202Z';
const state=(publishedAt=t0,x=0,y=0)=>({
 id:'scene',campaignId:campaign,chapterId:'chapter',sceneId:'scene',
 publishedAt,mapTokens:[{id:'token',visible:true,x,y}],
 mapDrawings:[],mapPois:[],mapFog:[],
 mapObjectOrder:[{family:'token',id:'token'}],
});
function setup({fail=false,prove=(data)=>data.state.mapTokens[0].x>=10}={}){
 const members=new Set([user]),sent=[],calls=[],notices=[];
 const source=createArubaGmRevisionedCampaignSource({
  campaignId:campaign,gmUserId:gm,initialState:state(),
  applyGmEvent:()=>{throw Error('original handler already ran');},
  projectVisibleSnapshot:({state})=>projectOriginalMapForPlayer(state),
  projectVisibleEvent:projectOriginalMapDelta,
 });
 const handle=source.registerVerifiedPeer({peerId:peer,userId:user,
  verifiedCampaignId:campaign});
 const tracker=createArubaVerifiedRevisionConfirmation({
  campaignId:campaign,gmUserId:gm,
  isVerifiedMember:({userId})=>members.has(userId),
  getPublishedRevision:()=>handle.revision,
  sendVerifiedResult:result=>sent.push(result),
 });
 const wrapper=fail?{publishObservedMap:()=>false}:source;
 const correlator=createArubaSettledMapRequestCorrelator({
  campaignId:campaign,gmUserId:gm,source:wrapper,tracker,
  getVerifiedPeer:({userId})=>members.has(userId)?{
   peerId:peer,revision:handle.revision,
  }:null,
  isVerifiedMember:({userId})=>members.has(userId),
  proveRequestedEffect:args=>{calls.push(args);return prove(args);},
  onResyncRequired:e=>notices.push(e),
 });
 const register=(requestId,acceptedAfter=t0)=>correlator.register({
  userId:user,peerId:peer,requestId,chapterId:'chapter',acceptedAfter,
 });
 const notify=(publishedAt,x,y=0)=>notifyCommittedMapPublication(state(publishedAt,x,y));
 const close=()=>{correlator.close();tracker.close();source.close();};
 return {members,sent,calls,notices,source,handle,tracker,correlator,register,notify,close};
}
test('two proven commands coalesced into one settled publication share one revision',()=>{
 const x=setup({prove:({requestId,state})=>requestId===req1
  ?state.mapTokens[0].x===10:state.mapTokens[0].y===20});
 assert.equal(x.register(req1),true);
 assert.equal(x.register(req2),true);
 x.notify(t1,10,20);
 assert.equal(x.handle.revision,1);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.tracker.pendingCount,2);
 assert.equal(x.tracker.acknowledge({
  authenticatedUserId:user,verifiedCampaignId:campaign,peerId:peer,revision:1,
 }),true);
 assert.deepEqual(x.sent.map(a=>[a.result.requestId,a.result.revision]),[[req1,1],[req2,1]]);
 assert.equal(x.correlator.suspended,false);
 x.close();
});
test('unproven request remains pending rather than inheriting another visible revision',()=>{
 const x=setup({prove:({requestId,state})=>requestId===req1
  ?state.mapTokens[0].x===10:state.mapTokens[0].y===20});
 x.register(req1);x.register(req2);
 x.notify(t1,10,0);
 assert.equal(x.handle.revision,1);
 assert.equal(x.tracker.pendingCount,1);
 assert.equal(x.correlator.pendingCount,1);
 assert.equal(x.tracker.acknowledge({authenticatedUserId:user,
  verifiedCampaignId:campaign,peerId:peer,revision:1}),true);
 assert.deepEqual(x.sent.map(z=>z.result.requestId),[req1]);
 x.notify(t2,10,20);
 assert.equal(x.handle.revision,2);
 assert.equal(x.tracker.acknowledge({authenticatedUserId:user,
  verifiedCampaignId:campaign,peerId:peer,revision:2}),true);
 assert.deepEqual(x.sent.map(z=>z.result.requestId),[req1,req2]);
 x.close();
});
test('settled no-op does not establish receipt, even for a proving predicate',()=>{
 const x=setup({prove:()=>true});
 x.register(req1);
 x.notify(t1,0,0);
 assert.equal(x.handle.revision,0);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(x.correlator.pendingCount,0);
 assert.deepEqual(x.sent,[]);
 x.close();
});
test('older, duplicate, wrong campaign and wrong chapter notices are not attributed',()=>{
 const x=setup({prove:()=>true});
 x.register(req1,t1);
 x.notify(t0,12);
 assert.equal(x.handle.revision,1);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(x.correlator.pendingCount,1);
 x.notify(t0,12);
 assert.equal(x.handle.revision,1);
 x.notify(t1,15);
 assert.equal(x.handle.revision,2);
 assert.equal(x.tracker.pendingCount,0);
 notifyCommittedMapPublication({...state(t2,19),chapterId:'other'});
 assert.equal(x.handle.revision,2);
 x.notify(t2,20);
 assert.equal(x.tracker.pendingCount,1);
 x.close();
});
test('membership revocation and stale peer prevent expectation creation',()=>{
 const x=setup();
 x.register(req1);
 x.members.delete(user);
 x.notify(t1,10);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.correlator.register({
  userId:user,peerId:other,requestId:req2,chapterId:'chapter',acceptedAfter:t1,
 }),false);
 x.close();
});
test('failed publication suspends, revokes expectations and fires one recovery notification',()=>{
 const x=setup({fail:true});
 x.register(req1);
 x.notify(t1,10);
 assert.equal(x.correlator.suspended,true);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.notices.length,1);
 assert.equal(x.register(req2,t1),false);
 x.notify(t2,30);
 assert.equal(x.notices.length,1);
 x.close();
});
test('closing listener prevents further source publications and clears queued request records',()=>{
 const x=setup();
 x.register(req1);
 x.close();
 notifyCommittedMapPublication(state(t1,10));
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.correlator.register({
  userId:user,peerId:peer,requestId:req2,chapterId:'chapter',acceptedAfter:t0,
 }),false);
});
