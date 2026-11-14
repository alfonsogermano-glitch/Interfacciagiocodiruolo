import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSceneCoordinator} from '../src/live-scene-coordinator.mjs';
const sceneId='12345678-1234-4123-8123-123456789abc';
const tokenId='22345678-1234-4123-8123-123456789abc';
const token={id:tokenId,name:'Explorer',x:2,y:3,size:1,visible:true};
test('GM coordinator publishes token changes, player coordinator applies revisioned snapshots',()=>{
 const sent=[],gmScenes=[],playerScenes=[];
 const host=createLiveSceneCoordinator({role:'host',sceneId,liveSession:{publish:s=>{sent.push(s);return true;},getSnapshot:()=>null},onScene:s=>gmScenes.push(s)});
 const player=createLiveSceneCoordinator({role:'player',sceneId,liveSession:{},onScene:s=>playerScenes.push(s)});
 assert.equal(host.publishInitial(),true);
 assert.equal(host.dispatch({type:'add',token}),true);
 assert.equal(player.receiveSnapshot({revision:1,state:sent[0]}),true);
 assert.equal(player.receiveSnapshot({revision:2,state:sent[1]}),true);
 assert.equal(player.getScene().tokens[0].id,tokenId);
 assert.equal(player.receiveSnapshot({revision:1,state:sent[0]}),false);
 assert.equal(player.dispatch({type:'remove',tokenId}),false);
 assert.equal(host.receiveSnapshot({revision:99,state:{}}),false);
 assert.equal(gmScenes.length,2);assert.deepEqual(gmScenes[0],{sceneId,tokens:[]});assert.equal(playerScenes.length,2);
 player.reset();assert.equal(player.getScene(),null);
});
test('hidden GM tokens remain invisible to player coordinator until explicitly revealed',()=>{
 const sent=[];const host=createLiveSceneCoordinator({role:'host',sceneId,liveSession:{publish:s=>{sent.push(s);return true;},getSnapshot:()=>null}});
 const player=createLiveSceneCoordinator({role:'player',sceneId,liveSession:{}});
 host.dispatch({type:'add',token:{...token,visible:false}});
 assert.equal(player.receiveSnapshot({revision:1,state:sent[0]}),true);
 assert.deepEqual(player.getScene().tokens,[]);
 host.dispatch({type:'visibility',tokenId,visible:true});
 assert.equal(player.receiveSnapshot({revision:2,state:sent[1]}),true);
 assert.equal(player.getScene().tokens[0].id,tokenId);
});

test('player scene coordinator rejects snapshots belonging to another scene even with newer revisions',()=>{
 const player=createLiveSceneCoordinator({role:'player',sceneId,liveSession:{}});
 const other='42345678-1234-4123-8123-123456789abc';
 assert.equal(player.receiveSnapshot({revision:100,state:{sceneId:other,tokens:[]}}),false);
 assert.equal(player.receiveSnapshot({revision:1,state:{sceneId,tokens:[]}}),true);
 assert.equal(player.getScene().sceneId,sceneId);
 assert.throws(()=>createLiveSceneCoordinator({role:'player',sceneId:'bad',liveSession:{}}),/Invalid/);
});

test('GM initial scene is surfaced to renderer only after successful initial publish',()=>{
 const displayed=[];
 const host=createLiveSceneCoordinator({role:'host',sceneId,liveSession:{publish:()=>true,getSnapshot:()=>null},onScene:s=>displayed.push(s)});
 assert.equal(host.publishInitial(),true);
 assert.deepEqual(displayed,[{sceneId,tokens:[]}]);
 const failed=[];
 const offline=createLiveSceneCoordinator({role:'host',sceneId,liveSession:{publish:()=>false,getSnapshot:()=>null},onScene:s=>failed.push(s)});
 assert.equal(offline.publishInitial(),false);
 assert.deepEqual(failed,[]);
});
