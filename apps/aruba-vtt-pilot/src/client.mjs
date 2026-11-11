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
    (c.characters.read&&!c.campaigns.read)||c.gameSession!==false)
    throw new Error('Funzionalità non autorizzate');
  return Object.freeze({
    id:data.user.id,email:data.user.email,displayName:data.user.displayName,role:data.user.role,
    campaignsEnabled:c.campaigns.read,charactersEnabled:c.characters.read,
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
export async function listCharacterDrafts(fetchImpl,campaignId,ownerId){
 const r=await fetchImpl('/vtt/characters?campaignId='+encodeURIComponent(campaignId),{
  method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
 if(r.status===401)throw Error('Sessione scaduta');
 if(!r.ok)throw Error('Impossibile caricare i personaggi');
 const data=await r.json();
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
 const value=validateCharacterDraft((await r.json()).character);
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
 if(JSON.stringify(sheetData).includes('supabase.co')||JSON.stringify(sheetData).includes('data:image/'))
  throw Error('Rimuovi i riferimenti alle immagini Supabase prima di salvare su Aruba.');
 const r=await fetchImpl('/vtt/characters/'+characterId,{
  method:'PUT',credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({campaignId,name:character.name.trim(),sheetData}),
 });
 if(r.status===401)throw Error('Sessione scaduta: effettua nuovamente il login.');
 if(r.status===404)throw Error('Personaggio non trovato o non autorizzato.');
 if(!r.ok)throw Error('Impossibile salvare la scheda completa.');
 const result=validateCharacterDraft((await r.json()).character);
 if(result.ownerId!==ownerId||result.campaignId!==campaignId||result.id!==characterId||result.status!=='active')
  throw Error('Risposta della scheda non autorizzata.');
 return result;
}
