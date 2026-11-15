/**
 * Aruba cookie-native adapter for original Campaign Notes folders.
 * The original useFolderSection UI stays the source of layout and behavior.
 * Only gmnotes/campaignnotes are supported; character folders are separate.
 * Never send ownerId, role, legacy bearer token or Supabase endpoint.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid=(value,label)=>{
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
  throw Error(label+' non valido');
 return value;
};
const section=value=>{
 if(!['gmnotes','campaignnotes'].includes(value))throw Error('Sezione cartelle non disponibile');
 return value==='gmnotes'?'gm':'shared';
};
const validName=value=>{
 if(typeof value!=='string'||!value.trim()||value.trim().length>120)throw Error('Nome cartella non valido');
 return value.trim();
};
const validIcon=value=>{
 if(value!==null&&(typeof value!=='string'||value.length>80))throw Error('Icona cartella non valida');
 return value;
};
const validPosition=value=>{
 if(!Number.isInteger(value)||value<0||value>10000)throw Error('Posizione cartella non valida');
 return value;
};
const options=(method,body)=>({
 method,credentials:'same-origin',cache:'no-store',redirect:'error',
 headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),
});
async function read(response){
 if(response.status===401)throw Error('Sessione Aruba scaduta');
 if(response.status===404)throw Error('Cartella non disponibile o non autorizzata');
 if(!response.ok)throw Error('Operazione cartella non riuscita');
 if(!(response.headers?.get?.('content-type')??'').toLowerCase().includes('application/json'))
  throw Error('Il server cartelle non ha restituito JSON');
 try{return await response.json();}
 catch{throw Error('Risposta cartelle non valida');}
}
const root='/vtt/campaign-note-folders';
function normalize(folder,campaignId,scope){
 if(!folder||typeof folder!=='object'||Array.isArray(folder)||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folder.id)||
  folder.scope!==scope||typeof folder.name!=='string'||!folder.name.trim()||
  folder.name.length>120||(folder.parentId!==null&&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folder.parentId))||
  (folder.icon!==null&&(typeof folder.icon!=='string'||folder.icon.length>80))||
  !Number.isInteger(folder.position)||folder.position<0||folder.position>10000)
  throw Error('Cartella Aruba non valida');
 return Object.freeze({
  id:folder.id,campaignId,entityType:scope==='gm'?'gmnotes':'campaignnotes',
  name:folder.name,parentFolderId:folder.parentId,icon:folder.icon,position:folder.position,
 });
}
export async function listArubaCampaignFolders(fetcher,campaignId,entityType){
 uuid(campaignId,'Campagna');const scope=section(entityType);
 const query=new URLSearchParams({campaignId,scope});
 const data=await read(await fetcher(root+'?'+query,options('GET')));
 if(!Array.isArray(data.folders)||data.folders.length>500)throw Error('Elenco cartelle non valido');
 const folders=data.folders.map(x=>normalize(x,campaignId,scope));
 const unique=new Set(folders.map(f=>f.id));
 if(unique.size!==folders.length)throw Error('Cartelle duplicate');
 for(const folder of folders){
  if(folder.parentFolderId!==null && !unique.has(folder.parentFolderId))
   throw Error('Gerarchia cartelle incompleta');
  let at=folder.parentFolderId,seen=new Set([folder.id]),depth=1;
  while(at!==null){
   if(seen.has(at)||++depth>5)throw Error('Gerarchia cartelle non valida');
   seen.add(at);
   at=folders.find(f=>f.id===at)?.parentFolderId??null;
  }
 }
 return folders;
}
export async function createArubaCampaignFolder(fetcher,campaignId,entityType,name,parentId=null){
 uuid(campaignId,'Campagna');const scope=section(entityType);
 validName(name);if(parentId!==null)uuid(parentId,'Cartella padre');
 const data=await read(await fetcher(root,options('POST',{
  campaignId,scope,name:name.trim(),parentId,
 })));
 uuid(data.folderId,'Cartella creata');
 return data.folderId;
}
export async function renameOrNestArubaCampaignFolder(fetcher,campaignId,folderId,name,parentId){
 uuid(campaignId,'Campagna');uuid(folderId,'Cartella');
 validName(name);if(parentId!==null)uuid(parentId,'Cartella padre');
 const data=await read(await fetcher(root+'/'+folderId,options('PATCH',{
  campaignId,name:name.trim(),parentId,
 })));
 if(data.folderId!==folderId)throw Error('Modifica cartella non confermata');
 return folderId;
}
export async function setArubaCampaignFolderPresentation(fetcher,campaignId,folderId,icon,position){
 uuid(campaignId,'Campagna');uuid(folderId,'Cartella');
 validIcon(icon);validPosition(position);
 const data=await read(await fetcher(root+'/presentation/'+folderId,options('PATCH',{
  campaignId,icon,position,
 })));
 if(data.folderId!==folderId||data.icon!==icon||data.position!==position)
  throw Error('Icona o posizione non confermata');
 return folderId;
}
export async function archiveArubaCampaignFolder(fetcher,campaignId,folderId,cascade){
 uuid(campaignId,'Campagna');uuid(folderId,'Cartella');
 if(typeof cascade!=='boolean')throw Error('Modalità cestino non valida');
 const data=await read(await fetcher(root+'/'+folderId,options('DELETE',{
  campaignId,cascade,
 })));
 if(data.archivedId!==folderId||data.cascade!==cascade)
  throw Error('Archiviazione cartella non confermata');
 return folderId;
}
/**
 * The original folder hook sends partial updates for individual properties.
 * Aruba requires an exact name+parent or icon+position pair; caller must
 * load and select an authorized folder first. No global mutable folder cache.
 */
export async function changeArubaCampaignFolder(fetcher,campaignId,entityType,folderId,change){
 uuid(folderId,'Cartella');uuid(campaignId,'Campagna');
 if(!change||typeof change!=='object'||Array.isArray(change)||
   Object.keys(change).length!==1)throw Error('Modifica cartella non valida');
 const folders=await listArubaCampaignFolders(fetcher,campaignId,entityType);
 const old=folders.find(f=>f.id===folderId);
 if(!old)throw Error('Cartella non autorizzata');
 if(Object.hasOwn(change,'name'))
  return renameOrNestArubaCampaignFolder(fetcher,campaignId,folderId,
   validName(change.name),old.parentFolderId);
 if(Object.hasOwn(change,'parentFolderId')){
  if(change.parentFolderId!==null)uuid(change.parentFolderId,'Cartella padre');
  return renameOrNestArubaCampaignFolder(fetcher,campaignId,folderId,
   old.name,change.parentFolderId);
 }
 if(Object.hasOwn(change,'icon'))
  return setArubaCampaignFolderPresentation(fetcher,campaignId,folderId,
   validIcon(change.icon),old.position);
 if(Object.hasOwn(change,'position'))
  return setArubaCampaignFolderPresentation(fetcher,campaignId,folderId,
   old.icon,validPosition(change.position));
 throw Error('Campo cartella non consentito');
}
