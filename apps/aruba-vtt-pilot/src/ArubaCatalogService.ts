// Isolated original-UI contract only; NOT enabled in the public build.
// Native catalog and logical characters have different identities/lifecycles.
// Missing migrations fail explicitly instead of issuing the wrong mutation.
import {createCatalogClient,catalogData,originalCatalogEntity,unavailableCatalogAction} from './catalog-client.mjs';
import {createLogicalCharacterCatalogClient} from './logical-character-catalog-client.mjs';
import type {NPC,Monster} from '../../../src/services/supabase/entitiesService';
export type {NPC,Monster};
const client=createCatalogClient((...args:Parameters<typeof fetch>)=>fetch(...args),{native:true});
const logicalClient=createLogicalCharacterCatalogClient((...args:Parameters<typeof fetch>)=>fetch(...args));
const entries=new Map<string,any>();
const duplicatedNotes=new Set<string>();
let actorId:string|null=null;
function actor(){
 const user=(globalThis as any).__HG_ARUBA_TOPBAR_IDENTITY__;
 if(!user?.id)throw Error('Sessione catalogo Aruba mancante');
 if(actorId!==user.id){entries.clear();duplicatedNotes.clear();actorId=user.id;}
 return user.id as string;
}
async function json(url:string,method='GET',body?:unknown){
 const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',redirect:'error',
  ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 if(!response.ok)throw Error(`Operazione Aruba non riuscita (${response.status}).`);
 return response.json();
}
function remember(item:any){
 if(item.ownerId!==actor())throw Error('Sessione catalogo cambiata: ricarica la pagina.');
 entries.set(item.id,{...item,storage:'native'});
 return originalCatalogEntity(item);
}
function observed(kind:string,id:string){
 const row=entries.get(id);
 if(!row||row.kind!==kind)throw Error('Ricarica il contenuto prima di modificarlo.');
 return row;
}
function rememberLogical(row:any){
 if(row.logicalOwnerId!==actor())throw Error('Sessione catalogo cambiata');
 entries.set(row.id,{...row,kind:'characters',storage:'logical'});
 return {...row.sheetData,id:row.id,name:row.name,campaignId:row.campaignId,
  ownerProfileId:row.logicalOwnerId,originalOwnerProfileId:row.originalOwnerId,
  availableForPlayers:row.availableForPlayers,claimableOrigin:row.claimableOrigin,
  ruleset:row.ruleset,createdAt:row.createdAt,updatedAt:row.updatedAt,_arubaRevision:row.revision};
}
async function nativeList(kind:string,ownerId:string){
 if(ownerId!==actor())throw Error('Proprietario catalogo non coerente');
 return (await client.list(kind,ownerId)).map(remember);
}
async function saveNative(kind:string,entity:any,ruleset?:string){
 const ownerId=actor(),known=entries.get(entity.id);
 if(entity.ownerProfileId!==undefined&&entity.ownerProfileId!==ownerId)
  throw Error('Sessione catalogo cambiata: nessuna modifica eseguita.');
 if(known?.status==='archived')throw Error('Contenuto archiviato: nessuna modifica eseguita.');
 // Never flatten a historical/logical record into the native unassigned table.
 if(known&&known.storage!=='native')return unavailableCatalogAction();
 if(known?.kind&&known.kind!==kind)throw Error('Tipo contenuto non coerente');
 // Binary media require their own revisioned endpoint, not JSON sheet fields.
 if(['portraitImageUrl','portraitSourceImageUrl','coverImageUrl','imageUrl'].some(key=>entity[key]))
  throw Error('Salvataggio immagini catalogo non ancora migrato: nessuna modifica eseguita.');
 const body={name:entity.name,ruleset:ruleset??entity.ruleset,data:catalogData(entity)};
 const item=known?
  await client.save(kind,known.id,ownerId,{...body,revision:known.revision}):
  await client.create(kind,ownerId,body);
 return remember(item);
}
async function duplicate(kind:string,id:string){
 const ownerId=actor(),source=observed(kind,id);
 if(source.storage!=='native')return unavailableCatalogAction();
 const item=await client.duplicate(kind,id,ownerId,source.revision,crypto.randomUUID());
 duplicatedNotes.add(`${kind}:${id}:${item.id}`);
 return remember(item);
}
async function copy(kind:string,id:string,targetCampaignId:string){
 const ownerId=actor(),source=observed(kind,id);
 if(source.storage!=='native')return unavailableCatalogAction();
 await client.copyToCampaign(kind,id,ownerId,source.revision,targetCampaignId);
}
export async function loadCharactersByOwner(ownerId:string){
 if(ownerId!==actor())throw Error('Proprietario catalogo non coerente');
 const native=await nativeList('characters',ownerId);
 const characters=(await logicalClient.list(ownerId)).map(rememberLogical);
 if(new Set([...characters,...native].map(row=>row.id)).size!==characters.length+native.length)
  throw Error('Identità personaggio ambigua');
 return [...characters,...native];
}
export async function saveCharacter(_campaignId:string|null,character:any,ownerId:string,ruleset?:string){
 if(ownerId!==actor())throw Error('Proprietario catalogo non coerente');
 if(character.ownerProfileId!==undefined&&character.ownerProfileId!==ownerId)
  throw Error('Sessione catalogo cambiata: nessuna modifica eseguita.');
 const source=entries.get(character.id);
 if(source?.status==='archived')throw Error('Personaggio archiviato: nessuna modifica eseguita.');
 if(source?.storage==='native')return saveNative('characters',character,ruleset);
 const body={name:character.name,ruleset:source?source.ruleset:ruleset??character.ruleset,sheetData:catalogData(character)};
 const saved=source?await logicalClient.save(ownerId,source.id,{...body,revision:source.revision}):
  await logicalClient.create(ownerId,body);
 return rememberLogical(saved);
}
export async function deleteCharacter(id:string){
 const ownerId=actor(),source=observed('characters',id);
 if(source.storage==='native')return archiveNative('characters',id);
 const archived=await logicalClient.archive(ownerId,id,source.revision);
 if(actor()!==ownerId)throw Error('Sessione catalogo cambiata');
 entries.set(id,{...archived,kind:'characters',storage:'logical'});
}
export const loadAvailableCharactersForInvite=unavailableCatalogAction;
export async function assignCharacterToCampaign(id:string,_base:string,_token:string,body:any){
 actor();const source=observed('characters',id);
 if(source.storage!=='logical'||!Object.hasOwn(body,'campaignId'))return unavailableCatalogAction();
 const result=await json(`/vtt/characters/${id}/campaign`,'PATCH',{campaignId:body.campaignId});
 rememberLogical(await logicalClient.read(actor(),id));
 return {campaignId:result.assignment.campaignId};
}
export async function unassignCharacterFromCampaign(id:string,base:string,token:string){
 await assignCharacterToCampaign(id,base,token,{campaignId:null});
}
export async function duplicateCharacter(id:string,ownerId:string){
 if(ownerId!==actor())throw Error('Proprietario catalogo non coerente');
 const source=observed('characters',id);
 if(source.storage==='native')return duplicate('characters',id);
 const saved=await logicalClient.duplicate(ownerId,id,source.revision,crypto.randomUUID());
 duplicatedNotes.add(`characters:${id}:${saved.id}`);
 return rememberLogical(saved);
}
export async function setCharacterAvailableForPlayers(id:string,available:boolean){
 actor();const source=observed('characters',id);
 if(source.storage!=='logical'||!source.campaignId)return unavailableCatalogAction();
 await json(`/vtt/character-availability/${id}`,'PATCH',
  {campaignId:source.campaignId,availableForPlayers:available});
 const fresh=await logicalClient.read(actor(),id);
 if(fresh.availableForPlayers!==available)throw Error('Disponibilità personaggio non confermata');
 rememberLogical(fresh);
}
export async function loadAvailableCharactersInCampaigns(campaignIds:string[]){
 actor();const result:any[]=[];
 for(const id of new Set(campaignIds)){
  const page=await json('/vtt/player-character-claims?campaignId='+encodeURIComponent(id));
  if(!Array.isArray(page.characters))throw Error('Elenco personaggi richiedibili non valido');
  for(const row of page.characters)result.push({...row.sheetData,...row,ownerProfileId:row.ownerId});
 }
 return result;
}
export async function claimCharacter(id:string){
 actor();const result=await json(`/vtt/player-characters/${id}/claim`,'POST');
 return {campaignId:result.campaignId??null};
}
export async function releaseCharacter(id:string){
 actor();await json(`/vtt/player-characters/${id}/release`,'POST');
}
export function isLastActiveCharacterForOwner<T extends {id:string;ownerProfileId?:string|null}>(
 campaignCharacters:T[],characterId:string,ownerId:string|null|undefined){
 return !!ownerId&&!campaignCharacters.some(row=>row.id!==characterId&&row.ownerProfileId===ownerId);
}
export const loadNPCsByOwner=(ownerId:string)=>nativeList('npcs',ownerId);
export const loadMonstersByOwner=(ownerId:string)=>nativeList('monsters',ownerId);
const GLOBAL_ENTRY_UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateGlobalEntry(item:any){
 if(!item||typeof item!=='object'||(item.kind!=='characters'&&item.kind!=='npcs'&&item.kind!=='monsters')||
    !GLOBAL_ENTRY_UUID_RE.test(item.id)||item.ownerId!==actor()||item.status!=='active'||
    typeof item.name!=='string'||typeof item.data!=='object'||item.data===null)
  throw Error('Elemento catalogo globale non valido');
 return item;
}
async function nativeGlobalList(kind:string,after?:string){
 const url='/vtt/catalog/native/global/'+kind+(after?'?after='+encodeURIComponent(after):'');
 const items=await json(url);
 if(!Array.isArray(items)||items.length>101)throw Error('Pagina catalogo globale non valida');
 return items.map(validateGlobalEntry);
}
export async function loadNativeGlobalEntries(kind:string){return nativeGlobalList(kind);}
export async function saveNativeGlobalMedia(kind:string,id:string,revision:number,role:string,mimeType:string,dataBase64:string){
 if(!GLOBAL_ENTRY_UUID_RE.test(id)||!['portrait','source','cover'].includes(role))throw Error('IDENTITA_MEDIA_INVALIDA');
 return validateGlobalEntry(await json('/vtt/catalog/native/global/'+kind+'/'+id+'/media/'+role,'PUT',{revision,mimeType,dataBase64}));
}
export async function readNativeGlobalMedia(kind:string,id:string,role:string){
 if(!GLOBAL_ENTRY_UUID_RE.test(id)||!['portrait','source','cover'].includes(role))throw Error('IDENTITA_MEDIA_INVALIDA');
 return json('/vtt/catalog/native/global/'+kind+'/'+id+'/media/'+role);
}
export async function listNativeGlobalNotes(kind:string,id:string){
 if(!GLOBAL_ENTRY_UUID_RE.test(id))throw Error('IDENTITA_NOTA_INVALIDA');
 return json('/vtt/catalog/native/global/'+kind+'/'+id+'/notes');
}
export async function createNativeGlobalNote(kind:string,id:string,revision:number,name:string){
 if(!GLOBAL_ENTRY_UUID_RE.test(id)||!name)throw Error('IDENTITA_NOTA_INVALIDA');
 return json('/vtt/catalog/native/global/'+kind+'/'+id+'/notes','POST',{revision,name});
}

