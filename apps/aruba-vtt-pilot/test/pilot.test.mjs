import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPilotSession,logoutPilot,validateBootstrap,validateCampaign,listOwnedCampaigns,createOwnedCampaign,updateOwnedCampaign,listCharacterDrafts,createCharacterDraft,validateCharacterDraft,saveFullCharacterSheet,archiveOwnedCharacter} from '../src/client.mjs';
const user={id:'971e26ae-eecb-4f37-ad03-56b0c3000789',email:'tester@example.org',displayName:'Tester',role:'standard'};
const caps=enabled=>({campaigns:{read:enabled,write:enabled},characters:{read:false,write:false},gameSession:false});
const sample={id:'be2f1a87-b8ee-4b34-9da0-07efda11379a',ownerId:user.id,name:'Storia',description:'',ruleset:'hsc',createdAt:'2026-11-11'};
test('cookie-based login preserves explicit campaign feature gate',async()=>{
 let request;
 const x=await loadPilotSession(async(path,options)=>{
  request={path,options};return {status:200,ok:true,json:async()=>({user,backend:'aruba-staging',capabilities:caps(true)})};
 });
 assert.equal(x.campaignsEnabled,true);
 assert.equal(request.path,'/vtt/bootstrap');
 assert.equal(request.options.credentials,'same-origin');
 assert.equal(request.options.cache,'no-store');
 assert.equal(Object.isFrozen(x),true);
 assert.equal(validateBootstrap({user,backend:'aruba-staging',capabilities:caps(false)}).campaignsEnabled,false);
});
test('unverified session cannot enter the UI',async()=>{
 assert.equal(await loadPilotSession(async()=>({status:401,ok:false})),null);
 await assert.rejects(()=>loadPilotSession(async()=>({status:503,ok:false})),/non disponibile/);
});
test('campaigns and games remain fail-closed on malformed capabilities',()=>{
 for(const data of [
  {user,backend:'supabase',capabilities:caps(false)},
  {user:{...user,id:'spoofed'},backend:'aruba-staging',capabilities:caps(false)},
  {user,backend:'aruba-staging',capabilities:{...caps(false),gameSession:true}},
  {user,backend:'aruba-staging',capabilities:{...caps(false),campaigns:{read:true,write:false}}},
 ])assert.throws(()=>validateBootstrap(data));
});
test('campaign list is scoped to logged-in identity and rejects malformed records',async()=>{
 const list=await listOwnedCampaigns(async()=>({ok:true,json:async()=>({campaigns:[
  sample,{...sample,id:'be2f1a87-b8ee-4b34-9da0-07efda11379b',ownerId:'another-account'}]})}),user.id);
 assert.equal(list.length,1);
 assert.equal(list[0].ownerId,user.id);
 assert.throws(()=>validateCampaign({...sample,name:null}));
});
test('campaign creation passes only whitelisted fields with same-origin cookies',async()=>{
 let sent;
 const created=await createOwnedCampaign(async(path,options)=>{
  sent={path,options};return {ok:true,json:async()=>({campaign:sample})};
 },{name:'Storia',description:'',ruleset:'hsc'},user.id);
 assert.equal(created.id,sample.id);
 assert.equal(sent.path,'/vtt/campaigns');
 assert.equal(sent.options.credentials,'same-origin');
 assert.deepEqual(Object.keys(JSON.parse(sent.options.body)).sort(),['description','name','ruleset']);
 await assert.rejects(()=>createOwnedCampaign(async()=>{}, {name:'Storia',description:'',ruleset:'invalid'},user.id));
 await assert.rejects(()=>createOwnedCampaign(async()=>({ok:true,json:async()=>({campaign:{...sample,ownerId:'wrong'}})}),
  {name:'Storia',description:'',ruleset:'hsc'},user.id),/Proprietario/);
});
test('logout uses server revocation without local storage',async()=>{
 let req;
 await logoutPilot(async(path,options)=>{req={path,options};return {ok:true};});
 assert.equal(req.path,'/auth/logout');
 assert.equal(req.options.method,'POST');
 const text=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(text,/supabase|localStorage|sessionStorage|Bearer/);
});

