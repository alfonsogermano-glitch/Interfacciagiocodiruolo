// Source-driven parity inventory. It never asserts 100% just because a build
// succeeds. '--release' fails closed until every feature and visual proof exists.
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const get=p=>readFileSync(path.join(repo,p),'utf8');
const contract=JSON.parse(get('deploy/aruba/qa/full-parity-contract.json'));
const failures=[];
function check(condition,message){if(!condition)failures.push(message);}
function ids(src){return [...src.matchAll(/\{\s*id:\s*['"]([^'"]+)['"]\s*,\s*label:/g)].map(m=>m[1]);}
const originalLeft=get('src/app/layout/LeftSidebar.tsx');
const originalRight=get('src/app/layout/GmSectionSidebar.tsx');
const originalShell=get('src/app/layout/AppShell.tsx');
const originalApp=get('src/app/App.tsx');
const pilot=get('apps/aruba-vtt-pilot/src/main.tsx');
const css=get('apps/aruba-vtt-pilot/src/styles.css');
const leftLabels=['Panoramica','Personaggi','Campagne'];
for(const label of leftLabels)check(originalLeft.includes('label="'+label+'"'),'Original left navigation changed: '+label);
check(originalLeft.includes('w-[100px]'),'Original 100px left rail changed');
check(originalRight.includes('w-20'),'Original 80px GM rail changed');
check(originalShell.includes('{topbar}')&&originalShell.indexOf('{topbar}')<originalShell.indexOf('{rightSidebar}'),
 'Original TopBar / GM vertical placement changed');
const gmIds=ids(originalRight);
check(gmIds.length===12,'Expected 12 original GM rail entries, got '+gmIds.length);
const inventoryIds=contract.rightNavigation.map(x=>x.id);
check(JSON.stringify(gmIds)===JSON.stringify(inventoryIds),
 'GM inventory differs from original source: '+JSON.stringify({gmIds,inventoryIds}));
check(contract.leftNavigation.map(x=>x.originalLabel).join('|')===leftLabels.join('|'),'Left rail audit inventory changed');
check(originalApp.includes('<AppShell'),'Original AppShell reference missing');
check(originalApp.includes('<CampaignHome'),'Original campaign-home reference missing');
for(const p of [...contract.shellRef,contract.originalRef,contract.arubaEntry,...contract.subsystems.map(x=>x.source),...contract.subsystems.map(x=>x.pilot)])
 check(existsSync(path.join(repo,p)),'Missing audit evidence path: '+p);
const pilotIds=ids(pilot);
const extras=pilotIds.filter(x=>!inventoryIds.includes(x)&&!contract.leftNavigation.some(y=>y.id===x)&&!contract.rightNavigation.some(y=>y.pilotId===x));
for(const id of extras)check(contract.pilotExtraNavigation.some(x=>x.id===id),'Undocumented pilot nav entry '+id);
check(contract.pilotExtraNavigation.some(x=>x.id==='notes'&&x.state==='divergente'),
 'Note must remain a documented navigation divergence until reconciled');
check(pilot.includes('className="workspace"')&&!pilot.includes('<AppShell'),
 'AppShell pilot/original discrepancy changed; re-audit and update contract');
check(css.includes('.primary-sidebar')&&css.includes('.gm-sidebar'),'Pilot rail CSS missing');
check(contract.expectedShell.leftSidebarPx===100&&contract.expectedShell.rightSidebarPx===80,'Original rail geometry contract changed');
const allowed=new Set(['non-verificato','parziale','da-migrare','divergente','bloccato','verificato']);
for(const record of [...contract.leftNavigation,...contract.rightNavigation,...contract.pilotExtraNavigation,...contract.subsystems]){
 check(allowed.has(record.state),'Invalid audit status: '+record.id);
 if(record.state==='verificato')check(typeof record.evidence==='string'&&record.evidence.length>12,
  'Verified without grounded evidence: '+record.id);
}
check(contract.viewportChecks.length>=6,'Not enough viewport checks');
if(process.argv.includes('--release')){
 // The registry alone is NOT evidence. The actual Aruba entry must stop
 // rendering placeholders and use the original React shell and session
 // hierarchy, otherwise a manually toggled status could hide regressions.
 const originalRequired=[
  ['<AppShell','Original AppShell is not mounted'],
  ['<CampaignHome','Original CampaignHome/session is not mounted'],
  ['<GmSectionSidebar','Original GM navigation is not mounted'],
  ['<SessionRightSidebar','Original session right rail is not mounted'],
 ];
 for(const [code,message] of originalRequired)
  check(pilot.includes(code),'RELEASE STRUCTURE MISSING: '+message);
 check(!pilot.includes('className="workspace"'),
  'RELEASE STRUCTURE MISSING: Pilot workspace shell is still present');
 check(!pilot.includes('className="placeholder"'),
  'RELEASE PLACEHOLDER PRESENT: GM tools still have a generic placeholder route');
 check(!pilot.includes('Stiamo recuperando i componenti del VTT originale'),
  'RELEASE PLACEHOLDER PRESENT: unfinished screens still shown to users');
 const incomplete=[...contract.leftNavigation,...contract.rightNavigation,...contract.pilotExtraNavigation,...contract.subsystems].filter(x=>x.state!=='verificato');
 for(const r of incomplete)failures.push('UNVERIFIED: '+r.id+' ('+r.state+')');
 for(const [name,passed] of Object.entries(contract.acceptance))
  if(passed!==true)failures.push('RELEASE EVIDENCE MISSING: '+name);
}
if(failures.length){
 console.error('HOLLOWGATE PARITY AUDIT FAILED ('+failures.length+')');
 failures.forEach(x=>console.error(' - '+x));
 process.exitCode=1;
}else{
 console.log('HOLLOWGATE PARITY INVENTORY VALID: '+contract.leftNavigation.length+
 ' original left / '+contract.rightNavigation.length+' original right entries; '+
 contract.subsystems.length+' subsystems; CUTOVER NOT CERTIFIED.');
}
