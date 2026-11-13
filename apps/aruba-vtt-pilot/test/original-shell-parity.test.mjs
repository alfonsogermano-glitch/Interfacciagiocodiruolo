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
