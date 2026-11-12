import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useArubaCampaignNotesContext} from './ArubaCampaignNotesContext';
import {moveArubaEntityNote} from './ArubaCampaignNotesEndpoints.mjs';
import {
 listArubaEntityNotes,createArubaEntityNote,saveArubaEntityNote,archiveArubaEntityNote,setArubaSubtabOrder,
} from './ArubaCampaignNotesEndpoints.mjs';
type BaseTab={id:string;label:string};
type Note={id:string;tab_name:string;content:string;content_rich:Record<string,unknown>|null;
 position:number;hidden:boolean;visibility:'all'|'private';folder_id:string|null;tab_order:string[]|null;
 owner_profile_id:string|null;title_icon?:string|null;updated_at?:string};
type Params={
 entityType?:string;entityId?:string|null;campaignId?:string|null;accessToken?:string|null;
 canEdit?:boolean;enabled?:boolean;baseTabs:BaseTab[];
 savedTabOrder?:string[];onPersistTabOrder?:(order:string[])=>void;
};
/** Aruba adapter for the original EntityTabBar + EntityDetailView tab contract.
 * The original sources remain unchanged, while Supabase/realtime are replaced
 * by owner-scoped cookie endpoints. Nested tabs and drag order use a two-level model.
 * Note the save queue is per-note, so concurrent edits never reorder writes.
 */
