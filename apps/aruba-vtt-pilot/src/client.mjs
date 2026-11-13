// Aruba-native VTT frontend. No Supabase, no browser-stored bearer tokens.
export const RULESETS=Object.freeze({
  hsc:'High School Cthulhu',coc7e:'Il Richiamo di Cthulhu 7ª ed.',
  cocclassic:'Il Richiamo di Cthulhu Classic',custom:'Regolamento personalizzato',
  dnd5e:'D&D 5e',pathfinder:'Pathfinder 2e',
});
export function validateBootstrap(data){
  if(!data||data.backend!=='aruba-staging'||!data.user||
    typeof data.user.id!=='string'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.user.id)||
    typeof data.user.email!=='string'||typeof data.user.displayName!=='string'||
    !['standard','admin'].includes(data.user.role))
    throw new Error('Identità Aruba non valida');
  const c=data.capabilities;
  if(!c||typeof c.campaigns?.read!=='boolean'||c.campaigns.read!==c.campaigns.write||
    typeof c.characters?.read!=='boolean'||c.characters.read!==c.characters.write||
    (c.characters.read&&!c.campaigns.read)||
    (c.characterAvailability!==undefined&&(
     typeof c.characterAvailability.read!=='boolean'||
     c.characterAvailability.read!==c.characterAvailability.write||
     (c.characterAvailability.read&&!c.characters.read)))||
    (c.characterAssignments!==undefined&&(
      typeof c.characterAssignments.read!=='boolean'||
      c.characterAssignments.read!==c.characterAssignments.write||
      (c.characterAssignments.read&&(
       c.characters?.read!==true||c.characterAvailability?.read!==true||
       c.campaignRoster?.read!==true))))||
    (c.characterPortraits!==undefined&&(
      typeof c.characterPortraits.read!=='boolean'||
      c.characterPortraits.read!==c.characterPortraits.write||
      (c.characterPortraits.read&&c.characterAssignments?.read!==true)))||
    (c.playerCharacters!==undefined&&(
      typeof c.playerCharacters.read!=='boolean'||c.playerCharacters.write!==false||
      (c.playerCharacters.read&&c.characterAssignments?.read!==true)))||
    (c.campaignRoster!==undefined&&(
      typeof c.campaignRoster.read!=='boolean'||c.campaignRoster.write!==false||
      (c.campaignRoster.read&&!c.campaigns.read)))||
    (c.entityNotes!==undefined&&(typeof c.entityNotes.read!=='boolean'||
      c.entityNotes.read!==c.entityNotes.write||
      (c.entityNotes.read&&!c.characters.read)))||
    (c.campaignNotes!==undefined&&(typeof c.campaignNotes.read!=='boolean'||
      c.campaignNotes.read!==c.campaignNotes.write||
      (c.campaignNotes.read&&!c.campaigns.read)))||
    (c.originalNotesPanel!==undefined&&(
      typeof c.originalNotesPanel.read!=='boolean'||
      c.originalNotesPanel.read!==c.originalNotesPanel.write||
      (c.originalNotesPanel.read&&(
        c.campaignNotes?.read!==true||c.campaignNoteFolders?.read!==true))))||
    (c.campaignNoteFolders!==undefined&&(
      typeof c.campaignNoteFolders.read!=='boolean'||
      c.campaignNoteFolders.read!==c.campaignNoteFolders.write||
      (c.campaignNoteFolders.read&&c.campaignNotes?.read!==true)))||
    c.gameSession!==false)
    throw new Error('Funzionalità non autorizzate');
  return Object.freeze({
    id:data.user.id,email:data.user.email,displayName:data.user.displayName,role:data.user.role,
    campaignsEnabled:c.campaigns.read,charactersEnabled:c.characters.read,
    characterAvailabilityEnabled:c.characterAvailability?.read===true,
    characterAssignmentsEnabled:c.characterAssignments?.read===true,
    playerCharactersEnabled:c.playerCharacters?.read===true,
    characterPortraitsEnabled:c.characterPortraits?.read===true,
    campaignRosterEnabled:c.campaignRoster?.read===true,
    entityNotesEnabled:c.entityNotes?.read===true,
    campaignNotesEnabled:c.campaignNotes?.read===true,
    campaignNoteFoldersEnabled:c.campaignNoteFolders?.read===true,
    originalNotesPanelEnabled:c.originalNotesPanel?.read===true,
  });
}
export async function loadPilotSession(fetchImpl){
  const response=await fetchImpl('/vtt/bootstrap',{
    method:'GET',credentials:'same-origin',cache:'no-store',
    redirect:'error',headers:{Accept:'application/json'},
  });
  if(response.status===401)return null;
  if(!response.ok)throw new Error('Servizio Aruba non disponibile');
  return validateBootstrap(await response.json());
}
export function validateCampaign(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||
    typeof data.id!=='string'||!(/^[0-9a-f-]{36}$/i.test(data.id))||
    typeof data.ownerId!=='string'||
    typeof data.name!=='string'||data.name.length<1||
    typeof data.description!=='string'||!Object.hasOwn(RULESETS,data.ruleset))
    throw new Error('Campagna non valida');
  return Object.freeze({
    id:data.id,ownerId:data.ownerId,name:data.name,description:data.description,ruleset:data.ruleset,
    createdAt:data.createdAt,
  });
}
export async function listOwnedCampaigns(fetchImpl,ownerId){
  const r=await fetchImpl('/vtt/campaigns',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
  if(r.status===401)throw new Error('Sessione scaduta: effettua nuovamente il login.');
  if(!r.ok)throw new Error('Impossibile caricare le campagne');
  const result=await r.json();
  if(!Array.isArray(result.campaigns)||result.campaigns.length>100)throw new Error('Elenco campagne non valido');
  return result.campaigns.map(validateCampaign).filter(c=>c.ownerId===ownerId);
}
export async function createOwnedCampaign(fetchImpl,data,ownerId){
  if(typeof data?.name!=='string'||data.name.trim().length<1||data.name.trim().length>100||
    typeof data.description!=='string'||data.description.length>4000||
    !Object.hasOwn(RULESETS,data.ruleset))throw new Error('Dati della campagna non validi');
  const r=await fetchImpl('/vtt/campaigns',{
    method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:data.name.trim(),description:data.description,ruleset:data.ruleset}),
  });
  if(r.status===401)throw new Error('Sessione scaduta: effettua nuovamente il login.');
  if(!r.ok)throw new Error('Impossibile creare la campagna');
  const result=await r.json();
  const campaign=validateCampaign(result.campaign);
  if(campaign.ownerId!==ownerId)throw new Error('Proprietario non corrispondente');
  return campaign;
}
export async function logoutPilot(fetchImpl){
  const response=await fetchImpl('/auth/logout',{
    method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
  });
  if(!response.ok)throw new Error('Impossibile terminare la sessione');
}

