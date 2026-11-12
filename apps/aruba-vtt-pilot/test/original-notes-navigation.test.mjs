import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('original Notes route is server gated and lives in the existing GM rail',()=>{
 const app=readFileSync(resolve(root,'src/main.tsx'),'utf8');
 assert.match(app,/originalNotesPanelEnabled&&user\.campaignNotesEnabled/);
 assert.match(app,/user\.campaignNoteFoldersEnabled&&activeCampaign/);
 assert.match(app,/activeCampaign\.ownerId===user\.id/);
 assert.match(app,/<ArubaNotesRoute key=\{activeCampaign\.id\}/);
 assert.match(app,/gmMenu\.filter\(item=>item\.id!=='notes'\|\|notesPanelReady\)/);
 assert.match(app,/className=\{id==='map'\?'gm-group-break':''\}/,
  'original right rail group boundary must remain attached to map');
});
test('Notes route fills original two-column canvas and regular build stays disabled',()=>{
 const css=readFileSync(resolve(root,'src/styles.css'),'utf8');
 const vite=readFileSync(resolve(root,'vite.config.mjs'),'utf8');
 const defaultNotes=readFileSync(resolve(root,'src/ArubaOriginalNotesDisabled.tsx'),'utf8');
 assert.match(css,/\.content:has\(\.aruba-original-notes-host\)/);
 assert.match(css,/\[data-note-split-panel="true"\]/);
 assert.match(vite,/HG_CAMPAIGN_NOTES_CONTRACT==='1'/);
 assert.match(defaultNotes,/non attivato su questa build Aruba/);
});
