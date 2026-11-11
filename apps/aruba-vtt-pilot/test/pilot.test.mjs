import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPilotSession,logoutPilot,validateBootstrap,validateCampaign,listOwnedCampaigns,createOwnedCampaign} from '../src/client.mjs';
const user={id:'971e26ae-eecb-4f37-ad03-56b0c3000789',email:'tester@example.org',displayName:'Tester',role:'standard'};
const caps=enabled=>({campaigns:{read:enabled,write:enabled},characters:{read:false,write:false},gameSession:false});
const sample={id:'be2f1a87-b8ee-4b34-9da0-07efda11379a',ownerId:user.id,name:'Storia',description:'',ruleset:'hsc',createdAt:'2026-11-11'};
test('cookie-based login preserves explicit campaign feature gate',async()=>{
 let request;
 const x=await loadPilotSession(async(path,options)=>{
  request={path,options};return {status:200,ok:true,json:async()=>({user,backend:'aruba-staging',capabilities:caps(true)})};
 });
 assert.equal(x.campaignsEnabled,true);
 assert.equal(request.path,'/vtt/bootstrap');
 assert.equal(request.options.credentials,'same-origin');
 assert.equal(request.options.cache,'no-store');
 assert.equal(Object.isFrozen(x),true);
 assert.equal(validateBootstrap({user,backend:'aruba-staging',capabilities:caps(false)}).campaignsEnabled,false);
});
test('unverified session cannot enter the UI',async()=>{
 assert.equal(await loadPilotSession(async()=>({status:401,ok:false})),null);
 await assert.rejects(()=>loadPilotSession(async()=>({status:503,ok:false})),/non disponibile/);
});
test('campaigns and games remain fail-closed on malformed capabilities',()=>{
 for(const data of [
  {user,backend:'supabase',capabilities:caps(false)},
  {user:{...user,id:'spoofed'},backend:'aruba-staging',capabilities:caps(false)},
  {user,backend:'aruba-staging',capabilities:{...caps(false),gameSession:true}},
  {user,backend:'aruba-staging',capabilities:{...caps(false),campaigns:{read:true,write:false}}},
 ])assert.throws(()=>validateBootstrap(data));
});
test('campaign list is scoped to logged-in identity and rejects malformed records',async()=>{
 const list=await listOwnedCampaigns(async()=>({ok:true,json:async()=>({campaigns:[
  sample,{...sample,id:'be2f1a87-b8ee-4b34-9da0-07efda11379b',ownerId:'another-account'}]})}),user.id);
 assert.equal(list.length,1);
 assert.equal(list[0].ownerId,user.id);
 assert.throws(()=>validateCampaign({...sample,name:null}));
});
test('campaign creation passes only whitelisted fields with same-origin cookies',async()=>{
 let sent;
 const created=await createOwnedCampaign(async(path,options)=>{
  sent={path,options};return {ok:true,json:async()=>({campaign:sample})};
 },{name:'Storia',description:'',ruleset:'hsc'},user.id);
 assert.equal(created.id,sample.id);
 assert.equal(sent.path,'/vtt/campaigns');
 assert.equal(sent.options.credentials,'same-origin');
 assert.deepEqual(Object.keys(JSON.parse(sent.options.body)).sort(),['description','name','ruleset']);
 await assert.rejects(()=>createOwnedCampaign(async()=>{}, {name:'Storia',description:'',ruleset:'invalid'},user.id));
 await assert.rejects(()=>createOwnedCampaign(async()=>({ok:true,json:async()=>({campaign:{...sample,ownerId:'wrong'}})}),
  {name:'Storia',description:'',ruleset:'hsc'},user.id),/Proprietario/);
});
test('logout uses server revocation without local storage',async()=>{
 let req;
 await logoutPilot(async(path,options)=>{req={path,options};return {ok:true};});
 assert.equal(req.path,'/auth/logout');
 assert.equal(req.options.method,'POST');
 const text=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(text,/supabase|localStorage|sessionStorage|Bearer/);
});

test('visual-only icon test keeps original left and right purposes distinct',()=>{
 const code=readFileSync(new URL('../src/icon-study.tsx',import.meta.url),'utf8');
 const left=readFileSync(new URL('../../../src/app/layout/LeftSidebar.tsx',import.meta.url),'utf8');
 const right=readFileSync(new URL('../../../src/app/layout/GmSectionSidebar.tsx',import.meta.url),'utf8');
 assert.match(left,/w-\[100px\]/);
 assert.match(left,/label="Panoramica"/);
 assert.match(left,/label="Personaggi"/);
 assert.match(left,/label="Campagne"/);
 assert.match(right,/w-20/);
 assert.match(right,/id: 'chapters'/);
 assert.match(right,/id: 'npcs'/);
 assert.match(code,/SINISTRA · NAVIGAZIONE UTENTE/);
 assert.match(code,/DESTRA · STRUMENTI GM/);
 assert.doesNotMatch(code,/fetch\(/);
});
