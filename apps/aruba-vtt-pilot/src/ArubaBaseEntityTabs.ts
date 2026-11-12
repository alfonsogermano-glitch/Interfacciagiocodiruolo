import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useArubaNotesEnabled} from './ArubaNotesCapability';
import {
 listArubaEntityNotes,createArubaEntityNote,saveArubaEntityNote,archiveArubaEntityNote,
} from './entity-notes-client.mjs';
type BaseTab={id:string;label:string};
type Note={id:string;tab_name:string;content:string;content_rich:Record<string,unknown>|null;
 position:number;hidden:boolean;visibility:'all'|'private';folder_id:null;tab_order:null;
 owner_profile_id:null;updated_at?:string};
type Params={
 entityType?:string;entityId?:string|null;campaignId?:string|null;accessToken?:string|null;
 canEdit?:boolean;enabled?:boolean;baseTabs:BaseTab[];
 savedTabOrder?:string[];onPersistTabOrder?:(order:string[])=>void;
};
/** Aruba adapter for the original EntityTabBar + EntityDetailView tab contract.
 * The original sources remain unchanged, while Supabase/realtime are replaced
 * by owner-scoped cookie endpoints. Unimplemented folders/sub-tabs stay disabled.
 * Note the save queue is per-note, so concurrent edits never reorder writes.
 */
export function useEntityTabs({
 entityType,entityId,campaignId,canEdit=true,enabled=true,baseTabs,savedTabOrder,onPersistTabOrder,
}:Params){
 const notesEnabled=useArubaNotesEnabled();
 const supported=notesEnabled&&enabled&&entityType==='character'&&!!entityId&&!!campaignId;
 const [customTabs,setCustomTabs]=useState<Note[]>([]);
 const [tabOrder,setTabOrder]=useState<string[]>(savedTabOrder??baseTabs.map(t=>t.id));
 const [currentTab,setCurrentTab]=useState(baseTabs[0]?.id??'');
 const [pendingFocusTabId,setPendingFocusTabId]=useState<string|null>(null);
 const [renamingTabId,setRenamingTabId]=useState<string|null>(null);
 const [renameDraft,setRenameDraft]=useState('');
 const [openMenuTabId,setOpenMenuTabId]=useState<string|null>(null);
 const [confirmDeleteTabId,setConfirmDeleteTabId]=useState<string|null>(null);
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
  void listArubaEntityNotes(fetch,campaignId!,entityId!).then(notes=>{
   if(seq!==generation.current)return;
   setNotes(notes as Note[]);
  }).catch(e=>{if(seq===generation.current)setError(e instanceof Error?e.message:'Errore caricamento Note');});
  return ()=>{generation.current++;};
 },[supported,campaignId,entityId]);
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
  if(!supported||!canEdit)return Promise.resolve();
  const note=byId(id);if(!note)return Promise.resolve();
  const updated={...note,...changes};
  setNotes(prev=>prev.map(n=>n.id===id?updated:n));
  return enqueue(id,async()=>{
   const latest=byId(id)??updated;
   await saveArubaEntityNote(fetch,campaignId!,entityId!,id,latest);
  });
 };
 const reloadCustomTabs=useCallback(async()=>{
  if(!supported){setNotes([]);return;}
  try{setNotes((await listArubaEntityNotes(fetch,campaignId!,entityId!)) as Note[]);setError(null);}
  catch(e){fail(e);}
 },[supported,campaignId,entityId]);
 const handleAddCustomTab=async(tabName='Nuova tab',opts?:{hidden?:boolean;visibility?:'all'|'private'})=>{
  if(!supported||!canEdit)return;
  try{
   const row=await createArubaEntityNote(fetch,campaignId!,entityId!,tabName) as Note;
   setNotes(prev=>[...prev,row]);
   setTabOrder(prev=>[...prev,row.id]);
   if(opts?.hidden||opts?.visibility==='private')
    await persist(row.id,{hidden:opts.hidden??false,visibility:opts.visibility??'all'});
   setCurrentTab(row.id);setPendingFocusTabId(row.id);setRenameDraft(row.tab_name);
   setRenamingTabId(row.id);setError(null);
  }catch(e){fail(e);}
 };
 const handleDuplicateCustomTab=async(id:string)=>{
  if(!supported||!canEdit)return;
  const source=byId(id);if(!source)return;
  try{
   const created=await createArubaEntityNote(fetch,campaignId!,entityId!,source.tab_name+' (copia)') as Note;
   const cloned={...created,content:source.content,content_rich:source.content_rich,
    hidden:source.hidden,visibility:source.visibility,position:source.position+1};
   await saveArubaEntityNote(fetch,campaignId!,entityId!,created.id,cloned);
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
  const note=byId(id);if(note)void persist(id,{hidden:!note.hidden});
 };
 const handleSetNoteVisibility=(id:string,visibility:'all'|'private')=>
  {void persist(id,{visibility});};
 const handleDeleteCustomTab=async(id:string)=>{
  setConfirmDeleteTabId(null);
  if(!supported||!canEdit)return;
  try{
   const pending=queueRef.current.get(id);
   if(pending)await pending;
   await archiveArubaEntityNote(fetch,campaignId!,entityId!,id);
   setNotes(prev=>prev.filter(n=>n.id!==id));
   setTabOrder(prev=>prev.filter(x=>x!==id));
   if(currentTab===id)setCurrentTab(baseTabs[0]?.id??'');
   setError(null);
  }catch(e){fail(e);}
 };
 const handleCustomTabContentChange=(id:string,content:string)=>{
  const note=byId(id);if(!note||!canEdit)return;
  void persist(id,{content});
 };
 const handleCustomTabRichContentChange=(id:string,contentRich:Record<string,unknown>)=>{
  if(!byId(id)||!canEdit)return;
  // No unsent debounce timer: editor unmount/navigation must not drop the
  // most recent JSON. The serialized queue always sends the newest snapshot.
  void persist(id,{content_rich:contentRich});
 };
 const selectTabByClick=(id:string)=>{
  if(orderedTabs.some(tab=>tab.id===id)){
   setCurrentTab(id);setPendingFocusTabId(id);setOpenMenuTabId(null);
  }
 };
 // Deliberately omit original Supabase-bound folder, subtabs and drag
 // actions; their UI requires an Aruba-compatible ownership model.
 const unavailable=()=>{};
 return {
  customTabs,tabOrder,orderedTabs,currentTab,setCurrentTab,pendingFocusTabId,
  selectTabByClick,clearPendingFocusTab:()=>setPendingFocusTabId(null),
  renamingTabId,setRenamingTabId,renameDraft,setRenameDraft,
  openMenuTabId,setOpenMenuTabId,confirmDeleteTabId,setConfirmDeleteTabId,
  draggedTabId:null,dragOverId:null,tabsContainerRef,
  handlePointerDownTab:unavailable,handleAddCustomTab,
  handleDuplicateCustomTab,handleMoveCustomTabToFolder:unavailable,
  handlePersistSubTabOrder:unavailable,handleRenameCustomTab,
  handleToggleHideCustomTab,handleSetNoteVisibility,
  handleDeleteCustomTab,handleCustomTabContentChange,
  handleCustomTabRichContentChange,reloadCustomTabs,error,
 };
}
export type UseEntityTabsResult=ReturnType<typeof useEntityTabs>;
