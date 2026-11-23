// Isolated original-UI contract only; NOT enabled in the public build.
// Native catalog and logical characters have different identities/lifecycles.
// Missing migrations fail explicitly instead of issuing the wrong mutation.
import {createCatalogClient,catalogData,originalCatalogEntity,unavailableCatalogAction} from './catalog-client.mjs';
import type {NPC,Monster} from '../../../src/services/supabase/entitiesService';
export type {NPC,Monster};
const client=createCatalogClient((...args:Parameters<typeof fetch>)=>fetch(...args));
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
async function nativeList(kind:string,ownerId:string){
 if(ownerId!==actor())throw Error('Proprietario catalogo non coerente');
 return (await client.list(kind,ownerId)).map(remember);
}
async function saveNative(kind:string,entity:any,ruleset?:string){
 const ownerId=actor(),known=entries.get(entity.id);
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
 const characters:any[]=[],cursors=new Set<string>();
 let cursor:string|null=null;
 do{
  const page=await json('/vtt/characters'+(cursor?'?after='+encodeURIComponent(cursor):''));
  if(!Array.isArray(page.characters))throw Error('Elenco personaggi non valido');
  for(const row of page.characters){
   if(actor()!==ownerId||row.logicalOwnerId!==ownerId)throw Error('Proprietà logica non coerente');
   entries.set(row.id,{...row,kind:'characters',storage:'logical'});
   characters.push({...row.sheetData,id:row.id,name:row.name,campaignId:row.campaignId,
    ownerProfileId:row.logicalOwnerId,originalOwnerProfileId:row.originalOwnerId,
    availableForPlayers:row.availableForPlayers,claimableOrigin:row.claimableOrigin,
    ruleset:row.ruleset,createdAt:row.createdAt,updatedAt:row.updatedAt});
  }
  cursor=page.nextCursor;
  if(cursor!==null){
   if(typeof cursor!=='string'||page.characters.length===0||cursors.has(cursor))throw Error('Cursore personaggi non valido');
   cursors.add(cursor);
  }
 }while(cursor!==null);
 return [...characters,...native];
}
export async function saveCharacter(_campaignId:string|null,character:any,ownerId:string,ruleset?:string){
 if(ownerId!==actor())throw Error('Proprietario catalogo non coerente');
 await saveNative('characters',character,ruleset);
}
export const deleteCharacter=unavailableCatalogAction;
export const loadAvailableCharactersForInvite=unavailableCatalogAction;
export async function assignCharacterToCampaign(id:string,_base:string,_token:string,body:any){
 actor();const source=observed('characters',id);
 if(source.storage!=='logical'||!Object.hasOwn(body,'campaignId'))return unavailableCatalogAction();
 const result=await json(`/vtt/characters/${id}/campaign`,'PATCH',{campaignId:body.campaignId});
 source.campaignId=result.assignment.campaignId;
 return {campaignId:result.assignment.campaignId};
}
export async function unassignCharacterFromCampaign(id:string,base:string,token:string){
 await assignCharacterToCampaign(id,base,token,{campaignId:null});
}
export const duplicateCharacter=(id:string,_ownerId:string)=>duplicate('characters',id);
export async function setCharacterAvailableForPlayers(id:string,available:boolean){
 actor();const source=observed('characters',id);
 if(source.storage!=='logical'||!source.campaignId)return unavailableCatalogAction();
 await json(`/vtt/character-availability/${id}`,'PATCH',
  {campaignId:source.campaignId,availableForPlayers:available});
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
export async function loadChapters(campaignId:string){
 actor();const page=await json(`/vtt/campaigns/${campaignId}/chapters`);
 if(!Array.isArray(page.chapters))throw Error('Elenco capitoli non valido');
 return page.chapters;
}
// Assignment is NOT copy. Missing move/archive transactions must not be faked.
export const assignNPCToCampaign=unavailableCatalogAction;
export const assignMonsterToCampaign=unavailableCatalogAction;
export const unassignNPCFromCampaign=unavailableCatalogAction;
export const unassignMonsterFromCampaign=unavailableCatalogAction;
export const deleteNPC=unavailableCatalogAction;
export const deleteMonster=unavailableCatalogAction;
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
