/**
 * Aruba-native transport for the ORIGINAL custom entity tab model.
 * Not activated in UI until TipTap and entity permissions are migrated.
 * Never carries identity or bearer data from the browser to the server.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeId=(value,name)=>{
 if(typeof value!=='string'||!UUID.test(value))throw Error(name+' non valido');
 return value;
};
function normalizeNote(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||!UUID.test(x.id)||
 typeof x.tab_name!=='string'||typeof x.content!=='string'||
 (x.content_rich!==null&&(typeof x.content_rich!=='object'||Array.isArray(x.content_rich)))||
 !Number.isInteger(x.position)||typeof x.hidden!=='boolean'||
 !['all','private'].includes(x.visibility))throw Error('Risposta note Aruba non valida');
 return {
  ...x,folder_id:null,tab_order:Array.isArray(x.tab_order)?x.tab_order:null,
  parent_note_id:x.parent_note_id??null,owner_profile_id:null,
  // Structural fields required by the original EntityCustomTab model;
  // permission checks remain on the Aruba server.
 };
}
async function jsonResponse(response){
 if(response.status===401)throw Error('Sessione scaduta');
 if(response.status===404)throw Error('Note non disponibili o non autorizzate');
 if(!response.ok)throw Error('Operazione sulle note non riuscita');
 const type=response.headers?.get?.('content-type')??'application/json';
 if(!type.includes('application/json'))throw Error('Il server note non ha restituito JSON');
 return response.json();
}
const options=(method,body)=>({
 method,credentials:'same-origin',cache:'no-store',redirect:'error',
 headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{}),
});
export async function listArubaEntityNotes(fetchImpl,campaignId,characterId,parentId=null){
 safeId(campaignId,'Campagna');safeId(characterId,'Personaggio');
 if(parentId!==null)safeId(parentId,'Nota padre');
 const query=new URLSearchParams({campaignId,characterId,...(parentId===null?{}:{parentId})});
 const data=await jsonResponse(await fetchImpl('/vtt/entity-notes?'+query,options('GET')));
 if(!Array.isArray(data.notes)||data.notes.length>100)throw Error('Elenco note non valido');
 return data.notes.map(normalizeNote);
}
export async function createArubaEntityNote(fetchImpl,campaignId,characterId,tabName,parentId=null){
 safeId(campaignId,'Campagna');safeId(characterId,'Personaggio');
 if(typeof tabName!=='string'||!tabName.trim()||tabName.trim().length>120)
  throw Error('Nome nota non valido');
 if(parentId!==null)safeId(parentId,'Nota padre');
 const data=await jsonResponse(await fetchImpl('/vtt/entity-notes',
  options('POST',{campaignId,characterId,tabName:tabName.trim(),...(parentId===null?{}:{parentId})})));
 return normalizeNote(data.note);
}
export async function saveArubaEntityNote(fetchImpl,campaignId,characterId,noteId,note){
 safeId(campaignId,'Campagna');safeId(characterId,'Personaggio');safeId(noteId,'Nota');
 const allowed=['tab_name','content','content_rich','position','hidden','visibility'];
 if(!note||typeof note!=='object'||allowed.some(k=>!Object.hasOwn(note,k)))
  throw Error('Nota incompleta');
 const body={
  campaignId,characterId,tabName:note.tab_name,
  content:note.content,contentRich:note.content_rich,
  position:note.position,hidden:note.hidden,visibility:note.visibility,
 };
 const data=await jsonResponse(await fetchImpl('/vtt/entity-notes/'+noteId,
  options('PATCH',body)));
 const value=normalizeNote(data.note);
 if(value.id!==noteId)throw Error('Nota non corrispondente');
 return value;
}
export async function archiveArubaEntityNote(fetchImpl,campaignId,characterId,noteId){
 safeId(campaignId,'Campagna');safeId(characterId,'Personaggio');safeId(noteId,'Nota');
 const data=await jsonResponse(await fetchImpl('/vtt/entity-notes/'+noteId,
  options('DELETE',{campaignId,characterId})));
 if(data.archivedId!==noteId)throw Error('Archiviazione nota non confermata');
 return noteId;
}

export async function setArubaSubtabOrder(fetchImpl,campaignId,characterId,parentId,order){
 safeId(campaignId,'Campagna');safeId(characterId,'Personaggio');safeId(parentId,'Nota padre');
 if(!Array.isArray(order)||order.length>100||order.some(id=>typeof id!=='string'||!UUID.test(id))||
   new Set(order).size!==order.length)throw Error('Ordine sottoschede non valido');
 const data=await jsonResponse(await fetchImpl('/vtt/entity-notes/order/'+parentId,
  options('PATCH',{campaignId,characterId,tabOrder:order})));
 if(data.parentId!==parentId||JSON.stringify(data.tabOrder)!==JSON.stringify(order))
  throw Error('Ordine sottoschede non confermato');
 return data.tabOrder;
}