test('visual-only icon test keeps original left and right purposes distinct',()=>{
 const code=readFileSync(new URL('../src/icon-study.tsx',import.meta.url),'utf8');
 const left=readFileSync(new URL('../../../src/app/layout/LeftSidebar.tsx',import.meta.url),'utf8');
 const right=readFileSync(new URL('../../../src/app/layout/GmSectionSidebar.tsx',import.meta.url),'utf8');
 assert.match(left,/w-\[100px\]/);
 assert.match(left,/label="Panoramica"/);
 assert.match(left,/label="Personaggi"/);
 assert.match(left,/label="Campagne"/);
 assert.match(right,/w-20/);
 assert.match(right,/id: 'chapters'/);
 assert.match(right,/id: 'npcs'/);
 assert.match(code,/SINISTRA · NAVIGAZIONE UTENTE/);
 assert.match(code,/DESTRA · STRUMENTI GM/);
 assert.doesNotMatch(code,/fetch\(/);
});

test('Aruba pilot preserves the original Hollowgate left/right rail positions',()=>{
 const code=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
 const left=code.slice(code.indexOf('const leftMenu='),code.indexOf('const gmMenu='));
 const right=code.slice(code.indexOf('const gmMenu='),code.indexOf('const menu='));
 for(const text of ['Panoramica','Personaggi','Campagne'])assert.ok(left.includes("label:'"+text+"'"));
 for(const text of ['Capitoli e Scene','Preparazione','Schede','PNG','Mostri','Indizi','Archivio Oggetti'])assert.ok(right.includes("label:'"+text+"'"));
 assert.match(code,/id:'npcs',label:'PNG',Icon:IdentificationBadgeIcon/);
 assert.match(code,/id:'monsters',label:'Mostri',Icon:GhostIcon/);
 assert.match(code,/className="primary-sidebar"/);
 assert.match(code,/className="gm-sidebar"/);
 assert.ok(code.indexOf('className="primary-sidebar"')<code.indexOf('className="main-area"'));
 assert.ok(code.indexOf('className="main-area"')<code.indexOf('className="gm-sidebar"'));
 assert.match(css,/\.primary-sidebar\{width:100px/);
 assert.match(css,/\.gm-sidebar\{width:80px/);
 assert.doesNotMatch(code,/from ['"](?:@supabase\/supabase-js|lucide-react)['"]/);
});

test('campaign selection is only offered for Aruba-owned campaigns already returned by the API',()=>{
 const code=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.match(code,/campaigns\.some\(c=>c\.id===id&&c\.ownerId===user\.id\)/);
 assert.match(code,/activeCampaign=user\?\.campaignsEnabled\?campaigns\.find\(c=>c\.id===activeCampaignId&&c\.ownerId===user\.id\)/);
 assert.match(code,/setActiveCampaignId\(id=>result\.some\(c=>c\.id===id\)\?id:null\)/);
 assert.match(code,/onClick=\{\(\)=>onOpen\(c\.id\)\}/);
 assert.match(code,/onClick=\{\(\)=>openCampaign\(c\.id\)\}/);
 assert.doesNotMatch(code,/localStorage|sessionStorage/);
});

test('campaign edit calls PATCH with only editable fields and rejects forged response ownership',async()=>{
 let sent;
 const updated=await updateOwnedCampaign(async(path,options)=>{
  sent={path,options};return {ok:true,json:async()=>({campaign:{...sample,name:'Aggiornata'}})};
 },sample.id,{name:' Aggiornata ',description:''},user.id);
 assert.equal(updated.name,'Aggiornata');
 assert.equal(sent.path,'/vtt/campaigns/'+sample.id);
 assert.equal(sent.options.method,'PATCH');
 assert.equal(sent.options.credentials,'same-origin');
 assert.deepEqual(JSON.parse(sent.options.body),{name:'Aggiornata',description:''});
 await assert.rejects(()=>updateOwnedCampaign(async()=>{},sample.id,{name:'X',description:'',ruleset:'custom'},user.id));
 await assert.rejects(()=>updateOwnedCampaign(async()=>({ok:true,json:async()=>({campaign:{...sample,ownerId:'different'}})}),
  sample.id,{name:'X',description:''},user.id),/autorizzata/);
});

test('right GM sidebar starts beneath the full-width top bar, as in original AppShell',()=>{
 const code=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
 const shell=readFileSync(new URL('../../../src/app/layout/AppShell.tsx',import.meta.url),'utf8');
 assert.match(shell,/\{topbar\}[\s\S]*className="flex flex-1 overflow-hidden"[\s\S]*\{rightSidebar\}/);
 const mainStart=code.indexOf('<div className="main-area">');
 const header=code.indexOf('<header className="topbar">',mainStart);
 const row=code.indexOf('<div className="main-workspace-row">',header);
 const content=code.indexOf('<main className="content">',row);
 const sidebar=code.indexOf('<aside className="gm-sidebar"',content);
 assert.ok(mainStart>=0&&header>mainStart&&row>header&&content>row&&sidebar>content);
 assert.ok(code.indexOf('</header>',header)<row);
 assert.match(css,/\.main-area\{[^}]*display:flex;flex-direction:column/);
 assert.match(css,/\.main-workspace-row\{[^}]*display:flex;flex:1/);
 assert.match(css,/\.main-workspace-row>\.gm-sidebar\{height:100%/);
 assert.match(css,/\.topbar\{flex-shrink:0\}/);
 assert.doesNotMatch(css,/\.gm-sidebar\{[^}]*margin-top:/);
});

test('Aruba lobby reuses the ORIGINAL dice game engine and quick-roll state without Supabase',()=>{
 const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const src=readFileSync(new URL('../src/ArubaQuickDice.tsx',import.meta.url),'utf8');
 const engine=readFileSync(new URL('../../../src/app/components/session/dice/diceEngine.ts',import.meta.url),'utf8');
 assert.match(main,/activeCampaign&&<ArubaQuickDice campaignId=\{activeCampaign\.id\} userId=\{user\.id\}/);
 assert.match(src,/import \{rollDiceFormula\} from '\.\.\/\.\.\/\.\.\/src\/app\/components\/session\/dice\/diceEngine\.ts'/);
 assert.match(src,/addStandardQuickDie,buildQuickRollItems,clearQuickRoll,decrementQuickDie/);
 assert.match(src,/identity:\{campaignId,rollerId:userId,rollerName\}/);
 assert.match(src,/formulaName:'Tiro rapido',visibility:'public'/);
 assert.match(src,/useEffect\(\(\)=>\{[\s\S]*setEntries\(\[\]\);setHistory\(\[\]\)/);
 assert.match(src,/Solo in questo browser/);
 assert.doesNotMatch(src,/supabase|sessionStorage|localStorage|Math\.random/);
 assert.match(engine,/cryptoDiceRng/);
 assert.match(engine,/validateDiceFormula/);
});

test('Aruba campaign modal is above the local dice toolbar',()=>{
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
 assert.match(css,/\.aruba-dice-floating\{[^}]*z-index:20/);
 assert.match(css,/\.modal-backdrop\{z-index:50\}/);
});

test('character draft client enforces campaign/owner isolation',async()=>{
 const id='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
 const value={id,campaignId:sample.id,ownerId:user.id,name:'PG',status:'draft',sheetData:{}};
 let sent;
 const list=await listCharacterDrafts(async(path,options)=>{sent={path,options};return {ok:true,json:async()=>({characters:[value]})};},sample.id,user.id);
 assert.equal(list.length,1);assert.equal(sent.options.credentials,'same-origin');
 const draft=await createCharacterDraft(async(path,options)=>{sent={path,options};return {ok:true,json:async()=>({character:value})};},sample.id,' PG ',user.id);
 assert.equal(draft.id,id);assert.deepEqual(JSON.parse(sent.options.body),{campaignId:sample.id,name:'PG'});
 await assert.rejects(()=>listCharacterDrafts(async()=>({ok:true,json:async()=>({characters:[{...value,ownerId:'forged'}]})}),sample.id,user.id));
 assert.throws(()=>validateCharacterDraft({...value,sheetData:null}));
});
test('characters section links real Aruba draft storage without replacing original wizard',()=>{
 const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const draft=readFileSync(new URL('../src/ArubaCharacterDrafts.tsx',import.meta.url),'utf8');
 assert.match(main,/section==='characters'/);
 assert.match(main,/user.charactersEnabled\?/);
 assert.match(draft,/CharacterCreationWizard/);
 assert.doesNotMatch(draft,/supabase|localStorage|sessionStorage/);
});

test('original HSC wizard mounts unmodified, with Aruba-only image dependency and original rules',()=>{
 const vite=readFileSync(new URL('../vite.config.mjs',import.meta.url),'utf8');
 const page=readFileSync(new URL('../src/ArubaCharacterDrafts.tsx',import.meta.url),'utf8');
 const original=readFileSync(new URL('../../../src/app/components/gm/CharacterCreationWizard.tsx',import.meta.url),'utf8');
 const shim=readFileSync(new URL('../src/ArubaImagePending.tsx',import.meta.url),'utf8');
 assert.match(page,/from '\.\.\/\.\.\/\.\.\/src\/app\/components\/gm\/CharacterCreationWizard'/);
 assert.match(page,/rulesetFor\(editing.campaignId\)==='hsc'/);
 assert.match(page,/onAdd=\{character=>\{void save\(character\);\}\}/);
 assert.match(vite,/aruba-legacy-image-safety/);
 assert.match(vite,/ImageCropUploadModal/);
 assert.match(shim,/Supabase Storage/);
 assert.doesNotMatch(shim,/import .*supabase/);
 for(const label of ['Informazioni Base','Stile e Viaggio','Equipaggiamento','Tratti'])
  assert.ok(original.includes(label));
});
test('Aruba full-sheet client preserves original mechanics but does not trust wizard ID',async()=>{
 const character={id:'untrusted-id',name:'Ken',player:'hacker',notes:'Storia',style:'Jock',
  viaggio:'Campione',ambiti:{Fisico:2},abilita:{Muscoli:2},tratti:[],equipment:[]};
 const id='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
 let sent;
 const response={id,ownerId:user.id,campaignId:sample.id,name:'Ken',sheetData:character,status:'active'};
 const value=await saveFullCharacterSheet(async(path,request)=>{
  sent={path,request};return {ok:true,json:async()=>({character:response})};
 },sample.id,id,character,user.id);
 assert.equal(value.status,'active');
 assert.equal(sent.path,'/vtt/characters/'+id);
 assert.equal(sent.request.credentials,'same-origin');
 const payload=JSON.parse(sent.request.body);
 assert.equal(payload.name,'Ken');
 assert.equal(payload.sheetData.id,undefined);
 assert.equal(payload.sheetData.player,undefined);
 assert.equal(payload.sheetData.style,'Jock');
 await assert.rejects(()=>saveFullCharacterSheet(async()=>({ok:true,json:async()=>({character:{...response,ownerId:'forged'}})}),sample.id,id,character,user.id));
 await assert.rejects(()=>saveFullCharacterSheet(async()=>{},sample.id,id,{...character,coverImageUrl:'https://bad.supabase.co/abc'},user.id));
});

test('original complete character sheet uses real Aruba save and owner-only soft archive',async()=>{
 const source=readFileSync(new URL('../src/ArubaCharacterDetailPanel.tsx',import.meta.url),'utf8');
 const original=readFileSync(new URL('../../../src/app/components/CompleteCharacterSheet.tsx',import.meta.url),'utf8');
 const vite=readFileSync(new URL('../vite.config.mjs',import.meta.url),'utf8');
 assert.match(source,/import \{CompleteCharacterSheet\} from/);
 assert.match(source,/onAudaciaUpdate=\{value=>update/);
 assert.match(source,/onDelete=\{\(\)=>void archive\(\)\}/);
 assert.match(source,/queue\.current=queue\.current\.catch/);
 for(const part of ['FrischezzaTracker','FoliaSpiral','ConditionsPanel','TurbePanel','EquipmentPanel'])
  assert.match(original,new RegExp(part));
 assert.match(vite,/ArubaTooltip/);
});
test('archive client uses same origin cookies and trusts no browser owner',async()=>{
 const uuid='ee2f1a87-b8ee-4b34-9da0-07efda11379a';let sent;
 const id=await archiveOwnedCharacter(async(url,request)=>{
  sent={url,request};return {ok:true,json:async()=>({archivedId:uuid})};
 },sample.id,uuid,user.id);
 assert.equal(id,uuid);assert.equal(sent.request.method,'DELETE');
 assert.equal(sent.request.credentials,'same-origin');
 assert.deepEqual(JSON.parse(sent.request.body),{campaignId:sample.id});
 await assert.rejects(()=>archiveOwnedCharacter(async()=>({ok:true,json:async()=>({archivedId:'other'})}),sample.id,uuid,user.id));
});

test('character endpoints reject HTML SPA fallback with actionable error instead of Unexpected token',async()=>{
 const htmlResponse={ok:true,headers:{get:()=> 'text/html; charset=utf-8'},
  json:async()=>{throw SyntaxError("Unexpected token '<'")}};
 await assert.rejects(()=>listCharacterDrafts(async()=>htmlResponse,sample.id,user.id),
  /configurazione Caddy/);
 await assert.rejects(()=>createCharacterDraft(async()=>htmlResponse,sample.id,'Ken',user.id),
  /configurazione Caddy/);
});

test('global character entry respects original three tabs and invokes wizard without a redundant name input',()=>{
 const character=readFileSync(new URL('../src/ArubaCharacterDrafts.tsx',import.meta.url),'utf8');
 const layout=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
 assert.match(character,/EntityFilterToolbar/);
 assert.match(character,/EntityPagination/);
 assert.match(character,/id:'characters',label:'Personaggi'/);
 assert.match(character,/id:'npcs',label:'PNG'/);
 assert.match(character,/id:'monsters',label:'Mostri'/);
 assert.match(character,/onClick=\{\(\)=>\{setError\(null\);setEditingId\(null\);setCreating\(true\);\}\}/);
 assert.doesNotMatch(character,/name="name" required maxLength=\{120\}/);
 assert.match(character,/createCharacterDraft\(fetch,campaignId,character\.name,ownerId\)/);
 assert.match(layout,/section!=='characters'&&<aside className="gm-sidebar"/);
 assert.match(styles,/main-workspace-row>\.content:has\(\.aruba-character-library\)/);
});

test('Aruba imports original EntityCard and FilterToolbar visual components, with safe image adapter',()=>{
 const page=readFileSync(new URL('../src/ArubaCharacterDrafts.tsx',import.meta.url),'utf8');
 const vite=readFileSync(new URL('../vite.config.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/legacy-wizard.css',import.meta.url),'utf8');
 const original=readFileSync(new URL('../../../src/app/components/session/shared/EntityCard.tsx',import.meta.url),'utf8');
 assert.match(page,/import \{EntityCard\} from/);
 assert.match(page,/pageItems.map\(d=><EntityCard/);
 assert.match(vite,/ArubaPortraitPending/);
 assert.match(css,/EntityCard\.tsx/);
 assert.match(original,/DraggablePortrait/);
});

test('global personaggi catalog loads all owned Aruba campaigns without requiring one selected',()=>{
 const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../src/ArubaCharacterDrafts.tsx',import.meta.url),'utf8');
 assert.match(main,/<ArubaCharacterDrafts campaigns=\{campaigns\} activeCampaignId=\{activeCampaignId\} ownerId=\{user.id\}/);
 assert.match(page,/Promise\.all\(campaigns.map\(c=>listCharacterDrafts\(fetch,c.id,ownerId\)\)\)/);
 assert.match(page,/campaignNameFor\(d.campaignId\)/);
 assert.match(page,/onOpenDetail\(d.id,d.campaignId\)/);
 assert.match(page,/Seleziona una campagna High School Cthulhu/);
 assert.doesNotMatch(page,/localStorage|sessionStorage|supabase\.from/);
});

test('catalog opens original context rail and side panel via shared App state, never inline below archive',()=>{
 const app=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const archive=readFileSync(new URL('../src/ArubaCharacterDrafts.tsx',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../src/ArubaCharacterDetailPanel.tsx',import.meta.url),'utf8');
 const originalRail=readFileSync(new URL('../../../src/app/components/session/shared/EntityDetailRail.tsx',import.meta.url),'utf8');
 const originalPanel=readFileSync(new URL('../../../src/app/components/session/SlideOverPanel.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
 assert.match(app,/\[entityDetail,setEntityDetail\]=useState/);
 assert.match(app,/onOpenDetail=\{\(id,campaignId\)=>setEntityDetail/);
 assert.match(app,/<ArubaCharacterDetailPanel key=/);
 assert.doesNotMatch(archive,/CompleteCharacterSheet|ArubaCharacterSheetView|viewingId/);
 assert.match(archive,/onOpenDetail\(d.id,d.campaignId\)/);
 assert.match(bridge,/import \{EntityDetailRail,type EntityDetailRailSection\} from/);
 assert.match(bridge,/import \{SlideOverPanel\} from/);
 assert.match(bridge,/<SlideOverPanel isOpen onClose=\{\(\)=>void requestClose\(\)\} rightOffset="80px"/);
 assert.match(originalRail,/Scheda/);assert.match(originalRail,/Immagine/);assert.match(originalRail,/Token/);
 assert.match(originalPanel,/data-session-slide-over/);
 assert.match(css,/\.aruba-entity-rail\{position:fixed;top:76px;right:0;bottom:0/);
 assert.match(css,/\.aruba-entity-overlay \[data-session-slide-over="true"\]/);
 assert.match(bridge,/salvataggio|Salvataggio/);
});

test('context detail overlay cannot silently close on an in-flight failed save',()=>{
 const src=readFileSync(new URL('../src/ArubaCharacterDetailPanel.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
 assert.match(src,/async function requestClose\(\)/);
 assert.match(src,/await closeGuard\.current\(\)/);
 assert.match(src,/setCloseError\('Il salvataggio non è confermato/);
 assert.match(src,/registerCloseGuard\(\(\)=>queue\.current\)/);
 assert.match(src,/onClose=\{\(\)=>void requestClose\(\)\}/);
 assert.match(src,/className="aruba-entity-backdrop"/);
 assert.match(css,/\.aruba-entity-backdrop\{position:fixed;inset:0;z-index:895/);
});
