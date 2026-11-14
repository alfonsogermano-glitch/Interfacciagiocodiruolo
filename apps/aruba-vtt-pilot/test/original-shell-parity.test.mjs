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
 assert.doesNotMatch(qa,/data-original-topbar-slot="pending-Aruba-adapter"/);
 assert.match(qa,/topbar=\{<ArubaOriginalTopBarQA/);
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
 assert.match(shell,/qaUser\?\?/);
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

test('original SessionWorkspace revokes shared map state when campaign context unmounts',()=>{
 const original=read('../../../src/app/components/session/SessionWorkspace.tsx');
 const store=read('../../../src/app/components/session/mapToolStore.ts');
 assert.match(original,/resetSessionMapRuntime,/);
 assert.match(original,/return \(\) => resetSessionMapRuntime\(\)/);
 assert.match(original,/\[campaignId, currentUserId\]/);
 assert.match(original,/setSessionMapCurrentUserId\(currentUserId\)/);
 assert.match(original,/useActiveScene\(campaignId\)/);
 assert.match(original,/useCampaignChannel\(campaignId/);
 assert.match(store,/export function resetSessionMapRuntime\(\)/);
});

test('unauthenticated isolated QA fixture uses the original TopBar rather than a synthetic header',()=>{
 const shell=read('../src/ArubaOriginalShellParity.tsx');
 assert.match(shell,/topbar=\{<ArubaOriginalTopBarQA/);
 assert.match(shell,/email:'qa@example.invalid'/);
 assert.doesNotMatch(shell,/TopBar originale non ancora collegata/);
 assert.doesNotMatch(read('../src/main.tsx'),/ArubaOriginalShellParity/);
});

test('authenticated original shell renders owner-scoped campaign data without legacy writes',()=>{
 const shell=read('../src/ArubaOriginalShellParity.tsx');
 const overview=read('../src/ArubaOriginalCampaignOverviewQA.tsx');
 const browser=read('./browser-original-shell-auth.mjs');
 assert.match(shell,/<ArubaOriginalCampaignOverviewQA campaigns=\{campaigns\}/);
 assert.match(overview,/data-campaign-overview-state="selected"/);
 assert.match(overview,/data-campaign-session-state="not-connected"/);
 assert.match(overview,/RULESETS\[campaign\.ruleset\]/);
 assert.doesNotMatch(overview,/fetch\(|supabase|localStorage|sessionStorage|CampaignHome\s*\(/);
 assert.match(browser,/data-campaign-overview-state="list"/);
 assert.match(browser,/data-campaign-overview-state="selected"/);
});

test('shipping Aruba pilot mounts the original left and GM navigation, not duplicated pilot sidebars',()=>{
 const main=read('../src/main.tsx');
 assert.match(main,/import \{LeftSidebar\} from '\.\.\/\.\.\/\.\.\/src\/app\/layout\/LeftSidebar'/);
 assert.match(main,/import \{GmSectionSidebar\} from '\.\.\/\.\.\/\.\.\/src\/app\/layout\/GmSectionSidebar'/);
 assert.match(main,/<LeftSidebar/);
 assert.match(main,/<GmSectionSidebar/);
 assert.doesNotMatch(main,/<aside className="primary-sidebar"/);
 assert.doesNotMatch(main,/<aside className="gm-sidebar"/);
 for(const mapping of ["scene-encounter","players","equipment-catalog","visual-assets"])
  assert.ok(main.includes(mapping),'missing original GM section mapping '+mapping);
 assert.match(main,/onSelectCampaign=\{campaign=>openCampaign\(campaign\.id\)\}/);
});

test('shipping original Noir navigation has generated utilities, scoped tokens and viewport slots',()=>{
 const css=read('../src/styles.css');
 const main=read('../src/main.tsx');
 assert.match(css,/@import "tailwindcss";/);
 assert.match(css,/@source "\.\.\/\.\.\/\.\.\/src\/app\/layout";/);
 assert.match(css,/\.workspace\[data-dashboard-palette="noir"\]/);
 assert.match(css,/--dash-sidebar-bg:#10100e/);
 assert.match(css,/height:100vh;min-height:0;overflow:hidden/);
 assert.match(main,/className="workspace" data-dashboard-palette="noir"/);
 assert.match(main,/<LeftSidebar/);
 assert.match(main,/<GmSectionSidebar/);
});

test('shipping original TopBar is isolated from Supabase and uses real Aruba identity',()=>{
 const main=read('../src/main.tsx');
 const vite=read('../vite.config.mjs');
 assert.match(main,/import \{TopBar\} from '\.\.\/\.\.\/\.\.\/src\/app\/layout\/TopBar'/);
 assert.match(main,/<ArubaTopBarQaIdentity user=\{\{id:user.id/);
 assert.match(main,/<TopBar activeSection=\{section\}/);
 assert.match(main,/onLogout=\{\(\)=>\{if\(!closing\)void logout\(\);\}\}/);
 assert.match(main,/onOpenSettings=\{\(\)=>setTopbarNotice/);
 assert.match(vite,/aruba-original-topbar-production-isolation/);
 for(const dependency of ['AuthContext','NotificationsContext','CampaignContext','charactersService'])
  assert.ok(vite.includes(dependency));
 assert.doesNotMatch(main,/<header className="topbar">/);
});

test('production Vite TopBar isolation plugin remains valid JavaScript',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['--check','vite.config.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