const CAMPAIGN_UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateNativeCampaignItems(items:any){
 if(!Array.isArray(items)||items.length>101)throw Error('Pagina catalogo nativo di campagna non valida');
 return items.map((item:any)=>{
  if(!item||typeof item!=='object'||(item.kind!=='characters'&&item.kind!=='npcs'&&item.kind!=='monsters')||
     !CAMPAIGN_UUID_RE.test(item.id)||item.ownerId!==actor()||!CAMPAIGN_UUID_RE.test(item.campaignId)||
     typeof item.name!=='string'||item.status!=='active'||typeof item.data!=='object')
   throw Error('Elemento catalogo nativo di campagna non valido');
  return item;
 });
}
async function nativeCampaignList(kind:string,campaignId:string){
 if(!CAMPAIGN_UUID_RE.test(campaignId))throw Error('CAMPAIGN_ID_INVALID');
 const items=await json('/vtt/catalog/native/by-campaign/'+kind+'/'+campaignId);
 return validateNativeCampaignItems(items);
}
export async function loadNPCsByCampaign(campaignId:string){return nativeCampaignList('npcs',campaignId);}
export async function loadMonstersByCampaign(campaignId:string){return nativeCampaignList('monsters',campaignId);}

const STORICO_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateStoricoPage(page:any){
 if(!page||typeof page!=='object'||!Array.isArray(page.items)||page.items.length>100||
    (page.nextCursor!==null&&typeof page.nextCursor!=='string'))
  throw Error('Pagina storico PNG/Mostri non valida');
 for(const item of page.items){
  if(!item||typeof item!=='object'||!STORICO_ID.test(item.id)||
     (item.campaignId!==null&&!STORICO_ID.test(item.campaignId))||
     !['npcs','monsters'].includes(item.storicoType)||!item.name)
   throw Error('Elemento storico PNG/Mostri non valido');
 }
 return {items:page.items,nextCursor:page.nextCursor};
}
export async function loadStoricoPngMostri(){
 return validateStoricoPage(await json('/vtt/storico/png-mostri'));
}
export async function loadChapters(campaignId:string){
 actor();const page=await json(`/vtt/campaigns/${campaignId}/chapters`);
 if(!Array.isArray(page.chapters))throw Error('Elenco capitoli non valido');
 return page.chapters;
}
async function assignNative(kind:string,id:string,target:string|null){
 const ownerId=actor(),source=observed(kind,id);
 if(source.storage!=='native')return unavailableCatalogAction();
 return remember(await client.assign(kind,id,ownerId,source.revision,target));
}
async function archiveNative(kind:string,id:string){
 const ownerId=actor(),source=observed(kind,id);
 if(source.storage!=='native')return unavailableCatalogAction();
 const result=await client.archive(kind,id,ownerId,source.revision);
 if(actor()!==ownerId)throw Error('Sessione catalogo cambiata');
 // Keep a tombstone: a delayed autosave must not recreate the deleted record.
 entries.set(id,{...result.item,storage:'native'});
}
export const assignNPCToCampaign=(id:string,_ruleset:unknown,campaign:{id:string})=>assignNative('npcs',id,campaign.id);
export const assignMonsterToCampaign=(id:string,_ruleset:unknown,campaign:{id:string})=>assignNative('monsters',id,campaign.id);
export const unassignNPCFromCampaign=(id:string)=>assignNative('npcs',id,null);
export const unassignMonsterFromCampaign=(id:string)=>assignNative('monsters',id,null);
export const deleteNPC=(id:string)=>archiveNative('npcs',id);
export const deleteMonster=(id:string)=>archiveNative('monsters',id);
export const copyNPCToCampaign=(id:string,target:string)=>copy('npcs',id,target);
export const copyMonsterToCampaign=(id:string,target:string)=>copy('monsters',id,target);
export const duplicateNPC=(id:string)=>duplicate('npcs',id);
export const duplicateMonster=(id:string)=>duplicate('monsters',id);
export const saveNPC=(_campaignId:string|null,npc:NPC)=>saveNative('npcs',npc);
export const saveMonster=(_campaignId:string|null,monster:Monster)=>saveNative('monsters',monster);
export async function duplicateEntityNotes(entityType:string,sourceId:string,newId:string){
 const kind={character:'characters',npc:'npcs',monster:'monsters'}[entityType];
 actor();
 if(!kind||!duplicatedNotes.has(`${kind}:${sourceId}:${newId}`))
  throw Error('La duplicazione atomica delle note non è stata confermata.');
 // Proven atomic duplication already included notes; do not copy them twice.
}
