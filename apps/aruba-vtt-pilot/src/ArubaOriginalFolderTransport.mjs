import {
 listArubaCampaignFolders,createArubaCampaignFolder,changeArubaCampaignFolder,
 archiveArubaCampaignFolder,
} from './campaign-folders-client.mjs';

/**
 * Adapt the original useFolderSection service signatures to the Aruba
 * session-cookie API. The importer is the ORIGINAL hook, not a new UI.
 * Scope is obtained exclusively from successful authorized GET responses,
 * never from a caller-supplied ownerId, bearer token or folder ID guess.
 */
export function createArubaOriginalFolderTransport(fetcher){
 if(typeof fetcher!=='function')throw new TypeError('A fetch implementation is required');
 const known=new Map();
 const getKnown=id=>{
  const entry=known.get(id);
  if(!entry)throw Error('Cartella non disponibile nella campagna corrente');
  return entry;
 };
 async function loadFolders(campaignId,entityType,_serverBase,_accessToken){
  const folders=await listArubaCampaignFolders(fetcher,campaignId,entityType);
  // Discard stale identity maps from a previous campaign or scope.
  for(const [id,value] of known)
   if(value.campaignId===campaignId&&value.entityType===entityType)known.delete(id);
  for(const folder of folders)
   known.set(folder.id,{campaignId,entityType});
  return folders;
 }
 async function createFolder(campaignId,entityType,name,serverBase,accessToken,parentFolderId=null){
  const folderId=await createArubaCampaignFolder(fetcher,campaignId,entityType,name,parentFolderId);
  const folders=await loadFolders(campaignId,entityType,serverBase,accessToken);
  const created=folders.find(f=>f.id===folderId);
  if(!created)throw Error('Cartella creata ma non recuperabile dal server');
  return created;
 }
 async function renameFolder(folderId,name,serverBase,accessToken){
  const ctx=getKnown(folderId);
  await changeArubaCampaignFolder(fetcher,ctx.campaignId,ctx.entityType,folderId,{name});
 }
 async function reorderFolder(folderId,position,serverBase,accessToken){
  const ctx=getKnown(folderId);
  await changeArubaCampaignFolder(fetcher,ctx.campaignId,ctx.entityType,folderId,{position});
 }
 async function setFolderParent(folderId,parentFolderId,serverBase,accessToken){
  const ctx=getKnown(folderId);
  await changeArubaCampaignFolder(fetcher,ctx.campaignId,ctx.entityType,folderId,{parentFolderId});
 }
 async function setFolderIcon(folderId,icon,serverBase,accessToken){
  const ctx=getKnown(folderId);
  await changeArubaCampaignFolder(fetcher,ctx.campaignId,ctx.entityType,folderId,{icon});
 }
 async function archive(folderId,cascade){
  const ctx=getKnown(folderId);
  await archiveArubaCampaignFolder(fetcher,ctx.campaignId,folderId,cascade);
  known.delete(folderId);
 }
 const deleteFolder=(folderId,_serverBase,_accessToken)=>archive(folderId,false);
 const deleteFolderCascade=(folderId,_serverBase,_accessToken)=>archive(folderId,true);
 const clear=()=>known.clear();
 return {loadFolders,createFolder,renameFolder,reorderFolder,setFolderParent,setFolderIcon,
  deleteFolder,deleteFolderCascade,clear};
}