export function useEntityTabs({
 entityType,entityId,campaignId,canEdit=true,enabled=true,baseTabs,savedTabOrder,onPersistTabOrder,
}:Params){
 const notesContext=useArubaCampaignNotesContext();
 const nested=entityType==='note';
 const currentUserId=notesContext.userId;
 const mayEdit=(note:Note)=>notesContext.isGm||
  (!!currentUserId&&note.owner_profile_id===currentUserId);
 const canCreate=notesContext.isGm||(!nested&&!!currentUserId)||canEdit;
 const parentId=nested?entityId:null;
 const scopeCharacterId=nested?entityId:campaignId;
 const scopeCampaignId=notesContext.campaignId??campaignId;
 const supported=notesContext.enabled&&enabled&&
  (entityType==='campaign'||entityType==='note')&&
  !!entityId&&!!scopeCampaignId&&!!scopeCharacterId;
 const [customTabs,setCustomTabs]=useState<Note[]>([]);
 const [tabOrder,setTabOrder]=useState<string[]>(savedTabOrder??baseTabs.map(t=>t.id));
 const [currentTab,setCurrentTab]=useState(baseTabs[0]?.id??'');
 const [pendingFocusTabId,setPendingFocusTabId]=useState<string|null>(null);
 const [renamingTabId,setRenamingTabId]=useState<string|null>(null);
 const [renameDraft,setRenameDraft]=useState('');
 const [openMenuTabId,setOpenMenuTabId]=useState<string|null>(null);
 const [confirmDeleteTabId,setConfirmDeleteTabId]=useState<string|null>(null);
 const [draggedTabId,setDraggedTabId]=useState<string|null>(null);
 const [dragOverId,setDragOverId]=useState<string|null>(null);
 const dragOverIdRef=useRef<string|null>(null);
 const pointerStartRef=useRef<{x:number;y:number;tabId:string}|null>(null);
 const [error,setError]=useState<string|null>(null);
 const tabsContainerRef=useRef<HTMLDivElement|null>(null);
 const notesRef=useRef<Note[]>([]);
 const queueRef=useRef<Map<string,Promise<unknown>>>(new Map());
 const generation=useRef(0);
 const setNotes=(value:Note[]|((current:Note[])=>Note[]))=>{
  const next=typeof value==='function'?value(notesRef.current):value;
  notesRef.current=next;
  setCustomTabs(next);
 };
 useEffect(()=>{
  const seq=++generation.current;setNotes([]);setError(null);
  if(!supported)return;
  void listArubaEntityNotes(fetch,scopeCampaignId!,scopeCharacterId!,parentId).then(notes=>{
   if(seq!==generation.current)return;
   setNotes(notes as Note[]);
  }).catch(e=>{if(seq===generation.current)setError(e instanceof Error?e.message:'Errore caricamento Note');});
  return ()=>{generation.current++;};
 },[supported,scopeCampaignId,scopeCharacterId,parentId]);
 const orderedTabs=useMemo(()=>{
  const merged=[
   ...baseTabs.map(t=>({...t,isCustom:false,hidden:false})),
   ...customTabs.map(n=>({id:n.id,label:n.tab_name,isCustom:true,hidden:n.hidden})),
  ];
  const sequence=[...tabOrder,...customTabs.map(n=>n.id).filter(id=>!tabOrder.includes(id))];
  return merged.sort((a,b)=>{
   const ai=sequence.indexOf(a.id),bi=sequence.indexOf(b.id);
   return (ai<0?100000:ai)-(bi<0?100000:bi);
  });
 },[baseTabs,customTabs,tabOrder]);
 const byId=(id:string)=>notesRef.current.find(n=>n.id===id);
 const fail=(e:unknown)=>setError(e instanceof Error?e.message:'Operazione nota non riuscita');
 const enqueue=(id:string,task:()=>Promise<unknown>)=>{
  const previous=queueRef.current.get(id)??Promise.resolve();
  const next=previous.catch(()=>{}).then(task);
  queueRef.current.set(id,next);

  void next.catch(fail);
  return next;
 };
 const persist=(id:string,changes:Partial<Note>)=>{
  if(!supported)return Promise.resolve();
  const note=byId(id);if(!note||!mayEdit(note))return Promise.resolve();
  const updated={...note,...changes};
  setNotes(prev=>prev.map(n=>n.id===id?updated:n));
  return enqueue(id,async()=>{
   const latest=byId(id)??updated;
   await saveArubaEntityNote(fetch,scopeCampaignId!,scopeCharacterId!,id,latest);
  });
 };
 const reloadCustomTabs=useCallback(async()=>{
  if(!supported){setNotes([]);return;}
  try{setNotes((await listArubaEntityNotes(fetch,scopeCampaignId!,scopeCharacterId!,parentId)) as Note[]);setError(null);}
  catch(e){fail(e);}
 },[supported,scopeCampaignId,scopeCharacterId,parentId]);
 const handleAddCustomTab=async(tabName='Nuova tab',opts?:{hidden?:boolean;visibility?:'all'|'private'})=>{
  if(!supported||!canCreate)return;
  if(opts?.hidden&&!notesContext.isGm)return;
  try{
   const row=await createArubaEntityNote(fetch,scopeCampaignId!,scopeCharacterId!,tabName,parentId,
    nested?undefined:(opts?.hidden?'gm':'shared')) as Note;
   setNotes(prev=>[...prev,row]);
   setTabOrder(prev=>[...prev,row.id]);
   if(opts?.hidden||opts?.visibility==='private')
    await persist(row.id,{hidden:opts.hidden??false,visibility:opts.visibility??'all'});
   setCurrentTab(row.id);setPendingFocusTabId(row.id);setRenameDraft(row.tab_name);
   setRenamingTabId(row.id);setError(null);
  }catch(e){fail(e);}
 };
 const handleDuplicateCustomTab=async(id:string)=>{
  if(!supported)return;
  const source=byId(id);if(!source||!mayEdit(source))return;
  try{
   const created=await createArubaEntityNote(fetch,scopeCampaignId!,scopeCharacterId!,source.tab_name+' (copia)',parentId,nested?undefined:(source.hidden?'gm':'shared')) as Note;
   const cloned={...created,content:source.content,content_rich:source.content_rich,
    hidden:source.hidden,visibility:source.visibility,position:source.position+1};
   await saveArubaEntityNote(fetch,scopeCampaignId!,scopeCharacterId!,created.id,cloned);
   setNotes(prev=>[...prev,cloned]);
   setTabOrder(prev=>[...prev,created.id]);setCurrentTab(created.id);
   setError(null);
  }catch(e){fail(e);}
 };
 const handleRenameCustomTab=async(id:string)=>{
  const next=renameDraft.trim();setRenamingTabId(null);
  if(!next||next.length>120)return;
  try{await persist(id,{tab_name:next});}catch(e){fail(e);}
 };
 const handleToggleHideCustomTab=(id:string)=>{
  // Moving between GM/shared sections is not a visibility flag update:
  // require an atomic scope-move API before enabling this original command.
  if(byId(id))setError('Spostamento GM/Campagna non ancora disponibile su Aruba');
 };
 const handleSetNoteVisibility=(id:string,visibility:'all'|'private')=>
  {void persist(id,{visibility});};
 const handlePersistSubTabOrder=(id:string,order:string[])=>{
  const note=byId(id);
  if(!supported||nested||!note||!mayEdit(note))return;
  const updated={...note,tab_order:order};
  setNotes(prev=>prev.map(n=>n.id===id?updated:n));
  void enqueue(id,async()=>{
   await setArubaSubtabOrder(fetch,scopeCampaignId!,scopeCharacterId!,id,order);
  });
 };
 const handleDeleteCustomTab=async(id:string)=>{
  setConfirmDeleteTabId(null);
  if(!supported||!mayEdit(byId(id)!))return;
  try{
   const pending=queueRef.current.get(id);
   if(pending)await pending;
   await archiveArubaEntityNote(fetch,scopeCampaignId!,scopeCharacterId!,id);
   setNotes(prev=>prev.filter(n=>n.id!==id));
   setTabOrder(prev=>prev.filter(x=>x!==id));
   if(currentTab===id)setCurrentTab(baseTabs[0]?.id??'');
   setError(null);
  }catch(e){fail(e);}
 };
 const handleCustomTabContentChange=(id:string,content:string)=>{
  const note=byId(id);if(!note||!mayEdit(note))return;
  void persist(id,{content});
 };
 const handleCustomTabRichContentChange=(id:string,contentRich:Record<string,unknown>)=>{
  if(!byId(id)||!mayEdit(byId(id)!))return;
  // No unsent debounce timer: editor unmount/navigation must not drop the
  // most recent JSON. The serialized queue always sends the newest snapshot.
  void persist(id,{content_rich:contentRich});
 };
 const handlePointerDownTab=(e:React.PointerEvent,tabId:string)=>{
  if(!supported||!canEdit||renamingTabId===tabId)return;
  const target=e.target as HTMLElement;
  if(target.closest('[data-no-drag]')||target.closest('input'))return;
  pointerStartRef.current={x:e.clientX,y:e.clientY,tabId};
 };
 useEffect(()=>{
  if(!supported||!canEdit)return;
  const handleMove=(e:PointerEvent)=>{
   if(draggedTabId){
    const container=tabsContainerRef.current;
    if(!container)return;
    let target:string='END';
    for(const el of Array.from(container.querySelectorAll<HTMLElement>('[data-tab-id]'))){
     const rect=el.getBoundingClientRect();
     if(e.clientX<rect.left+rect.width/2){target=el.dataset.tabId??'END';break;}
    }
    dragOverIdRef.current=target;setDragOverId(target);
    return;
   }
   const start=pointerStartRef.current;
   if(!start)return;
   const dx=e.clientX-start.x,dy=e.clientY-start.y;
   if(Math.hypot(dx,dy)>6)setDraggedTabId(start.tabId);
  };
  const handleUp=()=>{
   if(draggedTabId){
    const before=orderedTabs.map(t=>t.id);
    const target=dragOverIdRef.current;
    if(target!==draggedTabId){
     const order=before.filter(id=>id!==draggedTabId);
     const idx=target&&target!=='END'?order.indexOf(target):-1;
     order.splice(idx<0?order.length:idx,0,draggedTabId);
     if(order.join('|')!==before.join('|')){
      setTabOrder(order);
      onPersistTabOrder?.(order);
     }
    }
   }
   setDraggedTabId(null);setDragOverId(null);
   dragOverIdRef.current=null;pointerStartRef.current=null;
  };
  window.addEventListener('pointermove',handleMove);
  window.addEventListener('pointerup',handleUp);
  return ()=>{
   window.removeEventListener('pointermove',handleMove);
   window.removeEventListener('pointerup',handleUp);
  };
 },[supported,canEdit,draggedTabId,orderedTabs,onPersistTabOrder]);
 const selectTabByClick=(id:string)=>{
  if(orderedTabs.some(tab=>tab.id===id)){
   setCurrentTab(id);setPendingFocusTabId(id);setOpenMenuTabId(null);
  }
 };
 // Folder assignment still requires the original category authorization model.
 const handleMoveCustomTabToFolder=(id:string,folderId:string|null)=>{
  const note=byId(id);
  if(!supported||nested||!note||!mayEdit(note))return;
  void enqueue(id,async()=>{
   await moveArubaEntityNote(fetch,scopeCampaignId!,scopeCharacterId!,id,folderId);
   setNotes(prev=>prev.map(n=>n.id===id?{...n,folder_id:folderId}:n));
  });
 };
 return {
  customTabs,tabOrder,orderedTabs,currentTab,setCurrentTab,pendingFocusTabId,
  selectTabByClick,clearPendingFocusTab:()=>setPendingFocusTabId(null),
  renamingTabId,setRenamingTabId,renameDraft,setRenameDraft,
  openMenuTabId,setOpenMenuTabId,confirmDeleteTabId,setConfirmDeleteTabId,
  draggedTabId,dragOverId,tabsContainerRef,
  handlePointerDownTab,handleAddCustomTab,
  handleDuplicateCustomTab,handleMoveCustomTabToFolder,
  handlePersistSubTabOrder,handleRenameCustomTab,
  handleToggleHideCustomTab,handleSetNoteVisibility,
  handleDeleteCustomTab,handleCustomTabContentChange,
  handleCustomTabRichContentChange,reloadCustomTabs,error,
 };
}
export type UseEntityTabsResult=ReturnType<typeof useEntityTabs>;

export const canEditNote=(note:{owner_profile_id:string|null},userId:string|null|undefined,isGm:boolean)=>
 isGm||!!userId&&note.owner_profile_id===userId;
