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
    c.characters?.read!==false||c.characters?.write!==false||c.gameSession!==false)
    throw new Error('Funzionalità non autorizzate');
  return Object.freeze({
    id:data.user.id,email:data.user.email,displayName:data.user.displayName,role:data.user.role,
    campaignsEnabled:c.campaigns.read,
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
