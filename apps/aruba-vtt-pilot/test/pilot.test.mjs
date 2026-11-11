import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPilotSession,logoutPilot,validateBootstrap,validateCampaign,listOwnedCampaigns,createOwnedCampaign,updateOwnedCampaign,listCharacterDrafts,createCharacterDraft,validateCharacterDraft} from '../src/client.mjs';
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
 assert.match(main,/user.charactersEnabled&&activeCampaign/);
 assert.match(draft,/editor originale/);
 assert.doesNotMatch(draft,/supabase|localStorage|sessionStorage/);
});
