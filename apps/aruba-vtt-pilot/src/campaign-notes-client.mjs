// Native campaign Notes transport. NEVER mix with entity/character tabs.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeId=(value,label)=>{if(typeof value!=='string'||!UUID.test(value))throw Error(label+' non valido');return value;};
const opts=(method,body)=>({method,credentials:'same-origin',cache:'no-store',redirect:'error',
 headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})});
async function json(response){
 if(response.status===401)throw Error('Sessione scaduta');
 if(response.status===404)throw Error('Nota non disponibile o non autorizzata');
 if(!response.ok)throw Error('Operazione Note non riuscita');
 if(!(response.headers?.get?.('content-type')??'').toLowerCase().includes('application/json'))
  throw Error('Il server Note non ha restituito JSON');
 try{return await response.json();}catch{throw Error('Risposta Note non valida');}
}
const rich=x=>x===null||(x&&typeof x==='object'&&!Array.isArray(x));
function normalize(note,campaignId,parentId){
 if(!note||typeof note!=='object'||Array.isArray(note)||!UUID.test(note.id)||
  typeof note.title!=='string'||!note.title.trim()||note.title.length>120||
  !rich(note.contentRich)||!Number.isInteger(note.position)||note.position<0||
  note.position>10000||!['all','private'].includes(note.visibility)||
  (note.parentId!==null&&!UUID.test(note.parentId)))
  throw Error('Documento Note non valido');
 if(note.parentId!==parentId)throw Error('Sottoscheda di una nota differente');
 if(note.scope!==undefined&&!['shared','gm'].includes(note.scope))throw Error('Sezione Nota non valida');
 if(note.folderId!==undefined&&note.folderId!==null&&!UUID.test(note.folderId))
  throw Error('Cartella Nota non valida');
 if(note.creatorId!==undefined&&note.creatorId!==null&&
  (typeof note.creatorId!=='string'||!UUID.test(note.creatorId)))
  throw Error('Creatore Nota non valido');
 if(note.editorOwnerId!==undefined&&note.editorOwnerId!==null&&
  (typeof note.editorOwnerId!=='string'||!UUID.test(note.editorOwnerId)))
  throw Error('Proprietario editor Nota non valido');
 if(note.updatedAt!==undefined&&note.updatedAt!==null&&
  (typeof note.updatedAt!=='string'||!Number.isFinite(Date.parse(note.updatedAt))))
  throw Error('Data aggiornamento Nota non valida');
 if(note.titleIcon!==undefined&&note.titleIcon!==null&&
   (typeof note.titleIcon!=='string'||note.titleIcon.length<1||note.titleIcon.length>80))
  throw Error('Icona titolo Nota non valida');
 if(note.tabOrder!==undefined&&note.tabOrder!==null&&
  (!Array.isArray(note.tabOrder)||note.tabOrder.length>100||
   note.tabOrder.some(x=>typeof x!=='string'||!UUID.test(x))||
   new Set(note.tabOrder).size!==note.tabOrder.length))
  throw Error('Ordine sottoschede non valido');
 return Object.freeze({...note,scope:note.scope??'shared',
  folderId:note.folderId??null,creatorId:note.creatorId??null,
  editorOwnerId:note.editorOwnerId??note.creatorId??null,
  titleIcon:note.titleIcon??null,tabOrder:note.tabOrder??null,
  updatedAt:note.updatedAt??null,campaignId});
}
export async function listArubaCampaignNotes(fetcher,campaignId,parentId=null){
 safeId(campaignId,'Campagna');if(parentId!==null)safeId(parentId,'Nota padre');
 const query=new URLSearchParams({campaignId,...(parentId?{parentId}:{})});
 const data=await json(await fetcher('/vtt/campaign-notes?'+query,opts('GET')));
 if(!Array.isArray(data.notes)||data.notes.length>100)throw Error('Elenco Note non valido');
 const notes=data.notes.map(note=>normalize(note,campaignId,parentId));
 if(new Set(notes.map(n=>n.id)).size!==notes.length)throw Error('Note duplicate');
 return notes;
}
export async function createArubaCampaignNote(fetcher,campaignId,title,parentId=null,scope=undefined){
 safeId(campaignId,'Campagna');if(parentId!==null)safeId(parentId,'Nota padre');
 if(typeof title!=='string'||!title.trim()||title.trim().length>120)throw Error('Titolo Nota non valido');
 if(scope!==undefined && (!['gm','shared'].includes(scope)||parentId!==null))
  throw Error('Sezione Nota non valida');
 const data=await json(await fetcher('/vtt/campaign-notes',opts('POST',
  {campaignId,title:title.trim(),parentId,...(scope===undefined?{}:{scope})})));
 return normalize(data.note,campaignId,parentId);
}
export async function saveArubaCampaignNote(fetcher,campaignId,note){
 safeId(campaignId,'Campagna');safeId(note?.id,'Nota');
 if(note.campaignId!==campaignId)throw Error('Nota di una campagna differente');
 if(typeof note.title!=='string'||!note.title.trim()||note.title.trim().length>120||
  !rich(note.contentRich)||!Number.isInteger(note.position)||note.position<0||
  note.position>10000||!['all','private'].includes(note.visibility)||
  (note.contentRich!==null&&new TextEncoder().encode(JSON.stringify(note.contentRich)).length>49152))
  throw Error('Dati Nota non validi');
 const data=await json(await fetcher('/vtt/campaign-notes/'+note.id,opts('PATCH',
  {campaignId,title:note.title.trim(),contentRich:note.contentRich,position:note.position,visibility:note.visibility})));
 if(data.savedId!==note.id)throw Error('Salvataggio Nota non confermato');
 return note.id;
}
export async function archiveArubaCampaignNote(fetcher,campaignId,noteId){
 safeId(campaignId,'Campagna');safeId(noteId,'Nota');
 const data=await json(await fetcher('/vtt/campaign-notes/'+noteId,opts('DELETE',{campaignId})));
 if(data.archivedId!==noteId)throw Error('Archiviazione Nota non confermata');
 return noteId;
}

