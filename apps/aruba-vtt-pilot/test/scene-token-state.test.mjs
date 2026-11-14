import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyScene,applySceneTokenAction,createGmSceneController} from '../src/scene-token-state.mjs';
const sceneId='12345678-1234-4123-8123-123456789abc';
const tokenId='22345678-1234-4123-8123-123456789abc';
const token={id:tokenId,name:'Explorer',x:10,y:12,size:1,visible:true};
test('GM scene actions add, move, hide and remove tokens without mutating previous state',()=>{
 const empty=createEmptyScene(sceneId);
 const added=applySceneTokenAction(empty,{type:'add',token});
 const moved=applySceneTokenAction(added,{type:'move',tokenId,x:40,y:50});
 const hidden=applySceneTokenAction(moved,{type:'visibility',tokenId,visible:false});
 const removed=applySceneTokenAction(hidden,{type:'remove',tokenId});
 assert.equal(empty.tokens.length,0);assert.equal(added.tokens[0].x,10);
 assert.equal(moved.tokens[0].x,40);assert.equal(hidden.tokens[0].visible,false);
 assert.deepEqual(removed.tokens,[]);
});
test('invalid and duplicate tokens, impossible positions and unknown actions fail closed',()=>{
 const empty=createEmptyScene(sceneId);
 assert.throws(()=>applySceneTokenAction(empty,{type:'add',token:{...token,x:Infinity}}),/Invalid/);
 const added=applySceneTokenAction(empty,{type:'add',token});
 assert.throws(()=>applySceneTokenAction(added,{type:'add',token}),/already exists/);
 assert.throws(()=>applySceneTokenAction(added,{type:'move',tokenId,x:NaN,y:0}),/Invalid/);
 assert.throws(()=>applySceneTokenAction(added,{type:'remove',tokenId:sceneId}),/not found/);
 assert.throws(()=>applySceneTokenAction(added,{type:'arbitrary'}),/Unknown/);
});
test('GM scene controller commits state only when the live transport accepts publishing',()=>{
 const published=[];let allow=false;
 const liveSession={publish:s=>{if(!allow)return false;published.push(s);return true;},getSnapshot:()=>null};
 const gm=createGmSceneController({liveSession,sceneId});
 assert.equal(gm.dispatch({type:'add',token}),false);assert.equal(gm.getState().tokens.length,0);
 allow=true;assert.equal(gm.publishInitial(),true);
 assert.equal(gm.dispatch({type:'add',token}),true);
 assert.equal(gm.getState().tokens.length,1);assert.equal(published[1].tokens[0].name,'Explorer');
});

test('default GM controller never publishes invisible tokens to players',()=>{
 const published=[];const liveSession={publish:state=>{published.push(state);return true;},getSnapshot:()=>null};
 const gm=createGmSceneController({liveSession,sceneId});
 const secret={...token,id:tokenId,visible:false};
 assert.equal(gm.dispatch({type:'add',token:secret}),true);
 assert.equal(gm.getState().tokens.length,1);
 assert.deepEqual(published[0].tokens,[]);
 assert.equal(gm.dispatch({type:'visibility',tokenId,visible:true}),true);
 assert.equal(published[1].tokens[0].id,tokenId);
});
