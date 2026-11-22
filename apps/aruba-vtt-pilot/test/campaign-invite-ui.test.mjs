import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('invite UI is mounted only behind the authenticated capability',()=>{
 const main=read('../src/main.tsx');
 assert.match(main,/campaignInvitesEnabled:boolean/);
 assert.match(main,/disabled=\{!user\.campaignInvitesEnabled\}/);
 assert.match(main,/showJoinInvite&&user\.campaignInvitesEnabled/);
 assert.match(main,/ownerInviteCampaign&&user\.campaignInvitesEnabled&&ownerInviteCampaign\.ownerId===user\.id/);
 assert.match(main,/inviteEnabled=\{user\.campaignInvitesEnabled&&activeCampaignOwned\}/);
});

test('owner code is memory-only, one-time and rotation replaces it',()=>{
 const ui=read('../src/ArubaCampaignInvites.tsx');
 assert.match(ui,/rotateCampaignInvite\(fetcher,campaign\.id,userId\)/);
 assert.match(ui,/CODICE MOSTRATO UNA SOLA VOLTA/);
 assert.match(ui,/setInvite\(value\)/);
 assert.match(ui,/\{invite\?'Ruota codice':'Genera codice invito'\}/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|indexedDB|document\.cookie/i);
});

test('player previews before joining and no character assignment is invented',()=>{
 const ui=read('../src/ArubaCampaignInvites.tsx');
 assert.ok(ui.indexOf('previewCampaignInvite(fetcher,code,userId)')<ui.indexOf('joinCampaignInvite(fetcher,code,userId)'));
 assert.match(ui,/joined\.id!==preview\.id/);
 assert.match(ui,/L’adesione non assegna automaticamente alcun personaggio/);
 assert.doesNotMatch(ui,/assignCharacter|claimCharacter|availableCharacters/);
});
