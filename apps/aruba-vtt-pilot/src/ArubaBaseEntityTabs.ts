import {useRef,useState} from 'react';
/**
 * Isolated adapter for the BASE tabs of the ORIGINAL EntityDetailView.
 * All names/order/UI are taken from EntityDetailView's own baseTabs.
 * Custom editor and shared notes remain explicitly unavailable until
 * their Aruba API/permission/realtime contract is implemented.
 */
export function useEntityTabs({baseTabs,savedTabOrder,onPersistTabOrder}:{
 baseTabs:Array<{id:string;label:string}>;savedTabOrder?:string[];
 onPersistTabOrder?:(order:string[])=>void;
}){
 const [currentTab,setCurrentTab]=useState(baseTabs[0]?.id??'');
 const [tabOrder,setTabOrder]=useState<string[]>(savedTabOrder??baseTabs.map(t=>t.id));
 const [pendingFocusTabId,setPendingFocusTabId]=useState<string|null>(null);
 const tabsContainerRef=useRef<HTMLDivElement|null>(null);
 const [renamingTabId,setRenamingTabId]=useState<string|null>(null);
 const [renameDraft,setRenameDraft]=useState('');
 const [openMenuTabId,setOpenMenuTabId]=useState<string|null>(null);
 const [confirmDeleteTabId,setConfirmDeleteTabId]=useState<string|null>(null);
 const customTabs=[] as Array<any>;
 const orderedTabs=[
  ...baseTabs.filter(tab=>tabOrder.includes(tab.id)).sort((a,b)=>tabOrder.indexOf(a.id)-tabOrder.indexOf(b.id)),
  ...baseTabs.filter(tab=>!tabOrder.includes(tab.id)),
 ];
 const unavailable=()=>{};
 const selectTabByClick=(id:string)=>{
  if(orderedTabs.some(tab=>tab.id===id)){setCurrentTab(id);setPendingFocusTabId(id);}
 };
 return {
  customTabs,tabOrder,orderedTabs,currentTab,setCurrentTab,pendingFocusTabId,
  selectTabByClick,clearPendingFocusTab:()=>setPendingFocusTabId(null),
  renamingTabId,setRenamingTabId,renameDraft,setRenameDraft,
  openMenuTabId,setOpenMenuTabId,confirmDeleteTabId,setConfirmDeleteTabId,
  draggedTabId:null,dragOverId:null,tabsContainerRef,
  handlePointerDownTab:unavailable,
  handleAddCustomTab:unavailable,handleDuplicateCustomTab:unavailable,
  handleMoveCustomTabToFolder:unavailable,handlePersistSubTabOrder:unavailable,
  handleRenameCustomTab:unavailable,handleToggleHideCustomTab:unavailable,
  handleSetNoteVisibility:unavailable,handleDeleteCustomTab:unavailable,
  handleCustomTabContentChange:unavailable,handleCustomTabRichContentChange:unavailable,
  reloadCustomTabs:unavailable,
 };
}
export type UseEntityTabsResult=ReturnType<typeof useEntityTabs>;