export async function updateOwnedCampaign(fetchImpl,campaignId,data,ownerId){
 if(typeof campaignId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId)||
  typeof data?.name!=='string'||data.name.trim().length<1||data.name.trim().length>100||
  typeof data.description!=='string'||data.description.length>4000||
  Object.keys(data).sort().join(',')!=='description,name')
  throw new Error('Dati campagna non validi');
 const response=await fetchImpl('/vtt/campaigns/'+campaignId,{
  method:'PATCH',credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({name:data.name.trim(),description:data.description}),
 });
 if(response.status===401)throw new Error('Sessione scaduta: effettua nuovamente il login.');
 if(response.status===404)throw new Error('Campagna non trovata o non autorizzata');
 if(!response.ok)throw new Error('Impossibile modificare la campagna');
 const campaign=validateCampaign((await response.json()).campaign);
 if(campaign.ownerId!==ownerId||campaign.id!==campaignId)throw new Error('Campagna non autorizzata');
 return campaign;
}

export function validateCharacterDraft(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||
  !/^[0-9a-f-]{36}$/i.test(data.id)||!/^[0-9a-f-]{36}$/i.test(data.campaignId)||
  !/^[0-9a-f-]{36}$/i.test(data.ownerId)||typeof data.name!=='string'||data.name.length<1||
  !['draft','active'].includes(data.status)||!data.sheetData||Array.isArray(data.sheetData)||typeof data.sheetData!=='object')
  throw new Error('Scheda personaggio non valida');
 return Object.freeze({id:data.id,campaignId:data.campaignId,ownerId:data.ownerId,name:data.name,
   status:data.status,sheetData:data.sheetData});
}
async function characterApiJson(response){
 const mime=response.headers?.get?.('content-type')??'';
 if(mime&&!mime.toLowerCase().includes('application/json'))
  throw Error('Il server ha restituito una pagina invece dei dati personaggio: controllare la configurazione Caddy.');
 try{return await response.json();}
 catch{throw Error('Risposta API personaggi non valida.');}
}
export async function listCharacterDrafts(fetchImpl,campaignId,ownerId){
 const r=await fetchImpl('/vtt/characters?campaignId='+encodeURIComponent(campaignId),{
  method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
 if(r.status===401)throw Error('Sessione scaduta');
 if(!r.ok)throw Error('Impossibile caricare i personaggi');
 const data=await characterApiJson(r);
 if(!Array.isArray(data.characters)||data.characters.length>100)throw Error('Elenco personaggi non valido');
 const list=data.characters.map(validateCharacterDraft);
 if(list.some(x=>x.ownerId!==ownerId||x.campaignId!==campaignId))
  throw Error('Campagna o proprietario non corrispondente');
 return list;
}
export async function createCharacterDraft(fetchImpl,campaignId,name,ownerId){
 if(!/^[0-9a-f-]{36}$/i.test(campaignId)||typeof name!=='string'||name.trim().length<1||name.trim().length>120)
  throw Error('Dati personaggio non validi');
 const r=await fetchImpl('/vtt/characters',{
  method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId,name:name.trim()})});
 if(r.status===401)throw Error('Sessione scaduta');
 if(r.status===404)throw Error('Campagna non trovata');
 if(!r.ok)throw Error('Impossibile creare il personaggio');
 const value=validateCharacterDraft((await characterApiJson(r)).character);
 if(value.ownerId!==ownerId||value.campaignId!==campaignId)throw Error('Campagna o proprietario non corrispondente');
 return value;
}

