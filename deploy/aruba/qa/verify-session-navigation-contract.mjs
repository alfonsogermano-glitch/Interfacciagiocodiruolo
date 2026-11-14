// Session-view routing and original right-rail contract audit.
// This is a baseline verifier; it does NOT claim Aruba is visually equivalent.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const load=p=>readFileSync(path.join(root,p),'utf8');
const contract=JSON.parse(load('deploy/aruba/qa/session-navigation-contract.json'));
const original=load(contract.sources.app);
const rail=load(contract.sources.sessionRail);
const gmRail=load(contract.sources.dashboardRail);
const home=load(contract.sources.campaignHome);
const pilot=load(contract.sources.pilot);
const audit=JSON.parse(load('deploy/aruba/qa/full-parity-contract.json'));
const failures=[];
const assert=(v,msg)=>{if(!v)failures.push(msg);};
const icons=(s,name)=>{
 const m=s.match(new RegExp('const '+name+'\\s*:[^=]+=[ \\t]*\\[([\\s\\S]*?)\\];'));
 if(!m){failures.push('Original '+name+' array missing');return [];}
 return [...m[1].matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)'/g)]
   .map(x=>({id:x[1],label:x[2]}));
};
for(const [name,expected] of [['ICONS',contract.sessionRail.common],['GM_ICONS',contract.sessionRail.gmOnly]]){
 const actual=icons(rail,name);
 assert(JSON.stringify(actual)===JSON.stringify(expected.map(({id,label})=>({id,label}))),
  name+' original session icons changed: '+JSON.stringify(actual));
}
for(const item of [...contract.sessionRail.common,...contract.sessionRail.gmOnly]){
 assert(rail.includes('<'+item.component),'Missing session panel: '+item.component);
}
assert(rail.includes('<SlideOverPanel'),'Session SlideOverPanel changed');
assert(rail.includes('openPanel === \'notes\' && <SessionNotesPanel'),
 'Note must remain in session slide-over (not central route)');
assert(rail.includes('isOwner ? [...ICONS, ...GM_ICONS] : ICONS'),
 'GM-only icons are no longer role scoped');
assert(rail.includes('w-20 shrink-0'),'Original session rail width changed');
assert(rail.includes('openCharacterRequest')&&rail.includes('initialSelection={openCharacterRequest}'),
 'Original campaign character-open route changed');
for(const name of contract.sessionRail.eventDelegation)
 assert(rail.includes(name),'Original Note event bridge missing: '+name);
for(const token of ['setIsResizingNotesPanel','setIsResizingChatPanel','setIsResizingCharactersPanel','setIsResizingDicePanel'])
 assert(rail.includes(token),'Original panel resize changed: '+token);
assert(original.includes("view === 'dashboard' && !['characters', 'campaigns'].includes(activeGmTab)"),
 'Dashboard GM rail visibility changed');
assert(original.includes("view === 'campaign-home' ? (")&&
 original.includes('<SessionRightSidebar openCharacterRequest={sessionEntityOpenRequest}'),
 'Campaign right rail must be SessionRightSidebar');
assert(original.includes('<GmSectionSidebar activeTab={activeGmTab}'),
 'Dashboard rail has been removed');
assert(original.includes('<CampaignHome onGoToManagement={goToManagement}'),
 'CampaignHome bridge missing');
assert(original.includes("view === 'campaign-home' && sessionWorkspaceActive ? null"),
 'Original full session left-rail behavior changed');
assert(original.includes("sessionStorage.setItem(VIEW_LS_KEY, 'campaign-home')")&&
 original.includes("sessionStorage.setItem(VIEW_LS_KEY, 'dashboard')"),
 'Original navigation history changed');
assert(original.includes('setSessionEntityOpenRequest({ kind, id, requestId })'),
 'Campaign character click must use a unique request');
assert(home.includes('<SessionWorkspace campaignId={activeCampaign.id}'),
 'Original live session workspace not found');
assert(home.includes('onSessionStateChange?.(sessionActive)'),
 'Original session state callback missing');
const railIds=[...gmRail.matchAll(/\{\s*id:\s*'([^']+)',\s*label:/g)].map(x=>x[1]);
assert(JSON.stringify(railIds)===JSON.stringify(contract.dashboardRailIds),
 'Dashboard rail entries no longer match inventory');
const differences=contract.confirmedPilotDivergences.map(x=>x.id);
assert(differences.length===7,'Navigation divergence inventory incomplete');
assert(pilot.includes('<ArubaSessionRightRail campaignId={activeCampaign.id} notesEnabled={notesPanelReady}')&&
 pilot.includes('<ArubaNotesRoute key={activeCampaign.id}'),
 'Pilot Notes/session rail changed: re-audit before marking parity');
assert(pilot.includes('c.ownerId===user.id')&&pilot.includes('activeCampaign.ownerId===user.id'),
 'Owner-only pilot campaign gate changed: re-evaluate player access');
assert(pilot.includes('<TopBar activeSection={section}')&&
 pilot.includes('<ArubaTopBarQaIdentity user=')&&
 !pilot.includes('<header className="topbar">'),
 'Shipping pilot must mount the original TopBar with Aruba identity, not a synthetic header');
assert(!pilot.includes('<SessionRightSidebar')&&!pilot.includes('<SessionWorkspace'),
 'Pilot session UI evolved: reclassify divergences');
assert(audit.subsystems.some(s=>s.id==='session-right-rail'&&s.state==='divergente'),
 'Full-site audit missing session rail divergence');
if(process.argv.includes('--release')){
 for(const difference of contract.confirmedPilotDivergences)
  if(difference.state!=='resolved')failures.push('UNRESOLVED SESSION ROUTE: '+difference.id);
 for(const [item,verified] of Object.entries(contract.futureEvidence))
  if(verified!==true)failures.push('MISSING NAVIGATION PROOF: '+item);
}
if(failures.length){
 console.error('SESSION NAVIGATION AUDIT FAILED: '+failures.length);
 for(const f of failures)console.error(' - '+f);
 process.exitCode=1;
}else{
 console.log('ORIGINAL SESSION NAVIGATION VERIFIED: 4 shared + 2 GM session icons; '+
  differences.length+' documented Aruba divergences; release still blocked');
}
