import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('original Notes route is server gated and lives in its own session rail',()=>{
 const app=readFileSync(resolve(root,'src/main.tsx'),'utf8');
 assert.match(app,/originalNotesPanelEnabled&&user\.campaignNotesEnabled/);
 assert.match(app,/user\.campaignNoteFoldersEnabled&&activeCampaign/);
 assert.match(app,/activeCampaign\.ownerId===user\.id/);
 assert.match(app,/<ArubaNotesRoute key=\{activeCampaign\.id\}/);
 assert.match(app,/<ArubaSessionRightRail campaignId=\{activeCampaign\.id\}/);
 assert.match(app,/isGm=\{activeCampaign\.ownerId===user\.id&&user\.campaignMemberships\.some/);
 assert.match(app,/notesEnabled=\{notesPanelReady\}/);
 assert.match(app,/<ArubaSessionCharactersPanel key=\{activeCampaign.id\} campaignId=\{activeCampaign.id\}/);
 assert.match(app,/sessionCharacterRequest&&user.charactersEnabled/);
 assert.match(app,/<ArubaCampaignCharacterCards/);
 assert.match(app,/<ArubaCampaignPlayerRows key=\{activeCampaign.id\}/);
 assert.match(app,/availabilityEnabled=\{user.characterAvailabilityEnabled\}/);
 assert.match(app,/user\.charactersEnabled&&!user\.campaignRosterEnabled&&<ArubaCampaignCharacterCards/);
 assert.match(app,/sessionCharacterRequest.requestId/);
 assert.match(app,/requestSequence.current/);
 assert.match(app,/section==='session'&&activeCampaign/);
 assert.doesNotMatch(app,/gmMenu\.filter\(item=>item\.id!=='notes'/);
 assert.match(app,/<GmSectionSidebar/,
  'shipping GM rail must reuse the original grouped navigation');
});
test('Notes route uses the actual original SlideOverPanel and regular build stays disabled',()=>{
 const css=readFileSync(resolve(root,'src/styles.css'),'utf8');
 const vite=readFileSync(resolve(root,'vite.config.mjs'),'utf8');
 const defaultNotes=readFileSync(resolve(root,'src/ArubaOriginalNotesDisabled.tsx'),'utf8');
 assert.match(css,/\.content:has\(\.aruba-original-notes-host\)/);
 assert.match(css,/\[data-note-split-panel="true"\]/);
 const route=readFileSync(resolve(root,'src/ArubaNotesRoute.tsx'),'utf8');
 assert.match(route,/import \{SlideOverPanel\} from/);
 assert.match(route,/<SlideOverPanel isOpen onClose=\{onClose\}/);
 assert.match(css,/\[data-session-slide-over="true"\]/);

 assert.match(vite,/HG_CAMPAIGN_NOTES_CONTRACT==='1'/);
 assert.match(defaultNotes,/non attivato su questa build Aruba/);
});