/** The original wizard returns Character & {player,notes}; keep its structure
 * but never trust ID, owner, campaign, or legacy Supabase image references. */
export async function saveFullCharacterSheet(fetchImpl,campaignId,characterId,character,ownerId){
 if(typeof character?.name!=='string'||character.name.trim().length<1||
  typeof campaignId!=='string'||typeof characterId!=='string')
  throw Error('Scheda personaggio non valida');
 const {id,player,...sheetData}=character;
 // Wizard's random client ID does not override authoritative Aruba draft UUID.
 if(/supabase[.]co/i.test(JSON.stringify(sheetData))||JSON.stringify(sheetData).includes('data:image/'))
  throw Error('Rimuovi i riferimenti alle immagini Supabase prima di salvare su Aruba.');
 const r=await fetchImpl('/vtt/characters/'+characterId,{
  method:'PUT',credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({campaignId,name:character.name.trim(),sheetData}),
 });
 if(r.status===401)throw Error('Sessione scaduta: effettua nuovamente il login.');
 if(r.status===404)throw Error('Personaggio non trovato o non autorizzato.');
 if(!r.ok)throw Error('Impossibile salvare la scheda completa.');
 const result=validateCharacterDraft((await characterApiJson(r)).character);
 if(result.ownerId!==ownerId||result.campaignId!==campaignId||result.id!==characterId||result.status!=='active')
  throw Error('Risposta della scheda non autorizzata.');
 return result;
}

