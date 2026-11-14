import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerSceneView,validatePlayerSceneSnapshot} from '../src/player-scene-view.mjs';
import {createEmptyScene,applySceneTokenAction} from '../src/scene-token-state.mjs';
import {projectSceneForPlayer} from '../src/player-scene-projection.mjs';
const sceneId='12345678-1234-4123-8123-123456789abc';
const tokenId='22345678-1234-4123-8123-123456789abc';
const token={id:tokenId,name:'Explorer',x:1,y:2,size:1,visible:true};
test('GM scene projection round-trips through player view without exposing GM metadata',()=>{
 let scene=createEmptyScene(sceneId);scene=applySceneTokenAction(scene,{type:'add',token});
 const projection=projectSceneForPlayer({...scene,gmSecret:'hidden'});
 const view=createPlayerSceneView();assert.equal(view.apply({revision:1,state:projection}),true);
 assert.deepEqual(view.getScene().scene,projection);
 assert.equal(view.apply({revision:1,state:{sceneId,tokens:[]}}),false);
 scene=applySceneTokenAction(scene,{type:'move',tokenId,x:6,y:8});
 assert.equal(view.apply({revision:2,state:projectSceneForPlayer(scene)}),true);
 assert.equal(view.getScene().scene.tokens[0].x,6);
 view.reset();assert.equal(view.getScene(),null);
});
test('player scene refuses hidden, duplicated or malformed tokens and never advances revision',()=>{
 const view=createPlayerSceneView();
 assert.equal(view.apply({revision:1,state:{sceneId,tokens:[{...token,visible:false}]}}),false);
 assert.equal(view.apply({revision:1,state:{sceneId,tokens:[token,token]}}),false);
 assert.equal(view.apply({revision:1,state:{sceneId,tokens:[{...token,x:Infinity}]}}),false);
 assert.equal(view.apply({revision:1,state:{sceneId,tokens:[token]}}),true);
 assert.equal(view.getScene().revision,1);
 assert.deepEqual(validatePlayerSceneSnapshot({sceneId,tokens:[{...token,gmSecret:'secret'}]}).tokens,[token]);
});
