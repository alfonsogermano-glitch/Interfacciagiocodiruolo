import test from 'node:test';
import assert from 'node:assert/strict';
import {projectOriginalSceneTokens} from '../src/original-scene-token-adapter.mjs';
const campaign='12345678-1234-4123-8123-123456789abc';
const scene='22345678-1234-4123-8123-123456789abc';
const token='32345678-1234-4123-8123-123456789abc';
test('original active scene projects visible and GM-hidden tokens without mutation',()=>{
 const publication={campaignId:campaign,sceneId:scene,mapTokens:[
  {id:token,name:'Esploratore',x:10,y:20,size:2,visible:true},
  {id:campaign,name:'Segreto',x:3,y:4,hiddenFromPlayers:true},
 ]};
 const before=structuredClone(publication);
 const projected=projectOriginalSceneTokens(publication,campaign);
 assert.equal(projected.sceneId,scene);
 assert.deepEqual(projected.tokens.map(x=>x.visible),[true,false]);
 assert.deepEqual(publication,before);
});
test('adapter fails closed for missing scene, wrong campaign, invalid token and duplicates',()=>{
 const base={campaignId:campaign,sceneId:scene,mapTokens:[]};
 for(const input of [{...base,sceneId:''},{...base,campaignId:scene},
  {...base,mapTokens:[{id:token,name:'bad',x:Infinity,y:0}]},
  {...base,mapTokens:[{id:token,name:'a',x:0,y:0},{id:token,name:'b',x:0,y:0}]}])
  assert.throws(()=>projectOriginalSceneTokens(input,campaign));
});

test('original token visibility fields reject ambiguous values rather than exposing tokens',()=>{
 const base={campaignId:campaign,sceneId:scene,mapTokens:[{id:token,name:'Secret',x:1,y:2}]};
 for(const patch of [{visible:'false'},{hiddenFromPlayers:'true'},{visible:null}])
  assert.throws(()=>projectOriginalSceneTokens({...base,mapTokens:[{...base.mapTokens[0],...patch}]},campaign),/Invalid original map token/);
});

test('original adapter bounds oversized scenes and malformed optional sizes before allocating snapshots',()=>{
 const base={campaignId:campaign,sceneId:scene,mapTokens:[]};
 assert.throws(()=>projectOriginalSceneTokens({...base,mapTokens:Array(501).fill(null)},campaign),/unavailable/);
 for(const size of [null,0,1.5,21,'2'])
  assert.throws(()=>projectOriginalSceneTokens({...base,mapTokens:[{id:token,name:'Scout',x:0,y:0,size}]},campaign),/Invalid original map token/);
 assert.throws(()=>projectOriginalSceneTokens(base,'not-a-campaign'),/unavailable/);
});