export async function archiveOwnedCharacter(fetchImpl,campaignId,characterId,ownerId){
 if(!/^[0-9a-f-]{36}$/i.test(campaignId)||!/^[0-9a-f-]{36}$/i.test(characterId))
  throw Error('ID di campagna o personaggio non valido');
 const response=await fetchImpl('/vtt/characters/'+characterId,{
  method:'DELETE',credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({campaignId}),
 });
 if(response.status===401)throw Error('Sessione scaduta');
 if(response.status===404)throw Error('Personaggio non trovato o non autorizzato');
 if(!response.ok)throw Error('Impossibile archiviare il personaggio');
 const data=await characterApiJson(response);
 if(data.archivedId!==characterId)throw Error('Archiviazione non confermata');
 return data.archivedId;
}

export async function listOwnedCampaignRoster(fetchImpl,campaignId){
 if(typeof campaignId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId))
  throw new Error('Campagna non valida');
 const res=await fetchImpl('/vtt/campaigns/'+campaignId+'/roster',{
  method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
 });
 if(res.status===401)throw new Error('Sessione scaduta');
 if(res.status===403||res.status===404)throw new Error('Elenco partecipanti non autorizzato');
 if(!res.ok)throw new Error('Impossibile caricare i partecipanti');
 const data=await res.json();
 if(!Array.isArray(data.members)||data.members.length>101)
  throw new Error('Elenco partecipanti non valido');
 return data.members.map(m=>{
  if(!m||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.userId)||typeof m.displayName!=='string'||
   !m.displayName.trim()||!['gm','player'].includes(m.role))
   throw new Error('Partecipante non valido');
  return Object.freeze({userId:m.userId,displayName:m.displayName,role:m.role,
   joinedAt:m.joinedAt});
 });
}

