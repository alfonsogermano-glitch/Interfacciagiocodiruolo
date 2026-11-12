// Real HTTP handlers, real PostgreSQL SECURITY DEFINER functions and the
// ACTUAL production client transport. ONLY the signed-in identity lookup is
// substituted with two deterministic test cookies. Disposable CI DB only.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Client} from 'pg';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
import {createCampaignService} from '../src/campaign-service.mjs';
import {createCampaignRosterService} from '../src/campaign-roster-service.mjs';
import {createCharacterService} from '../src/character-service.mjs';
import {createCharacterAvailabilityService} from '../src/character-availability-service.mjs';
import {createCampaignNotesService} from '../src/campaign-notes-service.mjs';
import {createCampaignFoldersService} from '../src/campaign-folders-service.mjs';
import {
 listArubaCampaignNotes,createArubaCampaignNote,saveArubaCampaignNote,
 archiveArubaCampaignNote,listArubaCampaignTrash,restoreArubaCampaignTrashItem,
 changeArubaCampaignNoteScope,moveArubaCampaignNoteToFolder,
} from '../../aruba-vtt-pilot/src/campaign-notes-client.mjs';
import {listArubaCampaignFolders,createArubaCampaignFolder}
 from '../../aruba-vtt-pilot/src/campaign-folders-client.mjs';

const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const stranger='4a3465ec-47d7-4021-9f0d-e70da8cbd003';
const ORIGIN='https://staging.hollowgate.quest';
const TOKENS=new Map([['A'.repeat(43),owner],['B'.repeat(43),player],
 ['C'.repeat(43),stranger]]);
const admin=new Client({host:'127.0.0.1',port:15432,user:'postgres',
 password:'ci-only-password',database:'hollowgate_test'});
const runtime=new Client({host:'127.0.0.1',port:15432,user:'postgres',
 password:'ci-only-password',database:'hollowgate_test'});
let server;
const readJson=async response=>{const body=await response.json();
 assert.ok(response.ok,JSON.stringify({status:response.status,body}));
 return body;};
