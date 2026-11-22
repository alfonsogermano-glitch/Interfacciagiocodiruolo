import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('joined campaigns enter CampaignHome without owner transports',()=>{
 const main=read('../src/main.tsx'),home=read('../src/ArubaCampaignHome.tsx');
 assert.match(main,/listJoinedPlayerCampaigns\(fetcher\)/);
 assert.match(main,/availableCampaigns=\[\.\.\.campaigns,\.\.\.joinedCampaigns/);
 assert.match(main,/activeCampaignOwned/);
 assert.match(home,/!isOwner&&viewer\.playerCharactersEnabled\?listAssignedPlayerCharacters/);
 assert.match(home,/if\(isOwner\)\{/);
 assert.match(home,/role:'player',characters/);
 assert.match(home,/isOwner&&viewer\.campaignRosterEnabled\?listOwnedCampaignRoster/);
 assert.match(home,/isOwner&&viewer\.characterAvailabilityEnabled\?listCharacterAvailability/);
});

test('player detail reauthorizes and cannot write',()=>{
 const detail=read('../src/ArubaPlayerCharacterDetail.tsx'),main=read('../src/main.tsx');
 assert.match(detail,/listAssignedPlayerCharacters\(fetch,campaignId\)/);
 assert.match(detail,/if\(!authorized\)throw Error/);
 assert.match(detail,/canEdit=\{false\}/);
 assert.match(detail,/onUpdate=\{\(\)=>\{\}\}/);
 assert.doesNotMatch(detail,/saveFullCharacterSheet|archive|updateOwned|supabase|localStorage/i);
 assert.match(main,/sessionCharacterRequest&&!activeCampaignOwned&&user\.playerCharactersEnabled/);
 assert.match(main,/charactersEnabled=\{activeCampaignOwned\?!!user\.charactersEnabled:!!user\.playerCharactersEnabled\}/);
});
