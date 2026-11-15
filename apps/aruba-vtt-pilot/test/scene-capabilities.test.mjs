import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBootstrap} from '../src/client.mjs';
const id='971e26ae-eecb-4f37-ad03-56b0c3000789';
const payload=()=>({backend:'aruba-staging',user:{id,email:'gm@example.invalid',displayName:'GM',role:'standard'},
 capabilities:{campaigns:{read:true,write:true},characters:{read:false,write:false},gameSession:false}});
test('original Chapters and Scenes capabilities are exposed only when backend authorizes them',()=>{
 const data=payload();
 data.capabilities.chapters={read:true,write:true};
 data.capabilities.scenes={read:true,write:true};
 const user=validateBootstrap(data);
 assert.equal(user.chaptersEnabled,true);
 assert.equal(user.scenesEnabled,true);
});
test('Scenes cannot be advertised without Chapters and both require campaigns',()=>{
 for(const mutate of [
  d=>{d.capabilities.scenes={read:true,write:true};},
  d=>{d.capabilities.chapters={read:true,write:false};},
  d=>{d.capabilities.chapters={read:true,write:true};d.capabilities.campaigns={read:false,write:false};},
  d=>{d.capabilities.chapters={read:true,write:true};d.capabilities.scenes={read:true,write:false};},
 ]){const data=payload();mutate(data);assert.throws(()=>validateBootstrap(data),/Funzionalità non autorizzate/);}
});
test('legacy staging bootstrap remains explicitly disabled for both features',()=>{
 const user=validateBootstrap(payload());
 assert.equal(user.chaptersEnabled,false);
 assert.equal(user.scenesEnabled,false);
});
