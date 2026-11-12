import {useCallback,useEffect,useRef,useState} from 'react';
import {listArubaCampaignTrash,restoreArubaCampaignTrashItem}
 from './campaign-notes-client.mjs';

export type TrashedNote={
 id:string;tab_name:string;content:string;entity_type:'campaign'|'note';
 hidden:boolean;deleted_at:string;
};
export type TrashedFolder={
 id:string;name:string;entity_type:'gmnotes'|'campaignnotes';deleted_at:string;
};
export type UseNotesTrashParams={campaignId:string;accessToken?:string|null;enabled:boolean};

/** The same contract as ORIGINAL useNotesTrash, but cookie-based and
 * fail-closed: no purge, emptyTrash or unsafe restoreAll capability.
 * Only the authenticated campaign owner can read/restore on the server.
 */
export function useNotesTrash({campaignId,enabled}:UseNotesTrashParams){
 const [notes,setNotes]=useState<TrashedNote[]>([]);
 const [folders,setFolders]=useState<TrashedFolder[]>([]);
 const [error,setError]=useState<string|null>(null);
 const generation=useRef(0);
 const refresh=useCallback(async()=>{
  const n=++generation.current;
  if(!enabled||!campaignId){setNotes([]);setFolders([]);setError(null);return;}
  try{
   const result=await listArubaCampaignTrash(fetch,campaignId);
   if(n!==generation.current)return;
   setNotes(result.notes as TrashedNote[]);
   setFolders(result.folders as TrashedFolder[]);
   setError(null);
  }catch(e){
   if(n!==generation.current)return;
   setNotes([]);setFolders([]);
   setError(e instanceof Error?e.message:'Cestino non disponibile');
  }
 },[campaignId,enabled]);
 useEffect(()=>{
  void refresh();
  return()=>{generation.current++;};
 },[refresh]);
 const restore=async(kind:'note'|'folder',id:string)=>{
  if(!enabled||!campaignId)throw Error('Cestino non autorizzato');
  try{
   await restoreArubaCampaignTrashItem(fetch,campaignId,kind,id);
   await refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'Ripristino non riuscito');
   await refresh();
   throw e;
  }
 };
 const forbidden=async():Promise<never>=>{
  throw Error('Eliminazione definitiva e ripristino multiplo non disponibili su Aruba');
 };
 return {
  notes,folders,error,count:notes.length+folders.length,
  refresh,
  restoreNote:(id:string)=>restore('note',id),
  restoreFolder:(id:string)=>restore('folder',id),
  purgeNote:forbidden,purgeFolder:forbidden,restoreAll:forbidden,emptyTrash:forbidden,
 };
}
