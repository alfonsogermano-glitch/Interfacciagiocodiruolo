import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSceneForPlayer,createPlayerScenePublisher} from '../src/player-scene-projection.mjs';
import {createEmptyScene,applySceneTokenAction} from '../src/scene-token-state.mjs';
const sceneId='12345678-1234-4123-8123-123456789abc';
const a='22345678-1234-4123-8123-123456789abc';
const b='32345678-1234-4123-8123-123456789abc';
const token=(id,visible)=>({id,name:visible?'Visible':'Secret',x:1,y:2,size:1,visible});
test('player projection excludes hidden tokens and extraneous GM metadata',()=>{
 const projected=projectSceneForPlayer({sceneId,gmNotes:'secret',tokens:[{...token(a,true),gmNotes:'hidden'},{...token(b,false),gmNotes:'secret'}]});
 assert.deepEqual(projected,{sceneId,tokens:[token(a,true)]});
});
test('publisher retains hidden GM state but never sends hidden token to player',()=>{
 const sent=[];const publisher=createPlayerScenePublisher({liveSession:{publish:s=>{sent.push(s);return true;}},sceneId,applySceneTokenAction,createEmptyScene});
 assert.equal(publisher.dispatch({type:'add',token:token(b,false)}),true);
 assert.deepEqual(sent[0].tokens,[]);
 assert.equal(publisher.getGmState().tokens.length,1);
 assert.equal(publisher.dispatch({type:'add',token:token(a,true)}),true);
 assert.deepEqual(sent[1].tokens.map(t=>t.id),[a]);
 assert.equal(publisher.dispatch({type:'visibility',tokenId:b,visible:true}),true);
 assert.deepEqual(sent[2].tokens.map(t=>t.id),[b,a]);
});
