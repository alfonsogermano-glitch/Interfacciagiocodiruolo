// Native catalog only: default unassigned, {native:true} includes assigned records.
// This is NOT a historical/global-owner listing.
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
export function validateCatalogImage(role,media){
 if(!['portrait','source','cover'].includes(role))throw Error('Tipo immagine catalogo non valido');
 const max=role==='portrait'?524288:2097152;
 if(!media||!['image/png','image/jpeg','image/webp'].includes(media.mimeType)||
  typeof media.dataBase64!=='string'||media.dataBase64.length<16||
  media.dataBase64.length>4*Math.ceil(max/3)||media.dataBase64.length%4!==0||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(media.dataBase64))throw Error('Immagine catalogo non valida');
 const binary=atob(media.dataBase64);
 if(binary.length<12||binary.length>max||btoa(binary)!==media.dataBase64)
  throw Error('Dimensione immagine catalogo non valida');
 const valid=media.mimeType==='image/png'?binary.slice(0,8)==='\x89PNG\r\n\x1a\n':
  media.mimeType==='image/jpeg'?binary.slice(0,3)==='\xff\xd8\xff':
  binary.slice(0,4)==='RIFF'&&binary.slice(8,12)==='WEBP';
 if(!valid)throw Error('Formato immagine catalogo non coerente');
 return {mimeType:media.mimeType,dataBase64:media.dataBase64};
}
export function createCatalogClient(fetchImpl,{native=false}={}){
 if(typeof fetchImpl!=='function')throw TypeError('fetch required');
 const id=value=>{if(typeof value!=='string'||!UUID.test(value))throw Error('Identificatore catalogo non valido');return value;};
 const path=(kind,entityId)=>{
  if(!KINDS.includes(kind))throw Error('Tipo catalogo non valido');
  return `/vtt/catalog/${native?'native':'unassigned'}/${kind}${entityId===undefined?'':'/'+id(entityId)}`;
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
 function check(item,kind,ownerId,entityId,status='active'){
  if(!item||item.kind!==kind||item.ownerId!==ownerId||(!native&&item.campaignId!==null)||
   (native&&item.status!==status)||
   !item.data||typeof item.data!=='object'||Array.isArray(item.data)||
   (entityId!==undefined&&item.id!==entityId))throw Error('Risposta catalogo non coerente');
  id(item.id);revision(item.revision);
  if(item.campaignId!==null)id(item.campaignId);
  return item;
 }
 function note(value,parentId){
  if(!value||typeof value.tab_name!=='string'||typeof value.content!=='string'||
   !Number.isInteger(value.position)||value.position<0||value.position>10000||
   typeof value.hidden!=='boolean'||!['all','private'].includes(value.visibility)||
   !(value.content_rich===null||value.content_rich&&typeof value.content_rich==='object'&&!Array.isArray(value.content_rich))||
   (parentId!==undefined&&value.parent_note_id!==parentId))throw Error('Risposta nota catalogo non valida');
  id(value.id);
  if(value.parent_note_id!==null)id(value.parent_note_id);
  if(value.tab_order!==null){
   if(!Array.isArray(value.tab_order)||value.tab_order.length>100||
    new Set(value.tab_order).size!==value.tab_order.length)throw Error('Ordine note catalogo non valido');
   value.tab_order.forEach(id);
  }
  return value;
 }
 function ack(result,kind,entityId,ownerId,expectedRevision){
  check(result.item,kind,ownerId,entityId);
  if(result.item.revision!==expectedRevision+1)throw Error('Revisione catalogo non confermata');
  return result;
 }
 return {
  async assign(kind,entityId,ownerId,expectedRevision,campaignId){
   if(!native||!['npcs','monsters'].includes(kind))return unavailableCatalogAction();
   id(ownerId);revision(expectedRevision);if(campaignId!==null)id(campaignId);
   const result=await request(path(kind,entityId)+'/assignment','PATCH',
    {revision:expectedRevision,campaignId});
   ack(result,kind,entityId,ownerId,expectedRevision);
   if(result.item.campaignId!==campaignId)throw Error('Assegnazione catalogo non confermata');
   return result.item;
  },
  async archive(kind,entityId,ownerId,expectedRevision){
   if(!native)return unavailableCatalogAction();
   id(ownerId);revision(expectedRevision);
   const result=await request(path(kind,entityId),'DELETE',{revision:expectedRevision});
   check(result.item,kind,ownerId,entityId,'archived');
   if(result.archivedId!==entityId||result.item.revision!==expectedRevision+1)
    throw Error('Archiviazione catalogo non confermata');
   return result;
  },
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
   return ack({item},kind,entityId,ownerId,draft.revision).item;
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
    (native&&item.status!=='active')||
    item.id===entityId)throw Error('Risposta copia catalogo non coerente');
   id(item.id);revision(item.revision);
   return item;
  },
  async readMedia(kind,entityId,role){
   validateCatalogImageRole(role);
   const result=await request(path(kind,entityId)+'/media/'+role);
   revision(result.revision);validateCatalogImage(role,result);
   return result;
  },
  async saveMedia(kind,entityId,ownerId,expectedRevision,role,media){
   id(ownerId);revision(expectedRevision);
   const body={...validateCatalogImage(role,media),revision:expectedRevision};
   const result=await request(path(kind,entityId)+'/media/'+role,'PUT',body);
   return ack(result,kind,entityId,ownerId,expectedRevision).item;
  },
  async listNotes(kind,entityId,ownerId,parentId=null){
   id(ownerId);if(parentId!==null)id(parentId);
   const result=await request(path(kind,entityId)+'/notes'+(parentId===null?'':'?parentId='+parentId));
   check(result.item,kind,ownerId,entityId);
   if(!Array.isArray(result.notes)||result.notes.length>100||
    new Set(result.notes.map(n=>n?.id)).size!==result.notes.length)throw Error('Elenco note catalogo non valido');
   result.notes.forEach(value=>note(value,parentId));
   return result;
  },
  async createNote(kind,entityId,ownerId,expectedRevision,tabName,parentId=null){
   id(ownerId);revision(expectedRevision);if(parentId!==null)id(parentId);
   if(typeof tabName!=='string'||!tabName.trim()||tabName.trim().length>120)throw Error('Nome nota catalogo non valido');
   const result=await request(path(kind,entityId)+'/notes','POST',
    {revision:expectedRevision,tabName:tabName.trim(),...(parentId===null?{}:{parentId})});
   ack(result,kind,entityId,ownerId,expectedRevision);note(result.note,parentId);
   return result;
  },
  async saveNote(kind,entityId,ownerId,expectedRevision,noteId,value){
   id(ownerId);id(noteId);revision(expectedRevision);
   const result=await request(path(kind,entityId)+'/notes/'+noteId,'PUT',
    {revision:expectedRevision,tabName:value.tab_name,content:value.content,contentRich:value.content_rich,
     position:value.position,hidden:value.hidden,visibility:value.visibility});
   ack(result,kind,entityId,ownerId,expectedRevision);note(result.note);
   if(result.note.id!==noteId)throw Error('Salvataggio nota catalogo non confermato');
   return result;
  },
  async archiveNote(kind,entityId,ownerId,expectedRevision,noteId){
   id(ownerId);id(noteId);revision(expectedRevision);
   const result=await request(path(kind,entityId)+'/notes/'+noteId,'DELETE',{revision:expectedRevision});
   ack(result,kind,entityId,ownerId,expectedRevision);
   if(result.archivedId!==noteId)throw Error('Archiviazione nota catalogo non confermata');
   return result;
  },
  async reorderNotes(kind,entityId,ownerId,expectedRevision,parentId,tabOrder){
   id(ownerId);id(parentId);revision(expectedRevision);
   if(!Array.isArray(tabOrder)||tabOrder.length>100||new Set(tabOrder).size!==tabOrder.length)
    throw Error('Ordine sottoschede non valido');
   tabOrder.forEach(id);
   const result=await request(path(kind,entityId)+'/notes/'+parentId+'/order','PUT',
    {revision:expectedRevision,tabOrder});
   ack(result,kind,entityId,ownerId,expectedRevision);note(result.note,null);
   if(result.note.id!==parentId||JSON.stringify(result.note.tab_order)!==JSON.stringify(tabOrder))
    throw Error('Ordine sottoschede non confermato');
   return result;
  },
 };
}
function validateCatalogImageRole(role){
 if(!['portrait','source','cover'].includes(role))throw Error('Tipo immagine catalogo non valido');
}
