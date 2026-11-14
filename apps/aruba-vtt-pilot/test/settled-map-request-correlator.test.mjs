import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaSettledMapRequestCorrelator} from '../src/ArubaSettledMapRequestCorrelator.mjs';
import {createArubaGmRevisionedCampaignSource} from '../src/ArubaGmRevisionedCampaignSource.mjs';
import {createArubaVerifiedRevisionConfirmation} from '../src/ArubaVerifiedRevisionConfirmation.mjs';
import {notifyCommittedMapPublication,notifyFailedMapPublication} from '../../../src/app/components/session/activeScenePublicationObserver.ts';
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
 const register=(requestId,acceptedAfter=t0,effectKeys)=>correlator.register({
  userId:user,peerId:peer,requestId,chapterId:'chapter',acceptedAfter,
  effectKeys:effectKeys??[requestId===req2?'token:token:y':'token:token:x'],
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
  effectKeys:['token:token:y'],
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
  effectKeys:['token:token:y'],
 }),false);
});

test('overlapping edits to the same token coordinate remain unconfirmed even if predicates both match',()=>{
 const x=setup({prove:({state})=>state.mapTokens[0].x===20});
 assert.equal(x.register(req1,t0,['token:token:x']),true);
 assert.equal(x.register(req2,t0,['token:token:x']),true);
 x.notify(t1,20);
 assert.equal(x.handle.revision,1);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.tracker.acknowledge({
  authenticatedUserId:user,verifiedCampaignId:campaign,peerId:peer,revision:1,
 }),false);
 assert.deepEqual(x.sent,[]);
 x.notify(t2,20);
 assert.equal(x.tracker.pendingCount,0);
 x.close();
});
test('conflicted commands do not prevent independent non-overlapping effects from being confirmed',()=>{
 const x=setup({prove:({requestId,state})=>requestId===req3
  ?state.mapTokens[0].y===30:state.mapTokens[0].x===20});
 x.register(req1,t0,['token:token:x']);
 x.register(req2,t0,['token:token:x']);
 x.register(req3,t0,['token:token:y']);
 x.notify(t1,20,30);
 assert.equal(x.handle.revision,1);
 assert.equal(x.tracker.pendingCount,1);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.tracker.acknowledge({
  authenticatedUserId:user,verifiedCampaignId:campaign,peerId:peer,revision:1,
 }),true);
 assert.deepEqual(x.sent.map(z=>z.result.requestId),[req3]);
 x.close();
});
test('requests without canonical field provenance fail closed',()=>{
 const x=setup();
 for(const effectKeys of [undefined,[],[''],['token:x','token:x'],
  [1],['x'.repeat(300)] ]){
  assert.equal(x.correlator.register({
   userId:user,peerId:peer,requestId:req1,chapterId:'chapter',
   acceptedAfter:t0,effectKeys,
  }),false);
 }
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.register(req1,t0,['token:token:x']),true);
 x.close();
});

test('a losing overlapping command blocks the winner from receiving unprovable attribution',()=>{
 const x=setup({prove:({requestId,state})=>requestId===req1&&state.mapTokens[0].x===20});
 x.register(req1,t0,['token:token:x']);
 x.register(req2,t0,['token:token:x']);
 x.notify(t1,20);
 assert.equal(x.handle.revision,1);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.tracker.acknowledge({
  authenticatedUserId:user,verifiedCampaignId:campaign,peerId:peer,revision:1,
 }),false);
 assert.deepEqual(x.sent,[]);
 x.close();
});

test('rejects malformed or noncanonical baselines before recording a request',()=>{
 const x=setup();
 for(const acceptedAfter of ['not-a-date','2026-11-13T21:00:00Z',
  '2026-11-13T22:00:00.000+01:00','2026-02-30T21:00:00.000Z',
  '2026-11-13T21:00:00.000Zsuffix']){
  assert.equal(x.register(req1,acceptedAfter),false,acceptedAfter);
 }
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.register(req1,t0),true);
 x.close();
});
test('noncanonical settled publication cannot consume pending correlation',()=>{
 const x=setup({prove:()=>true});
 assert.equal(x.register(req1),true);
 for(const publishedAt of ['invalid','2026-11-13T21:00:00Z',
  '2026-11-13T22:00:00.000+01:00','2026-02-30T21:00:00.000Z']){
  assert.equal(x.correlator.settled({campaignId:campaign,chapterId:'chapter',
   publishedAt,state:state(publishedAt,10)}),false);
 }
 assert.equal(x.handle.revision,0);
 assert.equal(x.correlator.pendingCount,1);
 x.notify(t1,10);
 assert.equal(x.handle.revision,1);
 assert.equal(x.tracker.pendingCount,1);
 x.close();
});

test('a throwing effect proof is discarded rather than confirmed by a later batch',()=>{
 let attempts=0;
 const x=setup({prove:()=>{
  attempts++;
  if(attempts===1)throw Error('projection unavailable');
  return true;
 }});
 assert.equal(x.register(req1),true);
 x.notify(t1,10);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.tracker.pendingCount,0);
 x.notify(t2,20);
 assert.equal(attempts,1);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(x.handle.revision,2);
 x.close();
});

test('failed receipt registration cannot be retried against a later unrelated publication',()=>{
 const x=setup({prove:()=>true});
 assert.equal(x.register(req1),true);
 // Fill the real bounded receipt tracker so the first proof cannot register.
 for(let i=0;i<128;i++){
  const requestId=`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
  assert.equal(x.tracker.expect({userId:user,peerId:peer,requestId,revision:1}),true);
 }
 x.notify(t1,10);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.tracker.pendingCount,128);
 x.tracker.revoke({userId:user,peerId:peer});
 x.notify(t2,20);
 assert.equal(x.tracker.pendingCount,0);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.handle.revision,2);
 x.close();
});

test('failed original map publication suspends pending command attribution',()=>{
 const x=setup();
 assert.equal(x.register(req1),true);
 notifyFailedMapPublication(campaign);
 assert.equal(x.correlator.suspended,true);
 assert.equal(x.correlator.pendingCount,0);
 assert.equal(x.notices.length,1);
 x.notify(t1,10);
 assert.equal(x.handle.revision,0);
 assert.equal(x.tracker.pendingCount,0);
 x.close();
});
test('failure notifications from other campaigns do not suspend this campaign',()=>{
 const x=setup();
 assert.equal(x.register(req1),true);
 notifyFailedMapPublication('00000000-0000-4000-8000-000000000099');
 assert.equal(x.correlator.suspended,false);
 x.notify(t1,10);
 assert.equal(x.tracker.pendingCount,1);
 x.close();
});
