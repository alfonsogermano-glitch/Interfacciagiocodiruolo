import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('QA shell mounts the original components with their original slot hierarchy',()=>{
 const qa=read('../src/ArubaOriginalShellParity.tsx');
 const shell=read('../../../src/app/layout/AppShell.tsx');
 assert.match(qa,/import \{AppShell\} from/);
 assert.match(qa,/import \{LeftSidebar\} from/);
 assert.match(qa,/import \{GmSectionSidebar\} from/);
 assert.match(qa,/<AppShell/);
 assert.match(qa,/leftSidebar=\{<LeftSidebar/);
 assert.match(qa,/rightSidebar=\{view==='dashboard'/);
 assert.match(shell,/\{topbar\}[\s\S]*\{rightSidebar\}/);
 assert.match(qa,/data-original-topbar-slot="pending-Aruba-adapter"/);
 assert.doesNotMatch(qa,/supabase|localStorage|sessionStorage|fetch\(/);
});
test('QA shell cannot accidentally become the shipping VTT entry',()=>{
 const main=read('../src/main.tsx');
 const config=read('../vite.original-shell.config.mjs');
 assert.doesNotMatch(main,/ArubaOriginalShellParity|original-shell-entry/);
 assert.match(config,/vtt-original-shell-qa/);
 assert.match(config,/original-shell\.html/);
 assert.match(read('../original-shell.html'),/original-shell-entry\.tsx/);
});

test('authenticated QA shell uses cookie bootstrap and owner-scoped Aruba campaigns only',()=>{
 const qa=read('../src/ArubaAuthenticatedOriginalShellQA.tsx');
 assert.match(qa,/loadPilotSession\(fetch\)/);
 assert.match(qa,/listOwnedCampaigns\(fetch,user\.id\)/);
 assert.match(qa,/if\(!user\.campaignsEnabled\)/);
 assert.match(qa,/if\(!active\)return/);
 assert.match(qa,/<ArubaOriginalShellParity campaigns=\{state\.campaigns\}/);
 assert.doesNotMatch(qa,/supabase|localStorage|sessionStorage|createOwnedCampaign|updateOwnedCampaign|POST|PUT/);
 const entry=read('../src/original-shell-auth-entry.tsx');
 assert.match(entry,/ArubaAuthenticatedOriginalShellQA/);
 assert.doesNotMatch(read('../src/main.tsx'),/original-shell-auth-entry|ArubaAuthenticatedOriginalShellQA/);
 const config=read('../vite.original-shell.config.mjs');
 assert.match(config,/original-shell-auth\.html/);
});

test('the exact original TopBar mounts in authenticated QA only, with fail-closed Supabase boundary',()=>{
 const config=read('../vite.original-shell.config.mjs');
 const topbar=read('../src/ArubaOriginalTopBarQA.tsx');
 const runtime=read('../src/ArubaOriginalTopBarAdapter.tsx');
 const shell=read('../src/ArubaOriginalShellParity.tsx');
 assert.match(topbar,/import \{TopBar\} from/);
 assert.match(shell,/qaUser\?<ArubaOriginalTopBarQA/);
 assert.match(topbar,/sessionWorkspaceActive=\{mapWorkspaceQa\}/);
 assert.match(config,/aruba-original-topbar-qa-isolation/);
 for(const name of ['AuthContext','NotificationsContext','CampaignContext','charactersService'])
  assert.ok(config.includes(name),'missing isolated legacy dependency '+name);
 assert.match(runtime,/useAuth\(\).*useContext\(Context\)/);
 assert.match(runtime,/notifications:\[\] as NotificationRow\[\]/);
 assert.doesNotMatch(runtime,/fetch\(|supabase\.storage|localStorage|sessionStorage/);
 assert.doesNotMatch(read('../src/main.tsx'),/ArubaOriginalTopBarQA|ArubaOriginalTopBarAdapter/);
});

test('original map toolbar QA cannot activate any network map session or bypass edit locks',()=>{
 const shell=read('../src/ArubaOriginalShellParity.tsx');
 const qa=read('../src/ArubaOriginalMapToolQA.tsx');
 const config=read('../vite.original-shell.config.mjs');
 assert.match(shell,/mapWorkspaceQa=\{mapWorkspaceQa\}/);
 assert.match(shell,/<ArubaOriginalMapToolQA/);
 const store=read('../../../src/app/components/session/mapToolStore.ts');
 assert.match(qa,/resetSessionMapRuntime\(\)/);
 assert.match(store,/export function resetSessionMapRuntime\(\)/);
 assert.match(store,/setSessionMapReady\(false\)/);
 assert.match(store,/configureSessionGrid\(\{ \.\.\.DEFAULT_SESSION_GRID \}, false, null\)/);
 assert.match(store,/configureSessionMapHistory\(null, null, false, false\)/);
 assert.match(store,/setActiveSessionMapTool\('move'\)/);
 assert.doesNotMatch(qa,/fetch\(|localStorage|sessionStorage|WebSocket|PeerJS|supabase/);
 assert.match(config,/original-shell-map\.html/);
 assert.doesNotMatch(read('../src/main.tsx'),/ArubaOriginalMapToolQA|original-shell-map-entry/);
});

test('original map runtime has explicit fail-closed teardown of every map mutation callback',()=>{
 const store=read('../../../src/app/components/session/mapToolStore.ts');
 const fixture=read('../src/ArubaOriginalMapToolQA.tsx');
 const browser=read('./browser-original-shell-map.mjs');
 assert.match(store,/export function resetSessionMapRuntime\(\)/);
 for(const symbol of ['setSessionMapReady(false)','setSessionMapCurrentUserId(null)',
  'configureSessionGrid({ ...DEFAULT_SESSION_GRID }, false, null)',
  'configureSessionMapFit(false, null)','configureSessionMapCenter(false, null)',
  'configureSessionMapHistory(null, null, false, false)',
  'configureSessionMapDrawingClear(null)','configureSessionMapFogCoverFullMap(null)',
  'configureSessionMapFogClear(null)','configureSessionMapFogSelectionClear(null)',
  "setActiveSessionMapTool('move')","setSessionMapSelectionArmed(false)",
  'setSessionMapMeasureMode(null)','setSessionMapCalibrationActive(false)',
  'fullMapCovered:false','previewAsPlayer:false'])
  assert.ok(store.includes(symbol),'reset misses '+symbol);
 assert.match(fixture,/return\(\)=>resetSessionMapRuntime\(\)/);
 assert.match(browser,/Stale previous-campaign permissions revived/);
});

test('SessionWorkspace visibility projection stays source-aligned and prevents hidden map objects leaking',()=>{
 const workspace=read('../../../src/app/components/session/SessionWorkspace.tsx');
 const visibility=read('../../../src/app/components/session/sessionMapVisibility.ts');
 assert.match(workspace,/from '\.\/sessionMapVisibility'/);
 assert.match(visibility,/token\.visible !== false/);
 assert.match(visibility,/drawing\.visible !== false/);
 assert.match(visibility,/poi\.visibleToPlayers/);
 assert.match(visibility,/noteVisibleToPlayers \? poi\.noteId : null/);
 assert.doesNotMatch(visibility,/fetch\(|supabase|localStorage|sessionStorage/);
});
