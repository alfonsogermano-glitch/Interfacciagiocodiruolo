// Native unassigned catalog only. This is NOT a historical/global-owner listing.
// Never convert assignment into copy, or make unavailable writes look successful.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS=['characters','npcs','monsters'];
const RESERVED=new Set(['id','kind','name','ruleset','ownerId','ownerProfileId','owner_id','owner_profile_id',
 'campaignId','campaign_id','revision','createdAt','updatedAt','status','sourceRecord','sourceCampaignId',
 'availableForPlayers','claimableOrigin','originalOwnerProfileId','chapterId','sceneId','environmentId',
 'mapLocationId','folderId','portraitImageUrl','portraitSourceImageUrl','coverImageUrl','imageUrl',
 'portraitAssetId','portraitFrameAssetId','coverFrameAssetId']);
export function catalogData(original){
 return Object.fromEntries(Object.entries(original).filter(([key,value])=>
  !RESERVED.has(key)&&!key.startsWith('_aruba')&&value!==undefined));
}
export function originalCatalogEntity(item){
 return {...item.data,id:item.id,name:item.name,ownerProfileId:item.ownerId,
  campaignId:item.campaignId,ruleset:item.ruleset,createdAt:item.createdAt,updatedAt:item.updatedAt,
  _arubaKind:item.kind,_arubaRevision:item.revision};
}
export function unavailableCatalogAction(){
 throw Error('Azione catalogo non ancora migrata: nessuna modifica eseguita.');
}
export function createCatalogClient(fetchImpl){
 if(typeof fetchImpl!=='function')throw TypeError('fetch required');
 const id=value=>{if(typeof value!=='string'||!UUID.test(value))throw Error('Identificatore catalogo non valido');return value;};
 const path=(kind,entityId)=>{
  if(!KINDS.includes(kind))throw Error('Tipo catalogo non valido');
  return `/vtt/catalog/unassigned/${kind}${entityId===undefined?'':'/'+id(entityId)}`;
 };
 const revision=value=>{
  if(!Number.isInteger(value)||value<1||value>=2147483647)throw Error('Ricarica il contenuto prima di modificarlo.');
  return value;
 };
 async function request(url,method='GET',body){
  const response=await fetchImpl(url,{method,credentials:'same-origin',cache:'no-store',redirect:'error',
   ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  if(!response.ok){
   const error=Error(response.status===409?'Il contenuto è cambiato: ricarica prima di salvare.':
    `Operazione catalogo non riuscita (${response.status}).`);
   error.status=response.status;throw error;
  }
  return response.json();
 }
 function check(item,kind,ownerId,entityId){
  if(!item||item.kind!==kind||item.ownerId!==ownerId||item.campaignId!==null||
   !item.data||typeof item.data!=='object'||Array.isArray(item.data)||
   (entityId!==undefined&&item.id!==entityId))throw Error('Risposta catalogo non coerente');
  id(item.id);revision(item.revision);
  return item;
 }
 return {
  async list(kind,ownerId){
   id(ownerId);const items=[],seen=new Set(),cursors=new Set();let cursor=null;
   do{
    const page=await request(path(kind)+(cursor?'?after='+encodeURIComponent(cursor):''));
    if(!Array.isArray(page.items)||page.items.length>100||
     !(page.nextCursor===null||typeof page.nextCursor==='string'))throw Error('Pagina catalogo non valida');
    for(const item of page.items){
     check(item,kind,ownerId);
     if(seen.has(item.id))throw Error('Contenuto catalogo duplicato');
     seen.add(item.id);items.push(item);
    }
    cursor=page.nextCursor;
    if(cursor!==null){
     id(cursor);
     if(page.items.length===0||cursor!==page.items.at(-1).id||cursors.has(cursor))
      throw Error('Cursore catalogo non valido');
     cursors.add(cursor);
    }
   }while(cursor!==null);
   return items;
  },
  async read(kind,entityId,ownerId){
   id(ownerId);const {item}=await request(path(kind,entityId));
   return check(item,kind,ownerId,entityId);
  },
  async create(kind,ownerId,draft){
   id(ownerId);const {item}=await request(path(kind),'POST',draft);
   return check(item,kind,ownerId);
  },
  async save(kind,entityId,ownerId,draft){
   id(ownerId);revision(draft.revision);
   const {item}=await request(path(kind,entityId),'PUT',draft);
   return check(item,kind,ownerId,entityId);
  },
  async duplicate(kind,entityId,ownerId,expectedRevision,requestId){
   id(ownerId);id(requestId);
   const {item}=await request(path(kind,entityId)+'/duplicate','POST',
    {revision:revision(expectedRevision),requestId});
   check(item,kind,ownerId);
   if(item.id===entityId)throw Error('Identità duplicazione catalogo non valida');
   return item;
  },
  async copyToCampaign(kind,entityId,ownerId,expectedRevision,targetCampaignId){
   id(ownerId);id(targetCampaignId);
   const {item}=await request(path(kind,entityId)+'/campaign','POST',
    {revision:revision(expectedRevision),targetCampaignId});
   if(!item||item.kind!==kind||item.ownerId!==ownerId||item.campaignId!==targetCampaignId||
    item.id===entityId)throw Error('Risposta copia catalogo non coerente');
   id(item.id);revision(item.revision);
   return item;
  },
 };
}
