import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {listJoinedPlayerCampaigns,listAssignedPlayerCharacters,validateBootstrap} from '../src/client.mjs';
const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const character='d2344aae-20d0-4395-8039-49d0aa3657f9';
test('player campaign discovery uses authenticated cookie without ownerId',async()=>{
 let seen;
 const data=await listJoinedPlayerCampaigns(async(url,options)=>{
  seen={url,options};
  return {ok:true,json:async()=>({campaigns:[{id:campaign,ownerId:owner,
   name:'Campagna',description:'',ruleset:'hsc'}]})};
 });
 assert.equal(data[0].ownerId,owner);
 assert.equal(seen.url,'/vtt/player-campaigns');
 assert.equal(seen.options.credentials,'same-origin');
});
test('player sheet list checks campaign, status and duplicate identities',async()=>{
 const sheet={id:character,campaignId:campaign,ownerId:owner,
  name:'Mara',status:'active',sheetData:{style:'Jock'}};
 const list=await listAssignedPlayerCharacters(async()=>({ok:true,json:async()=>({characters:[sheet]})}),campaign);
 assert.equal(list[0].id,character);
 for(const invalid of [[{...sheet,campaignId:owner}],[{...sheet,status:'draft'}],[sheet,sheet]])
  await assert.rejects(()=>listAssignedPlayerCharacters(
   async()=>({ok:true,json:async()=>({characters:invalid})}),campaign));
});
test('player read capability is constrained to server-enabled assignments',()=>{
 const caps={backend:'aruba-staging',user:{id:player,email:'p@example.org',displayName:'P',role:'standard'},
  capabilities:{campaigns:{read:true,write:true},characters:{read:true,write:true},
  campaignRoster:{read:true,write:false},characterAvailability:{read:true,write:true},
  characterAssignments:{read:true,write:true},playerCharacters:{read:true,write:false},gameSession:false}};
 assert.equal(validateBootstrap(caps).playerCharactersEnabled,true);
 assert.throws(()=>validateBootstrap({...caps,capabilities:{...caps.capabilities,
  playerCharacters:{read:true,write:true}}}));
});
test('player-facing original sheet uses canEdit false and no writable Aruba endpoint',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/EntityDetailView entityType="character"/);
 assert.match(source,/canEdit=\{false\}/);
 assert.doesNotMatch(source,/saveFullCharacterSheet|archiveOwnedCharacter|setCharacterAssignment/);
});

test('detail access is rechecked on open and on focus; stale GM permissions never reused',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/async function openAssigned\(id:string\)/);
 assert.match(source,/const fresh=await listAssignedPlayerCharacters\(fetch,campaignId\)/);
 assert.match(source,/window.addEventListener\('focus',focus\)/);
 assert.match(source,/document.addEventListener\('visibilitychange',visible\)/);
 assert.match(source,/setOpenId\(null\)/);
 assert.doesNotMatch(source,/setInterval|localStorage|sessionStorage/);
});

test('player media preserves the original rail and never mounts Supabase image editors',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 const detail=readFileSync(new URL('../../../src/app/components/session/shared/EntityDetailView.tsx',import.meta.url),'utf8');
 assert.match(source,/arubaReadOnlyMedia=\{true\}/);
 assert.match(detail,/arubaReadOnlyMedia && !canEdit/);
 assert.match(detail,/data-aruba-readonly-media="true"/);
 assert.match(detail,/<EntityPortraitImage/);
 assert.match(detail,/activeSection === 'token'/);
 assert.match(detail,/<TokenStyleEditor/);
});

test('assigned player loads authorized portrait separately and strips inherited legacy URLs',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/readCharacterPortrait\(fetch,campaignId,selected\.id\)/);
 assert.match(source,/portraitImageUrl:portrait\?\?undefined/);
 assert.match(source,/portraitSourceImageUrl:undefined,portraitCropArea:null/);
 assert.match(source,/coverImageUrl:undefined/);
 assert.match(source,/setPortrait\(null\)/);
 assert.doesNotMatch(source,/saveCharacterPortrait|uploadCropped|PUT|supabase\.storage/);
});