export async function moveArubaCampaignNoteToFolder(fetcher,campaignId,noteId,folderId){
 safeId(campaignId,'Campagna');safeId(noteId,'Nota');
 if(folderId!==null)safeId(folderId,'Cartella');
 const data=await json(await fetcher('/vtt/campaign-notes/folder/'+noteId,
  opts('PATCH',{campaignId,folderId})));
 if(data.noteId!==noteId||data.folderId!==folderId)
  throw Error('Spostamento Nota non confermato');
 return folderId;
}
/**
 * Convert only an authenticated, server-filtered Aruba Note to the exact
 * original EntityCustomTab UI field names; never infer ownership from a
 * guessed author or from campaignId. The note icon and tab order need
 * separate persisted migrations, and remain unavailable (null) for now.
 */
export function toOriginalCampaignNoteTab(note){
 if(!note||typeof note!=='object'||Array.isArray(note))throw Error('Nota mancante');
 safeId(note.id,'Nota');safeId(note.campaignId,'Campagna');
 if(note.parentId!==null&&note.parentId!==undefined)safeId(note.parentId,'Nota padre');
 if(!['gm','shared'].includes(note.scope)||
   (note.folderId!==null&&note.folderId!==undefined&&
    (typeof note.folderId!=='string'||!UUID.test(note.folderId)))||
   typeof note.title!=='string'||!note.title.trim()||
   !['private','all'].includes(note.visibility)||
   !Number.isInteger(note.position)||
   (note.creatorId!==null&&note.creatorId!==undefined&&
    (typeof note.creatorId!=='string'||!UUID.test(note.creatorId)))||
   (note.editorOwnerId!==null&&note.editorOwnerId!==undefined&&
    (typeof note.editorOwnerId!=='string'||!UUID.test(note.editorOwnerId))))
  throw Error('Nota Aruba non valida per UI originale');
 return Object.freeze({
  id:note.id,tab_name:note.title,content:'',content_rich:note.contentRich??null,
  position:note.position,hidden:note.scope==='gm',
  folder_id:note.folderId??null,tab_order:note.tabOrder??null,
  title_icon:note.titleIcon??null,
  owner_profile_id:note.editorOwnerId??note.creatorId??null,visibility:note.visibility,
  updated_at:note.updatedAt??'',
 });
}

export async function setArubaCampaignNoteTitleIcon(fetcher,campaignId,noteId,titleIcon){
 safeId(campaignId,'Campagna');safeId(noteId,'Nota');
 if(titleIcon!==null&&(typeof titleIcon!=='string'||titleIcon.length<1||titleIcon.length>80))
  throw Error('Icona titolo Nota non valida');
 const data=await json(await fetcher('/vtt/campaign-notes/icon/'+noteId,
  opts('PATCH',{campaignId,titleIcon})));
 if(data.noteId!==noteId||data.titleIcon!==titleIcon)
  throw Error('Icona titolo Nota non confermata');
 return titleIcon;
}
export async function setArubaCampaignSubtabOrder(fetcher,campaignId,noteId,tabOrder){
 safeId(campaignId,'Campagna');safeId(noteId,'Nota');
 if(!Array.isArray(tabOrder)||tabOrder.length>100||
  tabOrder.some(v=>typeof v!=='string'||!UUID.test(v))||
  new Set(tabOrder).size!==tabOrder.length)
  throw Error('Ordine sottoschede non valido');
 const data=await json(await fetcher('/vtt/campaign-notes/order/'+noteId,
  opts('PATCH',{campaignId,tabOrder})));
 if(data.noteId!==noteId||!Array.isArray(data.tabOrder)||
  JSON.stringify(data.tabOrder)!==JSON.stringify(tabOrder))
  throw Error('Riordino sottoschede non confermato');
 return tabOrder;
}