try{
 await admin.connect();
 await runtime.connect();
 for(const [id,label] of [[owner,'owner'],[player,'player'],[stranger,'stranger']]){
  await admin.query(`INSERT INTO hollowgate_auth.users
   (id,email,display_name,status,email_verified_at,source)
   VALUES ($1,$2,$3,'active',now(),'local')`,
   [id,`qa-${label}@example.invalid`,label]);
 }
 await runtime.query('SET ROLE hollowgate_api_runtime');
 const pool={query:(sql,args)=>runtime.query(sql,args)};
 const campaigns=createCampaignService({pool});
 const characters=createCharacterService({pool});
 const characterAvailability=createCharacterAvailabilityService({pool});
 const campaignRoster=createCampaignRosterService({pool});
 const notes=createCampaignNotesService({pool});
 const folders=createCampaignFoldersService({pool});
 server=createApp({checkDatabase:()=>runtime.query('SELECT 1'),
  authHandler:createAuthHttpHandler({
   origin:ORIGIN,login:async()=>{throw Error('Login fixture prohibited')},
   getSessionUser:async token=>{
    const id=TOKENS.get(token);
    return id?{id,email:'qa@example.invalid',displayName:'QA'}:null;
   },revokeSession:async()=>{},campaigns,campaignRoster,characters,characterAvailability,campaignNotes:notes,
   campaignFolders:folders,notesPanelEnabled:true,
  })});
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const transport=(identity=owner)=>async(path,opts={})=>{
  const token=[...TOKENS].find(([,id])=>id===identity)?.[0];
  const headers={...opts.headers,cookie:'__Host-hg_session='+token,
   ...(opts.method&&opts.method!=='GET'?{origin:ORIGIN}:{})};
  return fetch(base+path,{...opts,headers});
 };
 const ownerFetch=transport(),playerFetch=transport(player),outsiderFetch=transport(stranger);
 const bootstrap=await readJson(await ownerFetch('/vtt/bootstrap'));
 assert.equal(bootstrap.capabilities.originalNotesPanel.read,true);
 const unauthorized=await fetch(base+'/vtt/bootstrap');
 assert.equal(unauthorized.status,401);
 const created=await readJson(await ownerFetch('/vtt/campaigns',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({name:'QA browser integration',description:'Disposable',ruleset:'hsc'}),
 }));
 const campaign=created.campaign.id;
 assert.match(campaign,/^[0-9a-f-]{36}$/);
 await admin.query('SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,$4,true)',
  [owner,campaign,player,'player']);
 // Real read-only roster over restricted SQL service/HTTP. No browser
 // supplied identity may authorize a foreign campaign membership list.
 const fetchRoster=async tr=>tr('/vtt/campaigns/'+campaign+'/roster');
 const oRoster=await readJson(await fetchRoster(ownerFetch));
 assert.equal(oRoster.members.length,2);
 assert.deepEqual(oRoster.members.map(m=>m.role),['gm','player']);
 assert.ok(oRoster.members.every(m=>!Object.hasOwn(m,'email')));
 assert.equal((await fetchRoster(playerFetch)).status,404);
 assert.equal((await fetchRoster(outsiderFetch)).status,404);
 assert.equal((await fetch(base+'/vtt/campaigns/'+campaign+'/roster')).status,401);
 assert.equal((await ownerFetch('/vtt/campaigns/not-a-uuid/roster')).status,400);
 const emptyCampaign=(await readJson(await ownerFetch('/vtt/campaigns',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({name:'Campagna vuota',description:'',ruleset:'hsc'}),
 }))).campaign.id;
 assert.equal((await readJson(await ownerFetch('/vtt/campaigns/'+emptyCampaign+'/roster'))).members.length,1);
 const ownerSeen=(await readJson(await ownerFetch('/vtt/campaigns/'+campaign+'/roster'))).members;
 assert.equal(ownerSeen.find(m=>m.userId===player)?.displayName,'player');
 await admin.query('SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,$4,false)',
  [owner,campaign,player,'player']);
 const revoked=await readJson(await fetchRoster(ownerFetch));
 assert.equal(revoked.members.length,1,'Revoked players must vanish from roster');
 await admin.query('SELECT hollowgate_vtt.set_campaign_membership($1,$2,$3,$4,true)',
  [owner,campaign,player,'player']);


 // Original GM pre-made flag: persisted independently from ownership, no
 // player edit/claim capability is created by this flag.
 const createChar=await readJson(await ownerFetch('/vtt/characters',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({campaignId:campaign,name:'Premade GM'}),
 }));
 const charId=createChar.character.id;
 const sheet={name:'Premade GM',style:'Jock',viaggio:'Campione',
  ambiti:{Fisico:2,Scuola:1,Carisma:1,Strada:1},
  abilita:{Muscoli:1},tratti:[],equipment:[],freschezza:12,follia:9};
 await readJson(await ownerFetch('/vtt/characters/'+charId,{
  method:'PUT',headers:{'content-type':'application/json'},
  body:JSON.stringify({campaignId:campaign,name:'Premade GM',sheetData:sheet}),
 }));
 const availabilityPath='/vtt/character-availability?campaignId='+campaign;
 const initialFlags=await readJson(await ownerFetch(availabilityPath));
 assert.deepEqual(initialFlags.characters,[{id:charId,availableForPlayers:false}]);
 const availabilityUrl='/vtt/character-availability/'+charId;
 const change=async(fetcher,value,targetCampaign=campaign)=>fetcher(availabilityUrl,{
  method:'PATCH',headers:{'content-type':'application/json'},
  body:JSON.stringify({campaignId:targetCampaign,availableForPlayers:value}),
 });
 assert.equal((await change(playerFetch,true)).status,404);
 assert.equal((await change(outsiderFetch,true)).status,404);
 assert.equal((await change(ownerFetch,true,emptyCampaign)).status,404);
 assert.equal((await change(ownerFetch,'true')).status,400);
 const foreignOrigin=await fetch(base+availabilityUrl,{
  method:'PATCH',headers:{origin:'https://evil.invalid',
   cookie:'__Host-hg_session='+'A'.repeat(43),
   'content-type':'application/json'},
  body:JSON.stringify({campaignId:campaign,availableForPlayers:true}),
 });
 assert.equal(foreignOrigin.status,403);
 const approved=await readJson(await change(ownerFetch,true));
 assert.deepEqual(approved,{id:charId,availableForPlayers:true});
 assert.deepEqual((await readJson(await ownerFetch(availabilityPath))).characters,
  [{id:charId,availableForPlayers:true}]);
 assert.equal((await playerFetch(availabilityPath)).status===200,false,
  'Member must not access GM-only availability listing');
 const charUnchanged=(await readJson(await ownerFetch(
  '/vtt/characters?campaignId='+campaign))).characters.find(c=>c.id===charId);
 assert.equal(charUnchanged.ownerId,owner);
 assert.deepEqual(charUnchanged.sheetData,sheet);
 await readJson(await change(ownerFetch,false));
 assert.equal((await readJson(await ownerFetch(availabilityPath)))
  .characters[0].availableForPlayers,false);
 const root=await createArubaCampaignNote(ownerFetch,campaign,'Nota integrata');
 const child=await createArubaCampaignNote(ownerFetch,campaign,'Sotto-tab integrata',root.id);
 const rich={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Persistenza vera PostgreSQL'}]}]};
 await saveArubaCampaignNote(ownerFetch,campaign,{
  ...child,campaignId:campaign,contentRich:rich,
 });
 // New read is a real HTTP request to PostgreSQL, not an in-memory cache.
 const childReload=await listArubaCampaignNotes(ownerFetch,campaign,root.id);
 assert.deepEqual(childReload[0].contentRich,rich);
 const playerRead=await listArubaCampaignNotes(playerFetch,campaign,root.id);
 assert.deepEqual(playerRead[0].contentRich,rich);
 const privateRoot=await createArubaCampaignNote(ownerFetch,campaign,'Segreto GM',null,'gm');
 assert.equal((await listArubaCampaignNotes(playerFetch,campaign)).some(n=>n.id===privateRoot.id),false);
 assert.equal((await listArubaCampaignNotes(outsiderFetch,campaign)).length,0);
 const folder=await createArubaCampaignFolder(ownerFetch,campaign,'campaignnotes','Cartella reale');
 assert.ok((await listArubaCampaignFolders(ownerFetch,campaign,'campaignnotes')).some(f=>f.id===folder));
 await moveArubaCampaignNoteToFolder(ownerFetch,campaign,root.id,folder);
 assert.equal((await listArubaCampaignNotes(ownerFetch,campaign)).find(n=>n.id===root.id).folderId,folder);
 await archiveArubaCampaignNote(ownerFetch,campaign,root.id);
 assert.equal((await listArubaCampaignNotes(ownerFetch,campaign)).some(n=>n.id===root.id),false);
 assert.ok((await listArubaCampaignTrash(ownerFetch,campaign)).notes.some(n=>n.id===root.id));
 const playerTrash=await playerFetch('/vtt/campaign-notes/trash?campaignId='+campaign);
 assert.ok([403,404].includes(playerTrash.status)||(
  playerTrash.ok&&(await playerTrash.json()).notes.length===0));
 await restoreArubaCampaignTrashItem(ownerFetch,campaign,'note',root.id);
 const restored=await listArubaCampaignNotes(ownerFetch,campaign);
 assert.equal(restored.find(n=>n.id===root.id)?.visibility,'private');
 const recoveredChild=await listArubaCampaignNotes(ownerFetch,campaign,root.id);
 assert.deepEqual(recoveredChild[0].contentRich,rich);
 assert.equal((await listArubaCampaignNotes(playerFetch,campaign)).some(n=>n.id===root.id),false);
 const writeFromOutsider=await outsiderFetch('/vtt/campaign-notes',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({campaignId:campaign,title:'Forbidden',parentId:null}),
 });
 assert.equal(writeFromOutsider.status,404);
 const forged=await fetch(base+'/vtt/campaign-notes/'+root.id,{
  method:'PATCH',headers:{'content-type':'application/json',
   cookie:'__Host-hg_session='+'A'.repeat(43),origin:'https://evil.example.invalid'},
  body:JSON.stringify({campaignId:campaign,title:'Forged',contentRich:rich,
   position:0,visibility:'all'}),
 });
 assert.equal(forged.status,403);
 await changeArubaCampaignNoteScope(ownerFetch,campaign,root.id,'gm');
 assert.equal((await listArubaCampaignNotes(playerFetch,campaign)).some(n=>n.id===root.id),false);
 console.log('LIVE_PG_HTTP_NOTES_OK: roster SQL isolation, owner-only availability toggles, native API, persisted TipTap after reload, child and folder, restore private, GM/player isolation, CSRF.');
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await runtime.end().catch(()=>{});
 await admin.end().catch(()=>{});
}
