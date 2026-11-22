import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('campaign home reuses original presentation and only Aruba transports',()=>{
 const home=read('../src/ArubaCampaignHome.tsx');
 const main=read('../src/main.tsx');
 assert.match(home,/<CampaignBannerDisplay campaign=\{bannerCampaign\} size="full"/);
 assert.match(home,/<FolderSectionHeader/);
 assert.match(home,/<EntityCard/);
 assert.match(home,/<ArubaPortraitEntityCard/);
 assert.match(main,/<ArubaCampaignHome campaign=\{activeCampaign\}/);
 assert.doesNotMatch(home,/supabase|localStorage|indexedDB/i);
 assert.match(home,/validateOwnedCampaignPlayerSnapshot\(roster,characters,campaign.ownerId/);
 assert.doesNotMatch(home,/\.catch\(\(\)=>\[\]|\.catch\(\(\)=>fallback/);
 assert.match(home,/viewer\.charactersEnabled\?listCharacterDrafts/);
 assert.match(home,/viewer\.narrativeContentEnabled&&isOwner\?listArubaNarrativeContent/);
 for(const file of ['../src/styles.css','../src/legacy-wizard.css']){
  assert.match(read(file),/@source "\.\/ArubaCampaignHome\.tsx"/);
 }
});

test('session start, invites and branding require server capabilities',()=>{
 const home=read('../src/ArubaCampaignHome.tsx');
 assert.match(home,/disabled=\{!sessionEnabled\}/);
 assert.match(home,/onClick=\{onToggleSession\}/);
 assert.match(home,/sessionActive\?'Termina':'Avvia sessione'/);
 assert.match(home,/disabled=\{!inviteEnabled\}/);
 assert.match(home,/onClick=\{onInvite\}/);
 assert.match(home,/aria-label="Modifica immagine di copertina"/);
 assert.match(home,/disabled=\{!brandingEnabled\}/);
 assert.match(home,/onClick=\{\(\)=>onBrandingOpen\('cover'\)\}/);
 assert.doesNotMatch(home,/Copertina campagna non ancora migrata su Aruba/);
 assert.match(home,/onSelect=\{onGoToManagement\}/);
 assert.match(home,/onSelect=\{onEditCampaign\}/);
});
