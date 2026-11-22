import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('Aruba session rail retains original panel order and Phosphor icon language',()=>{
 const rail=read('../src/ArubaSessionRightRail.tsx');
 for(const name of ['ChatCircleDotsIcon','FileTextIcon','NoteIcon','DiceFiveIcon','MapTrifoldIcon','SwordIcon'])
  assert.ok(rail.includes(name));
 assert.doesNotMatch(rail,/from 'lucide-react'/);
 const labels=['Chat','Schede','Note','Dadi','Incontri','Combatti'];
 let cursor=0;
 for(const label of labels){const index=rail.indexOf("label:'"+label+"'",cursor);assert.ok(index>cursor,label);cursor=index;}
});
test('session Dadi opens existing original dice engine rather than a duplicate or fake roll',()=>{
 const rail=read('../src/ArubaSessionRightRail.tsx');
 const dice=read('../src/ArubaQuickDice.tsx');
 assert.match(rail,/id==='dice'\)window\.dispatchEvent\(new CustomEvent\('hollowgate:aruba-open-dice',\{detail:\{campaignId\}\}\)\)/);
 assert.match(dice,/addEventListener\('hollowgate:aruba-open-dice',open\)/);
 assert.match(dice,/removeEventListener\('hollowgate:aruba-open-dice',open\)/);
 assert.match(dice,/rollDiceFormula/);
 assert.match(dice,/setPaletteOpen\(true\)/);
 assert.doesNotMatch(rail,/rollDiceFormula|localStorage|sessionStorage/);
});

test('unnamed quick rolls do not invent a saved formula name',()=>{
 const dice=read('../src/ArubaQuickDice.tsx');
 assert.match(dice,/formulaName:''/);
 assert.doesNotMatch(dice,/formulaName:'Tiro rapido'/);
});

test('dice rail events are scoped to the currently active Aruba campaign',()=>{
 const rail=read('../src/ArubaSessionRightRail.tsx');
 const dice=read('../src/ArubaQuickDice.tsx');
 const main=read('../src/main.tsx');
 assert.match(main,/<ArubaSessionRightRail campaignId=\{activeCampaign\.id\}/);
 assert.match(rail,/detail:\{campaignId\}/);
 assert.match(dice,/event\.detail\?\.campaignId!==campaignId/);
 assert.match(dice,/\},\[campaignId\]\);/);
});

test('dice engine remounts when authenticated player or active campaign changes',()=>{
 const main=read('../src/main.tsx');
 assert.match(main,/<ArubaQuickDice key=\{activeCampaign\.id\+':'\+user\.id\}/);
});

test('session dice palette does not leak into campaign management or home views',()=>{
 const main=read('../src/main.tsx');
  assert.match(main,/\{\(section==='session'\|\|section==='map'\)&&activeCampaign&&<ArubaQuickDice key=/);
 assert.doesNotMatch(main,/\{activeCampaign&&<ArubaQuickDice/);
});

test('Aruba session rail follows original GM-only visibility for encounters and combat',()=>{
 const original=read('../../../src/app/components/session/SessionRightSidebar.tsx');
 const rail=read('../src/ArubaSessionRightRail.tsx');
 const main=read('../src/main.tsx');
 assert.match(original,/isOwner \? \[\.\.\.ICONS, \.\.\.GM_ICONS\] : ICONS/);
 assert.match(rail,/\[\.\.\.shared,\.\.\.\(isGm\?gm:\[\]\)\]/);
 assert.match(rail,/isGm:boolean/);
 assert.match(main,/isGm=\{activeCampaignOwned\|\|user\.campaignMemberships\.some/);
});

test('session combat mounts the original panel only behind real Aruba dependencies',()=>{
 const rail=read('../src/ArubaSessionRightRail.tsx');
 const panel=read('../src/ArubaSessionCombatPanel.tsx');
 const main=read('../src/main.tsx');
 assert.match(rail,/id==='combat'&&combatEnabled/);
 assert.match(panel,/import \{CombatTracker\} from '.+CombatTracker'/);
 assert.match(panel,/CampaignScopeOverride campaign=\{campaign\}/);
 assert.match(panel,/<SlideOverPanel isOpen onClose=\{onClose\}>/);
 assert.match(main,/combatEnabled=\{activeCampaignOwned&&user\.campaignDocumentsEnabled&&user\.narrativeContentEnabled\}/);
 assert.match(main,/sessionPanel==='combat'&&activeCampaignOwned&&user\.campaignDocumentsEnabled&&user\.narrativeContentEnabled/);
});

test('session encounters mounts the original manager with strictly scoped Aruba adapters',()=>{
 const rail=read('../src/ArubaSessionRightRail.tsx');
 const panel=read('../src/ArubaSessionEncounterPanel.tsx');
 const config=read('../vite.config.mjs');
 const main=read('../src/main.tsx');
 assert.match(rail,/id==='encounters'&&encountersEnabled/);
 assert.match(panel,/import \{SceneEncounterManager\} from '.+SceneEncounterManager'/);
 assert.match(panel,/<SceneEncounterManager\/>/);
 for(const adapter of ['ArubaEncounterEntitiesService','ArubaEncounterPersistenceMode','ArubaEncounterNarrativeClient','ArubaEncounterActiveScene'])assert.match(config,new RegExp(adapter));
 assert.match(main,/encountersEnabled=\{activeCampaignOwned&&user\.chaptersEnabled&&user\.scenesEnabled&&user\.narrativeContentEnabled&&user\.campaignDocumentsEnabled\}/);
 assert.match(main,/sessionPanel==='encounters'&&activeCampaignOwned&&user\.chaptersEnabled&&user\.scenesEnabled&&user\.narrativeContentEnabled&&user\.campaignDocumentsEnabled/);
});

test('session chat mounts the original campaign panel only behind the complete Aruba capability',()=>{
 const rail=read('../src/ArubaSessionRightRail.tsx');
 const panel=read('../src/ArubaSessionChatPanel.tsx');
 const main=read('../src/main.tsx');
 const config=read('../vite.config.mjs');
 assert.match(rail,/id==='chat'&&chatEnabled/);
 assert.match(panel,/import \{CampaignChatPanel\} from '.+CampaignChatPanel'/);
 assert.match(panel,/<CampaignChatPanel incomingMessage=\{null\}/);
 assert.match(main,/chatEnabled=\{user\.campaignChatEnabled\}/);
 assert.match(main,/sessionPanel==='chat'&&user\.campaignChatEnabled/);
 for(const adapter of ['ArubaChatService','ArubaPrivateChatService','ArubaChatAttachments','ArubaChatDiceSession'])assert.match(config,new RegExp(adapter));
});
