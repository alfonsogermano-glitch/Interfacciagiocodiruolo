import {validateOriginalEntityFields,NarrativeContentRejected} from './narrative-content-contract.mjs';

export class CatalogRejected extends Error{
 constructor(message,status=400){super(message);this.status=status;}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CATALOG_KINDS=Object.freeze(['characters','npcs','monsters']);
const RULESETS=['hsc','dnd5e','pathfinder','coc7e','cocclassic','custom'];
const RESERVED=new Set(['id','kind','name','ruleset','ownerId','ownerProfileId','owner_id','owner_profile_id',
 'campaignId','campaign_id','revision','createdAt','updatedAt','status','sourceRecord','sourceCampaignId',
 'availableForPlayers','claimableOrigin','originalOwnerProfileId','chapterId','sceneId','environmentId',
 'mapLocationId','folderId','portraitImageUrl','portraitSourceImageUrl','coverImageUrl','imageUrl',
 'portraitAssetId','portraitFrameAssetId','coverFrameAssetId']);
export function catalogId(value){
 if(typeof value!=='string'||!UUID.test(value))throw new CatalogRejected('Identificatore catalogo non valido');
 return value.toLowerCase();
}
export function catalogKind(value){
 if(!CATALOG_KINDS.includes(value))throw new CatalogRejected('Tipo catalogo non valido');
 return value;
}
export function catalogRevision(value){
 if(!Number.isInteger(value)||value<1||value>=2147483647)throw new CatalogRejected('Revisione catalogo non valida');
 return value;
}
const plain=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;
function safeTree(value,depth=0){
 if(depth>12)return false;
 if(value===null||typeof value==='boolean')return true;
 if(typeof value==='string')return value.length<=50000;
 if(typeof value==='number')return Number.isFinite(value);
 if(Array.isArray(value))return value.length<=1000&&value.every(item=>safeTree(item,depth+1));
 return plain(value)&&Object.keys(value).length<=250&&Object.entries(value).every(([key,item])=>
  key.length<=100&&!['__proto__','prototype','constructor'].includes(key)&&safeTree(item,depth+1));
}
export function validateUnassignedCatalogBody(kind,body,{saving=false}={}){
 catalogKind(kind);
 if(!plain(body)||Object.keys(body).sort().join(',')!==(saving?'data,name,revision,ruleset':'data,name,ruleset'))
  throw new CatalogRejected('Dati catalogo non validi');
 if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>(kind==='characters'?120:200)||
    !RULESETS.includes(body.ruleset)||!plain(body.data)||!safeTree(body.data)||
    Object.keys(body.data).some(key=>RESERVED.has(key)))throw new CatalogRejected('Contenuto catalogo non valido');
 const serialized=JSON.stringify(body.data);
 if(Buffer.byteLength(serialized,'utf8')>90000||/supabase\.(?:co|in)|data:image\//i.test(serialized))
  throw new CatalogRejected('Contenuto troppo grande o con media non migrati');
 if(kind==='characters'){
  if(['style','viaggio'].some(key=>typeof body.data[key]!=='string')||
   ['ambiti','abilita'].some(key=>!plain(body.data[key]))||
   ['tratti','equipment'].some(key=>!Array.isArray(body.data[key])))throw new CatalogRejected('Scheda personaggio non valida');
 }else{
  try{validateOriginalEntityFields(kind,body.data);}
  catch(error){if(error instanceof NarrativeContentRejected)throw new CatalogRejected(error.message);throw error;}
 }
 return {name:body.name.trim(),ruleset:body.ruleset,data:structuredClone(body.data),
  ...(saving?{revision:catalogRevision(body.revision)}:{})};
}

export function catalogMediaRole(role){
 if(!['portrait','source','cover'].includes(role))throw new CatalogRejected('Tipo immagine catalogo non valido');
 return role;
}
export function validateCatalogMedia(role,body){
 catalogMediaRole(role);
 const max=role==='portrait'?524288:2097152;
 if(!plain(body)||Object.keys(body).sort().join(',')!=='dataBase64,mimeType,revision'||
  !['image/png','image/jpeg','image/webp'].includes(body.mimeType)||typeof body.dataBase64!=='string'||
  body.dataBase64.length>4*Math.ceil(max/3)||body.dataBase64.length<16||body.dataBase64.length%4!==0||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(body.dataBase64))throw new CatalogRejected('Immagine catalogo non valida');
 const bytes=Buffer.from(body.dataBase64,'base64');
 if(bytes.length<12||bytes.length>max||bytes.toString('base64')!==body.dataBase64)
  throw new CatalogRejected('Dimensione immagine catalogo non valida');
 const valid=body.mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
  body.mimeType==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):
  bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid)throw new CatalogRejected('Formato immagine catalogo non coerente');
 return {revision:catalogRevision(body.revision),mimeType:body.mimeType,bytes};
}
