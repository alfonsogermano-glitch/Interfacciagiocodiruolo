import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPilotSession,logoutPilot,validateBootstrap} from '../src/client.mjs';
const user={id:'971e26ae-eecb-4f37-ad03-56b0c3000789',email:'tester@example.org',displayName:'Tester',role:'standard'};
const capabilities={campaigns:{read:false,write:false},characters:{read:false,write:false},gameSession:false};
test('VTT lobby authenticates only via same-origin Aruba cookie',async()=>{
  let request;
  const result=await loadPilotSession(async(path,options)=>{
    request={path,options};
    return {status:200,ok:true,json:async()=>({user,backend:'aruba-staging',capabilities})};
  });
  assert.equal(result.id,user.id);
  assert.equal(request.path,'/vtt/bootstrap');
  assert.equal(request.options.credentials,'same-origin');
  assert.equal(request.options.cache,'no-store');
  assert.equal(request.options.redirect,'error');
  assert.equal(Object.isFrozen(result),true);
});
test('unauthorized session is not treated as a user',async()=>{
  assert.equal(await loadPilotSession(async()=>({status:401,ok:false})),null);
  await assert.rejects(()=>loadPilotSession(async()=>({status:503,ok:false})),/non disponibile/);
});
test('the new app fails closed on wrong backends or enabled game capabilities',()=>{
  for(const payload of [
    {user,backend:'supabase',capabilities},
    {user:{...user,id:'spoofed'},backend:'aruba-staging',capabilities},
    {user,backend:'aruba-staging',capabilities:{...capabilities,gameSession:true}},
    {user,backend:'aruba-staging',capabilities:{...capabilities,campaigns:{read:true,write:false}}},
  ])assert.throws(()=>validateBootstrap(payload));
});
test('logout revokes session server-side and does not use local storage',async()=>{
  let req;
  await logoutPilot(async(path,options)=>{req={path,options};return {ok:true};});
  assert.equal(req.path,'/auth/logout');
  assert.equal(req.options.method,'POST');
  assert.equal(req.options.credentials,'same-origin');
  assert.doesNotMatch(readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8'),/supabase|localStorage|sessionStorage|Bearer/);
});
