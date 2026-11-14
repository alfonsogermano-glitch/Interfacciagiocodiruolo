import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaVerifiedMapRequestResults} from '../src/ArubaVerifiedMapRequestResults.mjs';
import {createArubaVerifiedGmMapDispatch} from '../src/ArubaVerifiedGmMapDispatch.mjs';
import {createGmHostEventRouter} from '../src/ArubaGmHostEventRouter.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const campaignId=campaign;
const gm='00000000-0000-4000-8000-000000000002';
const user='00000000-0000-4000-8000-000000000003';
const other='00000000-0000-4000-8000-000000000004';
const req='00000000-0000-4000-8000-000000000005';
const next='00000000-0000-4000-8000-000000000006';
function setup(){
 const members=new Set([user]),sent=[],changes=[];
 const map={
  mapTokens:[{id:'token',visible:true,createdByProfileId:user,locked:false,pinned:false,x:0,y:0}],
  mapPois:[],mapDrawings:[],
 };
 let chapter='chapter-a';
 const dispatch=createArubaVerifiedGmMapDispatch({
  campaignId:campaign,gmUserId:gm,
  getCurrentMapContext:()=>({chapterId:chapter,state:map}),
  isVerifiedMember:({userId})=>members.has(userId),
  onTokenAction:cmd=>{
   changes.push(cmd);
   if(cmd.action==='move')Object.assign(map.mapTokens[0],cmd.positions.token);
  },onPoiAction:()=>{},onLayerAction:()=>{},
 });
 const results=createArubaVerifiedMapRequestResults({
  campaignId,gmUserId:gm,dispatch,
  isVerifiedMember:({userId})=>members.has(userId),
  sendVerifiedResult:frame=>sent.push(frame),
 });
 const frame=(requestId=req,positions={token:{x:5,y:7}})=>({
  campaignId:campaign,fromUserId:user,event:'map_token_action',
  payload:{requestId,chapterId:'chapter-a',action:'move',positions},
 });
 return {members,sent,changes,map,dispatch,results,frame,
  switchChapter:to=>{chapter=to;}};
}
test('accepted GM handler gets a correlated dispatched result, not a persistence claim',()=>{
 const x=setup();
 assert.equal(x.results.receiveFromPlayer(x.frame()),true);
 assert.deepEqual(x.sent,[{
  campaignId:campaign,toUserId:user,
  result:{type:'map-command-result',requestId:req,outcome:'dispatched'},
 }]);
 assert.equal(x.changes.length,1);
 assert.deepEqual([x.map.mapTokens[0].x,x.map.mapTokens[0].y],[5,7]);
 x.results.close();
});
test('replay of an identical request resends result without applying twice',()=>{
 const x=setup();
 assert.equal(x.results.receiveFromPlayer(x.frame()),true);
 assert.equal(x.results.receiveFromPlayer(x.frame()),true);
 assert.equal(x.changes.length,1);
 assert.equal(x.sent.length,2);
 assert.equal(x.results.recentRequests,1);
 assert.equal(x.results.receiveFromPlayer(x.frame(req,{token:{x:99,y:99}})),false);
 assert.equal(x.changes.length,1);
 assert.equal(x.sent.length,2);
 x.results.close();
});
test('GM rejects locked object or stale chapter and returns rejected outcome',()=>{
 const x=setup();
 x.map.mapTokens[0].locked=true;
 assert.equal(x.results.receiveFromPlayer(x.frame()),false);
 assert.equal(x.sent.at(-1).result.outcome,'rejected');
 assert.equal(x.changes.length,0);
 x.map.mapTokens[0].locked=false;
 x.switchChapter('chapter-new');
 assert.equal(x.results.receiveFromPlayer(x.frame(next)),false);
 assert.equal(x.sent.at(-1).result.outcome,'rejected');
 assert.equal(x.changes.length,0);
 x.results.close();
});
test('membership revocation and sender spoofing suppress both operation and result',()=>{
 const x=setup();
 assert.equal(x.results.receiveFromPlayer({...x.frame(),fromUserId:other}),false);
 assert.equal(x.results.receiveFromPlayer({...x.frame(),fromUserId:gm}),false);
 assert.equal(x.results.receiveFromPlayer({...x.frame(),campaignId:other}),false);
 x.members.delete(user);
 assert.equal(x.results.receiveFromPlayer(x.frame()),false);
 assert.deepEqual(x.sent,[]);
 assert.deepEqual(x.changes,[]);
 x.results.close();
});
test('bad IDs, cyclic payloads and unbounded messages fail closed',()=>{
 const x=setup();
 assert.equal(x.results.receiveFromPlayer(x.frame('bad-id')),false);
 assert.equal(x.results.receiveFromPlayer({...x.frame(),payload:{requestId:req,foo:'x'.repeat(61000)}}),false);
 const cyclic=x.frame();cyclic.payload.self=cyclic.payload;
 assert.equal(x.results.receiveFromPlayer(cyclic),false);
 assert.equal(x.sent.length,0);assert.equal(x.changes.length,0);
 x.results.close();
});
test('router forwards only policy-approved events; command result uses verified user destination',()=>{
 const x=setup();
 const router=createGmHostEventRouter({
  campaignId:campaign,gmUserId:gm,
  authorizePlayerEvent:x.dispatch.authorizePlayerEvent,
 });
 router.openVerifiedHost({authenticatedUserId:gm,receiveFromPlayer:x.results.receiveFromPlayer});
 const peer=router.attachVerifiedPlayer({peerId:'signed-member',authenticatedUserId:user,
  verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 assert.equal(peer.publish('map_token_action',x.frame().payload),true);
 assert.equal(x.changes.length,1);assert.equal(x.sent.length,1);
 assert.equal(peer.publish('active_scene_map_patch',{requestId:next}),false);
 x.members.delete(user);
 assert.equal(peer.publish('map_token_action',x.frame(next).payload),false);
 assert.equal(x.sent.length,1);
 x.results.close();router.close();
});
test('callbacks cannot send a successful result after membership is revoked during application',()=>{
 const members=new Set([user]),sent=[];
 const results=createArubaVerifiedMapRequestResults({
  campaignId:campaign,gmUserId:gm,
  isVerifiedMember:({userId})=>members.has(userId),
  dispatch:{receiveFromPlayer:()=>{members.delete(user);return true;}},
  sendVerifiedResult:frame=>sent.push(frame),
 });
 assert.equal(results.receiveFromPlayer({
  campaignId:campaign,fromUserId:user,event:'map_token_action',
  payload:{requestId:req,chapterId:'chapter-a',action:'move',positions:{}},
 }),false);
 assert.deepEqual(sent,[]);
 results.close();
});
test('synchronous dispatch exceptions give rejected outcomes; transport failure does not report success',()=>{
 const members=new Set([user]),errors=[];
 const results=createArubaVerifiedMapRequestResults({
  campaignId:campaign,gmUserId:gm,
  isVerifiedMember:({userId})=>members.has(userId),
  dispatch:{receiveFromPlayer:()=>{throw Error('GM handler failure');}},
  sendVerifiedResult:()=>{throw Error('peer disconnected');},
  onError:error=>errors.push(error.message),
 });
 assert.equal(results.receiveFromPlayer({
  campaignId:campaign,fromUserId:user,event:'map_token_action',
  payload:{requestId:req},
 }),false);
 assert.deepEqual(errors,['GM handler failure','peer disconnected']);
 results.close();
});

test('request IDs remain replay-protected after hundreds of later commands',()=>{
 const calls=[],sent=[];
 const results=createArubaVerifiedMapRequestResults({
  campaignId:campaign,gmUserId:gm,isVerifiedMember:()=>true,
  dispatch:{receiveFromPlayer:({requestId})=>{calls.push(requestId);return true;}},
  sendVerifiedResult:frame=>sent.push(frame),
 });
 const frame=id=>({campaignId:campaign,fromUserId:user,event:'map_token_action',
  payload:{requestId:id,chapterId:'chapter-a'}});
 assert.equal(results.receiveFromPlayer(frame(req)),true);
 for(let i=0;i<256;i++){
  const id=`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
  assert.equal(results.receiveFromPlayer(frame(id)),true);
 }
 assert.equal(results.receiveFromPlayer(frame(req)),true);
 assert.equal(calls.length,257);
 assert.equal(sent.length,258);
 results.close();
});
test('full replay ledger refuses new commands without evicting accepted IDs',()=>{
 let calls=0;
 const results=createArubaVerifiedMapRequestResults({
  campaignId:campaign,gmUserId:gm,isVerifiedMember:()=>true,
  dispatch:{receiveFromPlayer:()=>{calls++;return true;}},
  sendVerifiedResult:()=>{},
 });
 const frame=id=>({campaignId:campaign,fromUserId:user,event:'map_token_action',
  payload:{requestId:id,chapterId:'chapter-a'}});
 const first='30000000-0000-4000-8000-000000000000';
 for(let i=0;i<4096;i++){
  const id=`30000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
  assert.equal(results.receiveFromPlayer(frame(id)),true);
 }
 assert.equal(results.recentRequests,4096);
 assert.equal(results.receiveFromPlayer(frame('30000000-0000-4000-8000-000000004096')),false);
 assert.equal(results.receiveFromPlayer(frame(first)),true);
 assert.equal(calls,4096);
 results.close();
});