export async function listCharacterAvailability(fetchImpl,campaignId){
 if(!/^[0-9a-f-]{36}$/i.test(campaignId))throw Error('Campagna non valida');
 const r=await fetchImpl('/vtt/character-availability?campaignId='+encodeURIComponent(campaignId),
 {method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
 if(r.status===401)throw Error('Sessione scaduta');
 if(!r.ok)throw Error('Disponibilità personaggi non disponibile');
 const data=await characterApiJson(r);
 if(!Array.isArray(data.characters)||data.characters.length>100)throw Error('Elenco disponibilità non valido');
 const map=new Map();
 for(const item of data.characters){
  if(!item||!/^[0-9a-f-]{36}$/i.test(item.id)||
   typeof item.availableForPlayers!=='boolean'||map.has(item.id))
   throw Error('Dato disponibilità non valido');
  map.set(item.id,item.availableForPlayers);
 }
 return map;
}
export async function setCharacterAvailability(fetchImpl,campaignId,characterId,value){
 if(!/^[0-9a-f-]{36}$/i.test(campaignId)||!/^[0-9a-f-]{36}$/i.test(characterId)||
  typeof value!=='boolean')throw Error('Dati disponibilità non validi');
 const r=await fetchImpl('/vtt/character-availability/'+characterId,{
  method:'PATCH',credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({campaignId,availableForPlayers:value}),
 });
 if(r.status===401)throw Error('Sessione scaduta');
 if(r.status===404)throw Error('Personaggio non autorizzato');
 if(!r.ok)throw Error('Impossibile cambiare disponibilità');
 const data=await characterApiJson(r);
 if(data.id!==characterId||data.availableForPlayers!==value)
  throw Error('Risposta disponibilità non valida');
 return data;
}

const assignmentUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Owner-only, explicitly gated API; never infer player ownership from a display name. */
export async function listCharacterAssignments(fetchImpl,campaignId){
 if(!assignmentUuid.test(campaignId))throw Error('Campagna non valida');
 const res=await fetchImpl('/vtt/character-assignments?campaignId='+encodeURIComponent(campaignId),{
  method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
 });
 if(res.status===401)throw Error('Sessione scaduta');
 if(!res.ok)throw Error('Assegnazioni non disponibili');
 const data=await characterApiJson(res);
 if(!Array.isArray(data.assignments)||data.assignments.length>100)throw Error('Elenco assegnazioni non valido');
 const result=new Map();
 for(const row of data.assignments){
  if(!row||!assignmentUuid.test(row.characterId)||!assignmentUuid.test(row.playerId)||
     result.has(row.characterId))throw Error('Assegnazione non valida');
  result.set(row.characterId,row.playerId);
 }
 return result;
}
export async function setCharacterAssignment(fetchImpl,campaignId,characterId,playerId){
 if(!assignmentUuid.test(campaignId)||!assignmentUuid.test(characterId)||
    (playerId!==null&&!assignmentUuid.test(playerId)))
  throw Error('Dati assegnazione non validi');
 const res=await fetchImpl('/vtt/character-assignments/'+characterId,{
  method:'PATCH',credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({campaignId,playerId}),
 });
 if(res.status===401)throw Error('Sessione scaduta');
 if(res.status===404)throw Error('Personaggio o giocatore non autorizzato');
 if(!res.ok)throw Error('Impossibile aggiornare l’assegnazione');
 const data=await characterApiJson(res);
 if(data.characterId!==characterId||data.playerId!==playerId)
  throw Error('Conferma assegnazione non valida');
 return data;
}

/** Assigned-player-only API; no writable character endpoint is used. */
export async function listJoinedPlayerCampaigns(fetchImpl){
 const r=await fetchImpl('/vtt/player-campaigns',{method:'GET',credentials:'same-origin',
  cache:'no-store',redirect:'error'});
 if(r.status===401)throw Error('Sessione scaduta');
 if(!r.ok)throw Error('Impossibile caricare le campagne a cui partecipi');
 const data=await characterApiJson(r);
 if(!Array.isArray(data.campaigns)||data.campaigns.length>100)
  throw Error('Elenco campagne non valido');
 const seen=new Set();
 return data.campaigns.map(c=>{
  const row=validateCampaign(c);
  if(seen.has(row.id))throw Error('Campagna duplicata');
  seen.add(row.id);return row;
 });
}
export async function listAssignedPlayerCharacters(fetchImpl,campaignId){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId))
  throw Error('Campagna non valida');
 const r=await fetchImpl('/vtt/player-characters?campaignId='+encodeURIComponent(campaignId),{
  method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
 if(r.status===401)throw Error('Sessione scaduta');
 if(!r.ok)throw Error('Impossibile caricare le schede assegnate');
 const data=await characterApiJson(r);
 if(!Array.isArray(data.characters)||data.characters.length>100)
  throw Error('Elenco schede non valido');
 const ids=new Set();
 return data.characters.map(c=>{
  const row=validateCharacterDraft(c);
  if(row.campaignId!==campaignId||row.status!=='active'||ids.has(row.id))
   throw Error('Scheda non autorizzata o duplicata');
  ids.add(row.id);return row;
 });
}

/** Binary portraits are kept separate from character.sheetData. Never save
 * data: URLs into the character JSON, never trust an owner ID from the UI. */
const MEDIA_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function portraitEndpoint(campaignId,characterId){
 if(!MEDIA_ID.test(campaignId)||!MEDIA_ID.test(characterId))
  throw Error('Identificativo del ritratto non valido');
 return '/vtt/character-portrait/'+characterId+'?campaignId='+campaignId;
}
export async function readCharacterPortrait(fetchImpl,campaignId,characterId){
 const endpoint=portraitEndpoint(campaignId,characterId);
 const r=await fetchImpl(endpoint,{method:'GET',credentials:'same-origin',
  cache:'no-store',redirect:'error'});
 if(r.status===404)return null;
 if(r.status===401)throw Error('Sessione scaduta');
 if(!r.ok)throw Error('Ritratto Aruba non disponibile');
 const value=await characterApiJson(r);
 if(!value||value.characterId!==characterId||
  !['image/png','image/jpeg','image/webp'].includes(value.mimeType)||
  typeof value.dataBase64!=='string'||value.dataBase64.length>699052||
  value.dataBase64.length<16||!(/^[A-Za-z0-9+/]+={0,2}$/).test(value.dataBase64))
  throw Error('Formato immagine Aruba non valido');
 return 'data:'+value.mimeType+';base64,'+value.dataBase64;
}
export async function saveCharacterPortrait(fetchImpl,campaignId,characterId,blob){
 const endpoint=portraitEndpoint(campaignId,characterId);
 if(!(blob instanceof Blob)||blob.type!=='image/jpeg'||blob.size<12||
  blob.size>524288)throw Error('Ritratto troppo grande: massimo 512 KB JPEG');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 // Small bounded payload; avoid locale-dependent string conversion.
 let raw='';
 for(let offset=0;offset<bytes.length;offset+=8192)
  raw+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
 const dataBase64=btoa(raw);
 const r=await fetchImpl(endpoint,{method:'PUT',credentials:'same-origin',
  cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({campaignId,mimeType:'image/jpeg',dataBase64})});
 if(r.status===401)throw Error('Sessione scaduta');
 if(r.status===404)throw Error('Ritratto non autorizzato');
 if(!r.ok)throw Error('Salvataggio ritratto non riuscito');
 const answer=await characterApiJson(r);
 if(answer?.stored!==true||answer?.characterId!==characterId)
  throw Error('Conferma del ritratto non valida');
 // This URL lives in-memory only; never passed to saveFullCharacterSheet.
 return {publicUrl:'data:image/jpeg;base64,'+dataBase64};
}

/** Owner-only original JPEG. Unlike cropped portraits, a player can NEVER
 * access this endpoint; SQL rechecks active GM ownership on every request. */
function portraitSourceEndpoint(campaignId,characterId){
 portraitEndpoint(campaignId,characterId);
 return '/vtt/character-portrait-source/'+characterId+'?campaignId='+campaignId;
}
export async function readCharacterPortraitSource(fetchImpl,campaignId,characterId){
 const r=await fetchImpl(portraitSourceEndpoint(campaignId,characterId),{
  method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
 if(r.status===404)return null;
 if(r.status===401)throw Error('Sessione scaduta');
 if(!r.ok)throw Error('Sorgente ritratto non disponibile');
 const data=await characterApiJson(r);
 if(data?.characterId!==characterId||data.mimeType!=='image/jpeg'||
   typeof data.dataBase64!=='string'||data.dataBase64.length<16||
   data.dataBase64.length>2796208||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(data.dataBase64))
  throw Error('Risposta sorgente non valida');
 return 'data:image/jpeg;base64,'+data.dataBase64;
}
export async function saveCharacterPortraitSource(fetchImpl,campaignId,characterId,blob){
 const endpoint=portraitSourceEndpoint(campaignId,characterId);
 if(!(blob instanceof Blob)||blob.type!=='image/jpeg'||
    blob.size<12||blob.size>2097152)
  throw Error('Sorgente JPEG troppo grande: massimo 2 MB');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 let raw='';
 for(let i=0;i<bytes.length;i+=8192)
  raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const dataBase64=btoa(raw);
 const r=await fetchImpl(endpoint,{method:'PUT',credentials:'same-origin',
  cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({campaignId,mimeType:'image/jpeg',dataBase64})});
 if(r.status===401)throw Error('Sessione scaduta');
 if(r.status===404)throw Error('Sorgente non autorizzata');
 if(!r.ok)throw Error('Salvataggio sorgente non riuscito');
 const data=await characterApiJson(r);
 if(data?.characterId!==characterId||data.stored!==true)
  throw Error('Conferma sorgente non valida');
 return {publicUrl:'data:image/jpeg;base64,'+dataBase64};
}
