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
 assert.match(app,/isGm=\{activeCampaignOwned\|\|user\.campaignMemberships\.some/);
 assert.match(app,/notesEnabled=\{notesPanelReady\}/);
 assert.match(app,/<ArubaSessionCharactersPanel key=\{activeCampaign.id\} campaignId=\{activeCampaign.id\}/);
 assert.match(app,/sessionPanel==='characters'&&activeCampaignOwned&&user.charactersEnabled/);
 assert.match(app,/<ArubaCampaignCharacterCards/);
 assert.match(app,/<ArubaCampaignHome campaign=\{activeCampaign\}/);
 assert.match(app,/availabilityEnabled=\{user.characterAvailabilityEnabled\}/);
 assert.match(app,/campaignRosterEnabled:user\.campaignRosterEnabled,charactersEnabled:user\.charactersEnabled/);
 assert.match(app,/initialSelection=\{narrativeOpenRequest\?\?sessionCharacterRequest\}/);
 assert.match(app,/requestSequence.current/);
 assert.match(app,/section==='session'&&activeCampaign/);
 assert.doesNotMatch(app,/gmMenu\.filter\(item=>item\.id!=='notes'/);
 assert.match(app,/<ArubaGmSectionSidebar/,
  'shipping GM rail must reuse the original grouped navigation');
});
test('Notes route ships the original panel with an explicit emergency opt-out',()=>{
 const css=readFileSync(resolve(root,'src/styles.css'),'utf8');
 const vite=readFileSync(resolve(root,'vite.config.mjs'),'utf8');
 const defaultNotes=readFileSync(resolve(root,'src/ArubaOriginalNotesDisabled.tsx'),'utf8');
 assert.match(css,/\.content:has\(\.aruba-original-notes-host\)/);
 assert.match(css,/\[data-note-split-panel="true"\]/);
 const route=readFileSync(resolve(root,'src/ArubaNotesRoute.tsx'),'utf8');
 assert.match(route,/import \{SlideOverPanel\} from/);
 assert.match(route,/<SlideOverPanel isOpen onClose=\{onClose\}/);
 assert.match(css,/\[data-session-slide-over="true"\]/);

  assert.match(vite,/const campaignNotesEnabled=process\.env\.HG_CAMPAIGN_NOTES_CONTRACT!=='0'/);
  assert.match(vite,/resolve\(root,campaignNotesEnabled\?/);
  assert.doesNotMatch(vite,/HG_CAMPAIGN_NOTES_CONTRACT==='1'/);
 assert.match(defaultNotes,/non attivato su questa build Aruba/);
});

test('opening an owned character from campaign cards navigates to its visible sheet',()=>{
  const app=readFileSync(resolve(root,'src/main.tsx'),'utf8');
  const handler=app.slice(app.indexOf('function openCampaignCharacter('),app.indexOf('useEffect(()=>{',app.indexOf('function openCampaignCharacter(')));
  assert.match(handler,/setActiveCampaignId\(campaignId\);setSection\('sheets'\);setSessionPanel\(null\)/);
  assert.match(handler,/setEntityDetail\(\{kind:'characters-detail',entityType:'character',id,campaignId\}\)/);
  assert.match(app,/\(section==='characters'\|\|section==='sheets'\)&&entityDetail/);
});

test('Notes contexts resolve before generic shell contexts and Windows IDs are canonical',()=>{
  const vite=readFileSync(resolve(root,'vite.config.mjs'),'utf8');
  const specific=vite.indexOf("if(campaignNotesEnabled&&importer?.endsWith('/src/app/components/session/SessionNotesPanel.tsx'))");
  const generic=vite.indexOf("auth\\/AuthContext$/.test(id)");
  assert.ok(specific>=0&&generic>specific);
  assert.ok(vite.includes("resolvePath(...parts).replaceAll('\\\\','/')"));
});

test('campaign cards render server-provided branding rather than always showing a placeholder',()=>{
  const cards=readFileSync(resolve(root,'src/ArubaCampaignsPage.tsx'),'utf8');
  assert.match(cards,/\{campaign\.logoUrl\?\s*<img src=\{campaign\.logoUrl\}/);
  assert.match(cards,/alt=\{'Logo di '\+campaign\.name\}/);
});

test('Aruba 3D presents the original result and aborts animation on unmount',()=>{
  const animation=readFileSync(resolve(root,'src/ArubaDice3D.tsx'),'utf8');
  const dice=readFileSync(resolve(root,'src/ArubaQuickDice.tsx'),'utf8');
  assert.match(animation,/import\('\.\.\/\.\.\/\.\.\/src\/app\/components\/session\/dice\/dice3dRenderer'\)/);
  assert.match(animation,/renderer\.play\(result,controller\.signal\)/);
  assert.match(animation,/controller\.abort\(\);clearTimeout\(clearTimer\);renderer\?\.dispose\(\)/);
  assert.doesNotMatch(animation,/rollDiceFormula|supabase|fetch\(/);
  assert.match(dice,/<ArubaDice3D key=\{animatedRoll\.id\} result=\{animatedRoll\}/);
});

test('Aruba character detail uses the Phosphor icon set without changing original sheet controls',()=>{
 const detail=readFileSync(resolve(root,'src/ArubaCharacterDetailPanel.tsx'),'utf8');
 assert.match(detail,/import \{ArrowLeftIcon\} from '@phosphor-icons\/react'/);
 assert.doesNotMatch(detail,/from 'lucide-react'/);
 assert.match(detail,/<ArrowLeftIcon size=\{17\} weight="duotone"\/> Torna ai personaggi/);
 assert.match(detail,/<EntityDetailView/);
 assert.match(detail,/<EntityDetailRail/);
});

test('session character selection preserves its own list and embeds campaign detail, without the global overlay',()=>{
 const app=readFileSync(resolve(root,'src/main.tsx'),'utf8');
 const panel=readFileSync(resolve(root,'src/ArubaSessionCharactersPanel.tsx'),'utf8');
 assert.match(app,/sessionPanel==='characters'&&activeCampaignOwned&&user\.charactersEnabled&&\s*<ArubaSessionCharactersPanel/);
 assert.match(app,/!activeCampaignOwned&&user\.playerCharactersEnabled&&\s*<ArubaAssignedCharacterPanel/);
 assert.doesNotMatch(app,/\(section==='session'\|\|section==='map'\)&&activeCampaign&&sessionCharacterRequest&&activeCampaignOwned&&user\.charactersEnabled&&\s*<ArubaCharacterDetailPanel/);
 assert.match(panel,/data-session-sheets-split/);
 assert.match(panel,/<ArubaCharacterDetailPanel embedded/);
 assert.match(panel,/<ArubaNarrativeDetailPanel embedded/);
 assert.doesNotMatch(panel,/setSection|setEntityDetail|onOpenCharacter|onOpenNarrative/);
 assert.match(app,/sessionCharacterRequest&&!activeCampaignOwned&&user\.playerCharactersEnabled&&\s*<ArubaPlayerCharacterDetail/);
 assert.match(app,/onClose=\{closeSessionCharacter\}/);
});

test('switching session sheets or closing the session panel flushes the current scoped save queue',()=>{
 const panel=readFileSync(resolve(root,'src/ArubaSessionCharactersPanel.tsx'),'utf8');
 const app=readFileSync(resolve(root,'src/main.tsx'),'utf8');
 assert.match(panel,/await leaveGuard.current\?\.\(\)/);
 assert.match(panel,/registerLeaveGuard=\{registerLeaveGuard\}/);
 assert.match(panel,/Salvataggio non confermato: la scheda resta aperta/);
 assert.match(app,/await sessionSheetsGuard.current\?\.\(\)/);
 assert.match(app,/registerPanelGuard=\{registerSessionSheetsGuard\}/);
});

test('character detail and Schede rail remain usable on narrow screens',()=>{
 const css=readFileSync(resolve(root,'src/styles.css'),'utf8');
 assert.match(css,/@media\(max-width:540px\)/);
 assert.match(css,/\.aruba-entity-slide-content\{flex-direction:column\}/);
 assert.match(css,/\.aruba-entity-back-column\{\s*flex:0 0 auto/);
 assert.match(css,/\.aruba-entity-detail-main\{flex:1 1 auto;min-height:0;padding:12px;overflow-y:auto\}/);
 assert.match(css,/\.aruba-session-character-row\{flex-wrap:wrap\}/);
});

test('mobile Schede slide-overs reserve both original 100px left and 80px right rails',()=>{
 const css=readFileSync(resolve(root,'src/styles.css'),'utf8');
 assert.match(css,/\.aruba-entity-overlay \[data-session-slide-over="true"\]\{\s*left:100px!important;right:80px!important;\s*width:calc\(100vw - 180px\)!important/);
 assert.match(css,/\.workspace \.aruba-session-characters-host \[data-session-slide-over="true"\]\{\s*left:100px!important;right:80px!important;\s*width:calc\(100vw - 180px\)!important/);
});

test('Phosphor GM icons are injected only by Aruba, preserving the original sidebar dependency boundary',()=>{
 const app=readFileSync(resolve(root,'src/main.tsx'),'utf8');
 const adapter=readFileSync(resolve(root,'src/ArubaGmSectionSidebar.tsx'),'utf8');
 const original=readFileSync(resolve(root,'../../src/app/layout/GmSectionSidebar.tsx'),'utf8');
 assert.match(app,/<ArubaGmSectionSidebar/);
 assert.match(adapter,/from '@phosphor-icons\/react'/);
 assert.match(adapter,/iconOverrides=\{icons\}/);
 assert.doesNotMatch(original,/@phosphor-icons\/react/);
 assert.match(original,/iconOverrides\?\.\[section.id\] \?\? section.icon/);
});
