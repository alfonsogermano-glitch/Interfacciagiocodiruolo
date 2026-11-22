import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {listJoinedPlayerCampaigns,listAssignedPlayerCharacters,listPlayerVisualAssets,validateBootstrap} from '../src/client.mjs';
import {resolveAuthorizedPlayerMedia} from '../src/player-visual-assets.mjs';
const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const character='d2344aae-20d0-4395-8039-49d0aa3657f9';
const portraitFrame='e2244c0b-4b67-45c2-901a-2b4d3f7c8c01';
const coverFrame='e2244c0b-4b67-45c2-901a-2b4d3f7c8c02';
const coverAsset='e2244c0b-4b67-45c2-901a-2b4d3f7c8c03';
const thumbnail='data:image/png;base64,iVBORw0KGgo=';
const visualAsset=(id,type)=>({id,campaignId:campaign,name:'Asset '+id,type,
 imageDataUrl:'/vtt/campaigns/'+campaign+'/visual-assets/'+id+'/content',
 thumbnailDataUrl:thumbnail,createdAt:'2026-11-16T00:00:00.000Z'});
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
test('player-facing original sheet edits only the independently verified claim',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/EntityDetailView entityType="character"/);
 assert.match(source,/canEdit=\{claimsEnabled&&claimedCharacterId===selected\.id&&!releasing\}/);
 assert.match(source,/saveClaimedCharacterSheet/);
 assert.doesNotMatch(source,/saveFullCharacterSheet|archiveOwnedCharacter|setCharacterAssignment/);
});

test('detail access is rechecked on open and on focus; stale GM permissions never reused',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/async function openAssigned\(id:string\)/);
 assert.match(source,/Promise\.all\(\[listAssignedPlayerCharacters\(fetch,campaignId\),claimsEnabled\?getCurrentCharacterClaim/);
 assert.match(source,/window.addEventListener\('focus',focus\)/);
 assert.match(source,/document.addEventListener\('visibilitychange',visible\)/);
 assert.match(source,/setOpenId\(null\)/);
 assert.doesNotMatch(source,/setInterval|localStorage|sessionStorage/);
});

test('player visual asset list accepts only same-campaign bounded metadata',async()=>{
 let seen;
 const rows=await listPlayerVisualAssets(async(url,options)=>{
  seen={url,options};
  return {ok:true,json:async()=>({items:[{id:portraitFrame,campaignId:campaign,
   name:'Cornice ritratto',type:'portrait-frame',imageDataUrl:'',
   thumbnailDataUrl:thumbnail,createdAt:'2026-11-16T00:00:00.000Z'}]})};
 },campaign);
 assert.equal(seen.url,'/vtt/player-campaigns/'+campaign+'/visual-assets');
 assert.equal(seen.options.credentials,'same-origin');
 assert.equal(rows[0].imageDataUrl,'/vtt/campaigns/'+campaign+'/visual-assets/'+portraitFrame+'/content');
 for(const invalid of [
  [{id:portraitFrame,campaignId:owner,name:'X',type:'frame',thumbnailDataUrl:thumbnail}],
  [{id:portraitFrame,campaignId:campaign,name:'X',type:'unknown',thumbnailDataUrl:thumbnail}],
  [{id:portraitFrame,campaignId:campaign,name:'X',type:'frame',thumbnailDataUrl:'https://x.supabase.co/a'}],
  [{id:portraitFrame,campaignId:campaign,name:'X',type:'frame',thumbnailDataUrl:thumbnail},
   {id:portraitFrame,campaignId:campaign,name:'Y',type:'frame',thumbnailDataUrl:thumbnail}],
 ])
  await assert.rejects(()=>listPlayerVisualAssets(
   async()=>({ok:true,json:async()=>({items:invalid})}),campaign));
});

test('player media accepts only referenced frame assets and same-campaign cover URLs',()=>{
 const assets=[visualAsset(portraitFrame,'portrait-frame'),
  visualAsset(coverFrame,'frame'),visualAsset(coverAsset,'other')];
 const media=resolveAuthorizedPlayerMedia({
  portraitFrameAssetId:portraitFrame,coverFrameAssetId:coverFrame,
  coverImageUrl:'/vtt/campaigns/'+campaign+'/visual-assets/'+coverAsset+'/content',
 },campaign,assets);
 assert.equal(media.portraitFrameAssetId,portraitFrame);
 assert.equal(media.coverFrameAssetId,coverFrame);
 assert.equal(media.coverImageUrl,'/vtt/campaigns/'+campaign+'/visual-assets/'+coverAsset+'/content');
 assert.equal(resolveAuthorizedPlayerMedia({portraitFrameAssetId:coverAsset},campaign,assets)
  .portraitFrameAssetId,null,'A cover asset cannot become a portrait frame');
 assert.equal(resolveAuthorizedPlayerMedia({coverImageUrl:
  'https://legacy.supabase.co/storage/v1/object/public/a.png'},campaign,assets).coverImageUrl,undefined);
 assert.equal(resolveAuthorizedPlayerMedia({coverImageUrl:
  '/vtt/campaigns/'+owner+'/visual-assets/'+coverAsset+'/content'},campaign,assets).coverImageUrl,undefined);
 assert.equal(resolveAuthorizedPlayerMedia({coverImageUrl:
  '/vtt/campaigns/'+campaign+'/visual-assets/'+portraitFrame+'/content'},campaign,
  [visualAsset(coverAsset,'other')]).coverImageUrl,undefined);
});

test('player media preserves the original rail and never mounts Supabase image editors',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 const detail=readFileSync(new URL('../../../src/app/components/session/shared/EntityDetailView.tsx',import.meta.url),'utf8');
 assert.match(source,/arubaReadOnlyMedia=\{true\}/);
 assert.match(source,/arubaReadOnlyVisualAssets=\{visualAssetsEnabled\?visualAssets:undefined\}/);
 assert.match(detail,/arubaReadOnlyMedia && !canEdit/);
 assert.match(detail,/data-aruba-readonly-media="true"/);
 assert.match(detail,/<EntityPortraitImage/);
 assert.match(detail,/data-aruba-readonly-portrait-frame="true"/);
 assert.match(detail,/data-aruba-readonly-cover-frame="true"/);
 assert.match(detail,/<CoverFrame/);
 assert.match(detail,/activeSection === 'token'/);
 assert.match(detail,/<TokenStyleEditor/);
});

test('assigned player loads authorized portrait separately and strips inherited legacy URLs',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/readCharacterPortrait\(fetch,campaignId,selected\.id\)/);
 assert.match(source,/portraitImageUrl:portrait\?\?undefined/);
 assert.match(source,/portraitSourceImageUrl:undefined,portraitCropArea:null/);
 assert.match(source,/resolveAuthorizedPlayerMedia\(selected\.sheetData,campaignId,visualAssets\)/);
 assert.match(source,/coverImageUrl:media\?\.coverImageUrl/);
 assert.match(source,/setPortrait\(null\)/);
 assert.doesNotMatch(source,/saveCharacterPortrait|uploadCropped|PUT|supabase\.storage/);
});
