import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {claimAvailableCharacter,getCurrentCharacterClaim,listClaimableCharacters,listOwnedCharacterClaims,saveClaimedCharacterSheet,validateBootstrap} from '../src/client.mjs';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002',owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841',character='d2344aae-20d0-4395-8039-49d0aa3657f9';
const sheet={id:character,campaignId:campaign,ownerId:owner,name:'PG',status:'active',sheetData:{style:'Jock'}};
test('claim capability requires player reads and assignments',()=>{
 const base={backend:'aruba-staging',user:{id:player,email:'p@example.org',displayName:'P',role:'standard'},capabilities:{campaigns:{read:true,write:true},characters:{read:true,write:true},campaignRoster:{read:true,write:false},characterAvailability:{read:true,write:true},characterAssignments:{read:true,write:true},playerCharacters:{read:true,write:false},characterClaims:{read:true,write:true},gameSession:false}};
 assert.equal(validateBootstrap(base).characterClaimsEnabled,true);
 assert.throws(()=>validateBootstrap({...base,capabilities:{...base.capabilities,characterClaims:{read:true,write:false}}}));
 assert.throws(()=>validateBootstrap({...base,capabilities:{...base.capabilities,playerCharacters:{read:false,write:false}}}));
});
test('claimable list and claim use cookie-only bounded endpoints',async()=>{
 const calls=[];const list=await listClaimableCharacters(async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({characters:[sheet]})};},campaign);
 assert.equal(list[0].id,character);assert.equal(calls[0][0],'/vtt/player-character-claims?campaignId='+campaign);assert.equal(calls[0][1].credentials,'same-origin');
 const result=await claimAvailableCharacter(async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({characterId:character,campaignId:campaign})};},character);
 assert.equal(result.campaignId,campaign);assert.equal(calls[1][0],`/vtt/player-characters/${character}/claim`);assert.equal(calls[1][1].body,undefined);
});
test('current claim is authoritative, campaign scoped and validated',async()=>{
 const calls=[];const claim=await getCurrentCharacterClaim(async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({claim:{characterId:character,claimedAt:'2026-11-16T00:00:00.000Z'}})};},campaign);
 assert.equal(claim.characterId,character);assert.equal(calls[0][0],'/vtt/player-character-claim?campaignId='+campaign);assert.equal(calls[0][1].credentials,'same-origin');
 assert.equal(await getCurrentCharacterClaim(async()=>({ok:true,json:async()=>({claim:null})}),campaign),null);
 await assert.rejects(()=>getCurrentCharacterClaim(async()=>({ok:true,json:async()=>({claim:{characterId:'bad',claimedAt:'today'}})}),campaign),/Claim personaggio non valido/);
});
test('assigned panel releases only the authoritative current claim and reloads state',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/claimedCharacterId===c\.id/);
 assert.match(source,/claimAvailableCharacter\(fetch,characterId,'release'\)/);
 assert.match(source,/Promise\.all\(\[listAssignedPlayerCharacters\(fetch,campaignId\),getCurrentCharacterClaim\(fetch,campaignId\)\]\)/);
 assert.match(source,/Rilascia al GM/);
});
test('claimed sheet save sends no browser identity and validates authoritative row',async()=>{
 const calls=[];const editable={id:character,name:'PG',player:'',style:'Jock',viaggio:'',ambiti:{},abilita:{},tratti:[],equipment:[]};
 const saved={...sheet,name:'PG',createdAt:'2026-11-16T00:00:00.000Z',updatedAt:'2026-11-16T00:00:01.000Z'};
 const result=await saveClaimedCharacterSheet(async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({character:saved})};},campaign,character,editable,owner);
 assert.equal(result.id,character);assert.equal(calls[0][0],`/vtt/player-characters/${character}`);assert.equal(calls[0][1].method,'PUT');
 const body=JSON.parse(calls[0][1].body);assert.deepEqual(Object.keys(body).sort(),['campaignId','name','sheetData']);assert.equal(body.playerId,undefined);assert.equal(body.ownerId,undefined);
});
test('claimed sheet save strips Aruba-managed portrait binaries and never sends data URLs',async()=>{
 const calls=[];const editable={id:character,name:'PG',player:'',portraitImageUrl:'data:image/png;base64,iVBORw0KGgo=',
  portraitSourceImageUrl:'data:image/jpeg;base64,/9j/4AAQ',style:'Jock',viaggio:'',ambiti:{},abilita:{},tratti:[],equipment:[]};
 const saved={...sheet,name:'PG',createdAt:'2026-11-16T00:00:00.000Z',updatedAt:'2026-11-16T00:00:01.000Z'};
 await saveClaimedCharacterSheet(async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({character:saved})};},campaign,character,editable,owner);
 const body=JSON.parse(calls[0][1].body);
 assert.equal(body.sheetData.portraitImageUrl,undefined);
 assert.equal(body.sheetData.portraitSourceImageUrl,undefined);
 assert.equal(calls[0][1].body.includes('data:image/'),false);
});
test('claimed editor is enabled only for current claim and serializes saves before release',()=>{
 const source=readFileSync(new URL('../src/ArubaAssignedCharacterPanel.tsx',import.meta.url),'utf8');
 assert.match(source,/canEdit=\{claimsEnabled&&claimedCharacterId===selected\.id&&!releasing\}/);
 assert.match(source,/saveQueue\.current=saveQueue\.current\.catch\(\(\)=>\{\}\)\.then/);
 assert.match(source,/await saveQueue\.current;\s*await claimAvailableCharacter\(fetch,characterId,'release'\)/);
 assert.match(source,/saveClaimedCharacterSheet\(fetch,campaign,characterId,next,ownerId\)/);
 assert.match(source,/claimedCharacterId===selected\.id&&portraitsEnabled\?\s*<ArubaClaimedCharacterPortrait/);
});
test('claimed portrait editor stores no GM-only source or shared visual asset',()=>{
 const source=readFileSync(new URL('../src/ArubaClaimedCharacterPortrait.tsx',import.meta.url),'utf8');
 assert.match(source,/saveCharacterPortrait\(fetch,campaignId,characterId,blob\)/);
 assert.match(source,/preserveSource=\{false\}/);
 assert.doesNotMatch(source,/saveCharacterPortraitSource|visualAssetsStorage|ArubaGMCharacterPortrait/);
});
test('owner claim list is cookie-only and rejects duplicate or malformed rows',async()=>{
 const calls=[];const claims=await listOwnedCharacterClaims(async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({claims:[{characterId:character,playerId:player,claimedAt:'2026-11-16T00:00:00.000Z'}]})};},campaign);
 assert.equal(claims.get(character),player);assert.equal(calls[0][0],'/vtt/owned-character-claims?campaignId='+campaign);assert.equal(calls[0][1].credentials,'same-origin');
 await assert.rejects(()=>listOwnedCharacterClaims(async()=>({ok:true,json:async()=>({claims:[{characterId:character,playerId:player,claimedAt:'bad'}]})}),campaign),/Claim campagna non valido/);
});
test('CampaignHome exposes claim only from server claimable rows and refreshes after confirmation',()=>{
 const source=readFileSync(new URL('../src/ArubaCampaignHome.tsx',import.meta.url),'utf8');
 assert.match(source,/!isOwner&&viewer\.characterClaimsEnabled\?listClaimableCharacters/);
 assert.match(source,/await claimAvailableCharacter\(fetch,characterId\);setClaimRevision/);
 assert.match(source,/claiming===character\.id\?'Richiesta…':'Richiedi'/);
 assert.doesNotMatch(source,/playerId.*claimAvailableCharacter|ownerId.*claimAvailableCharacter/);
});
