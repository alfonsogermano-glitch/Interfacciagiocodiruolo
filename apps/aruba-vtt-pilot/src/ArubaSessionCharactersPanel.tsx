import {useCallback,useEffect,useRef,useState} from 'react';
import {FolderPlus} from 'lucide-react';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {listCharacterDrafts} from './client.mjs';
import {listArubaNarrativeContent} from './client.mjs';
import {SectionHeader} from '../../../src/app/components/session/shared/SectionHeader';
import {ArubaCharacterDetailPanel} from './ArubaCharacterDetailPanel';
import {ArubaNarrativeDetailPanel} from './ArubaNarrativeDetailPanel';
import {ArubaSessionSheetPortrait,type SheetPortraitFields} from './ArubaSessionSheetPortrait';
import {ArubaSessionSheetRow} from './ArubaSessionSheetRow';
import {clampSheetsPanel,clampSheetsSidebar,readSheetsWidth,SHEETS_PANEL_KEY,SHEETS_SIDEBAR_KEY} from './session-sheets-layout.mjs';
type Selection={kind:'pg'|'npcs'|'monsters';id:string;requestId?:number};
type CharacterEntry={
 id:string;campaignId:string;ownerId:string;name:string;
 status:'draft'|'active';sheetData:Record<string,unknown>;
};
/** Session's Schede panel: Aruba-backed list, original SlideOverPanel and
 * original EntityDetailView via ArubaCharacterDetailPanel on selection.
 * Narrative entries come from the authorized campaign API, not the quarantined
 * global/historical catalog. Failed groups remain visibly distinct from empty. */
export function ArubaSessionCharactersPanel({campaignId,ownerId,ownerDisplayName,initialSelection,onClose,narrativeEnabled=false,
 ruleset='hsc',notesEnabled=false,narrativeNotesEnabled=false,portraitsEnabled=false,visualAssetsEnabled=false,onChanged=()=>{},registerPanelGuard}:{
 campaignId:string;ownerId:string;ownerDisplayName?:string;initialSelection?:Selection|null;
 onClose:()=>void;
 narrativeEnabled?:boolean;ruleset?:string;notesEnabled?:boolean;narrativeNotesEnabled?:boolean;
 portraitsEnabled?:boolean;visualAssetsEnabled?:boolean;onChanged?:()=>void;
 registerPanelGuard?:(guard:(()=>Promise<void>)|null)=>void;
}){
 const [characters,setCharacters]=useState<CharacterEntry[]>([]);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [retry,setRetry]=useState(0);
  const [loadedKey,setLoadedKey]=useState('');
   const [npcs,setNpcs]=useState<({id:string;name?:string;title?:string;role?:string;visibleToPlayers?:boolean}&SheetPortraitFields)[]>([]);
   const [monsters,setMonsters]=useState<({id:string;name?:string;title?:string;role?:string;visibleToPlayers?:boolean}&SheetPortraitFields)[]>([]);
  const [narrativeError,setNarrativeError]=useState<string|null>(null);
  const [narrativeBusy,setNarrativeBusy]=useState(false);
   const [groups,setGroups]=useState({pg:true,npcs:true,monsters:true});
   const [selected,setSelected]=useState<Selection|null>(null);
   const [transitionError,setTransitionError]=useState<string|null>(null);
   const [switching,setSwitching]=useState(false);
   const leaveGuard=useRef<(()=>Promise<void>)|null>(null);
    const switchingRef=useRef(false);
    const [panelWidth,setPanelWidth]=useState(()=>clampSheetsPanel(
     readSheetsWidth(()=>window.localStorage,SHEETS_PANEL_KEY,1024),window.innerWidth));
    const [sidebarWidth,setSidebarWidth]=useState(()=>clampSheetsSidebar(
     readSheetsWidth(()=>window.localStorage,SHEETS_SIDEBAR_KEY,256),panelWidth));
    const resize=useRef<{target:'panel'|'sidebar';x:number;width:number}|null>(null);
    useEffect(()=>{
     const handle=()=>setPanelWidth(width=>clampSheetsPanel(width,window.innerWidth));
     window.addEventListener('resize',handle);return()=>window.removeEventListener('resize',handle);
    },[]);
    useEffect(()=>{
     setSidebarWidth(width=>clampSheetsSidebar(width,panelWidth));
     try{window.localStorage.setItem(SHEETS_PANEL_KEY,String(panelWidth));}catch{}
    },[panelWidth]);
    useEffect(()=>{try{window.localStorage.setItem(SHEETS_SIDEBAR_KEY,String(sidebarWidth));}catch{}},[sidebarWidth]);
    const resizeHandle=(target:'panel'|'sidebar')=>({
     role:'separator',tabIndex:0,'aria-orientation':'vertical' as const,
     'aria-label':target==='panel'?'Larghezza pannello Schede':'Larghezza elenco schede',
     'aria-valuenow':Math.round(target==='panel'?panelWidth:sidebarWidth),
     onPointerDown:(event:React.PointerEvent<HTMLDivElement>)=>{
      if(event.button!==0)return;
      event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
      resize.current={target,x:event.clientX,width:target==='panel'?panelWidth:sidebarWidth};
     },
     onPointerMove:(event:React.PointerEvent<HTMLDivElement>)=>{
      const state=resize.current;if(!state||state.target!==target)return;
      if(target==='panel')setPanelWidth(clampSheetsPanel(state.width+state.x-event.clientX,window.innerWidth));
      else setSidebarWidth(clampSheetsSidebar(state.width+event.clientX-state.x,panelWidth));
     },
     onPointerUp:()=>{resize.current=null;},onPointerCancel:()=>{resize.current=null;},
     onLostPointerCapture:()=>{resize.current=null;},
     onKeyDown:(event:React.KeyboardEvent<HTMLDivElement>)=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();const delta=event.key==='ArrowRight'?16:-16;
      if(target==='panel')setPanelWidth(width=>clampSheetsPanel(width-delta,window.innerWidth));
      else setSidebarWidth(width=>clampSheetsSidebar(width+delta,panelWidth));
     },
    });
   const initialRequest=useRef('');
   const registerLeaveGuard=useCallback((guard:(()=>Promise<void>)|null)=>{leaveGuard.current=guard;},[]);
   useEffect(()=>{
    registerPanelGuard?.(async()=>{await leaveGuard.current?.();});
    return ()=>registerPanelGuard?.(null);
   },[registerPanelGuard]);
   async function transition(next:Selection|null,close=false){
    if(switchingRef.current)return;
    switchingRef.current=true;setSwitching(true);setTransitionError(null);
    try{
     await leaveGuard.current?.();
     if(close)onClose();else setSelected(next);
    }catch{
     setTransitionError('Salvataggio non confermato: la scheda resta aperta. Verifica le modifiche prima di cambiare selezione.');
    }finally{switchingRef.current=false;setSwitching(false);}
   }
 const requestKey=campaignId+':'+ownerId+':'+retry;
 useEffect(()=>{
  let active=true;
  setBusy(true);setError(null);setCharacters([]);setLoadedKey('');
  void listCharacterDrafts(fetch,campaignId,ownerId)
   .then(list=>{if(active){setCharacters(list.filter(c=>c.status==='active'));setLoadedKey(requestKey);}})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'Impossibile caricare le schede');})
   .finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
  },[campaignId,ownerId,retry]);
  useEffect(()=>{
   let active=true;
   setNpcs([]);setMonsters([]);setNarrativeError(null);setNarrativeBusy(narrativeEnabled);
   if(!narrativeEnabled)return;
   void Promise.all([
    listArubaNarrativeContent(fetch,campaignId,'npcs'),
    listArubaNarrativeContent(fetch,campaignId,'monsters'),
   ]).then(([png,mostri])=>{if(active){setNpcs(png);setMonsters(mostri);}})
    .catch(e=>{if(active)setNarrativeError(e instanceof Error?e.message:'Impossibile caricare PNG e Mostri');})
    .finally(()=>{if(active)setNarrativeBusy(false);});
   return()=>{active=false;};
   },[campaignId,ownerId,narrativeEnabled,retry]);
   useEffect(()=>{
    if(initialSelection){
     const key=initialSelection.kind+':'+initialSelection.id+':'+(initialSelection.requestId??'');
     const list=initialSelection.kind==='pg'?characters:initialSelection.kind==='npcs'?npcs:monsters;
     if(initialRequest.current!==key&&list.some(row=>row.id===initialSelection.id)){
      initialRequest.current=key;void transition(initialSelection);
     }
    }else if(!selected&&!busy&&!error&&loadedKey===requestKey){
     const first=characters[0]?{kind:'pg' as const,id:characters[0].id}:
      npcs[0]?{kind:'npcs' as const,id:npcs[0].id}:
      monsters[0]?{kind:'monsters' as const,id:monsters[0].id}:null;
     if(first)setSelected(first);
    }
   },[initialSelection,characters,npcs,monsters,busy,error,loadedKey,requestKey,selected]);
  return <section className="aruba-session-characters-host" aria-label="Schede della sessione">
   <SlideOverPanel isOpen onClose={()=>void transition(null,true)} widthClassName="max-w-none"
    rightOffset="5rem" panelWidth={panelWidth}
    leftResizeHandle={<div className="aruba-session-panel-resize" {...resizeHandle('panel')}/>}>
     <div className="aruba-session-sheets-split" data-session-sheets-split data-campaign-id={campaignId}
      style={{gridTemplateColumns:`${sidebarWidth}px minmax(0,1fr)`}}>
    <aside className="aruba-session-character-list" aria-label="Lista schede della campagna">
     <SectionHeader title="Personaggi" count={characters.length} isOpen={groups.pg}
      onToggle={()=>setGroups(g=>({...g,pg:!g.pg}))}/>
    {(busy||loadedKey!==requestKey&&!error)&&<p role="status">Caricamento schede…</p>}
    {error&&<div role="alert" className="error"><p>{error}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>Riprova caricamento schede</button></div>}
    {!busy&&!error&&loadedKey===requestKey&&!characters.length&&<p>Nessun personaggio disponibile nella campagna.</p>}
     {groups.pg&&!busy&&!error&&loadedKey===requestKey&&<div className="space-y-1 px-2 pb-2">{characters.map(c=>
      <ArubaSessionSheetRow key={c.id} disabled={switching} name={c.name}
       subtitle={ownerDisplayName||(typeof c.sheetData.player==='string'?c.sheetData.player:'')||(typeof c.sheetData.style==='string'?c.sheetData.style:'')}
       selected={selected?.kind==='pg'&&selected.id===c.id}
       onOpen={()=>void transition({kind:'pg',id:c.id})} label={'Apri scheda di '+c.name}
       portrait={<ArubaSessionSheetPortrait campaignId={campaignId} characterId={c.id} name={c.name} enabled={portraitsEnabled}/>}/>
      )}</div>}
     {narrativeEnabled&&<>
      {narrativeBusy&&<p role="status">Caricamento PNG e Mostri…</p>}
      {narrativeError&&<p role="alert" className="error">{narrativeError}</p>}
      {(['npcs','monsters'] as const).map(kind=>{
       const entries=kind==='npcs'?npcs:monsters;
       const label=kind==='npcs'?'PNG':'Mostri';
       return <div key={kind}>
        <SectionHeader title={label} count={entries.length} isOpen={groups[kind]}
         extraAction={groups[kind]?<button type="button" disabled aria-disabled="true" aria-label={'Nuova cartella '+(kind==='npcs'?'PNG':'Mostri')} title={'Cartelle '+(kind==='npcs'?'PNG':'Mostri')+' non ancora disponibili su Aruba'} className="flex shrink-0 cursor-not-allowed items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1.5 text-[var(--dash-muted)] disabled:opacity-40"><FolderPlus className="h-3.5 w-3.5"/></button>:undefined}
         onToggle={()=>setGroups(g=>({...g,[kind]:!g[kind]}))}/>
        {groups[kind]&&<div className="space-y-1 px-2 pb-2">{entries.map(entry=>
         <ArubaSessionSheetRow key={entry.id} disabled={switching} name={entry.name||entry.title||'Senza nome'}
          subtitle={kind==='npcs'?entry.role||'PNG':'Mostro'}
          hiddenFromPlayers={!entry.visibleToPlayers}
          selected={selected?.kind===kind&&selected.id===entry.id}
          onOpen={()=>void transition({kind,id:entry.id})}
          label={'Apri scheda '+(kind==='npcs'?'PNG':'Mostro')+' di '+(entry.name||entry.title||'Senza nome')}
          portrait={<ArubaSessionSheetPortrait {...entry} campaignId={campaignId} name={entry.name||entry.title||'Senza nome'}/>}/>
        )}</div>}
        {groups[kind]&&!narrativeBusy&&!narrativeError&&entries.length===0&&<p className="muted">Nessun {label} nella campagna.</p>}
       </div>;
      })}
     </>}
     </aside>
    <div className="aruba-session-sidebar-resize" style={{left:sidebarWidth-4}} {...resizeHandle('sidebar')}/>
    <section className="aruba-session-sheet-content" aria-label="Dettaglio scheda della campagna">
     {transitionError&&<p role="alert" className="error">{transitionError}</p>}
     {!selected?<p className="muted">Seleziona una scheda dall'elenco a sinistra.</p>:
      selected.kind==='pg'?<ArubaCharacterDetailPanel embedded
       key={campaignId+':pg:'+selected.id} characterId={selected.id} campaignId={campaignId}
       ownerId={ownerId} ownerDisplayName={ownerDisplayName} notesEnabled={notesEnabled} portraitsEnabled={portraitsEnabled}
       visualAssetsEnabled={visualAssetsEnabled} onClose={()=>{}}
       onChanged={saved=>{if(saved)setCharacters(rows=>rows.map(row=>row.id===saved.id?saved:row));onChanged();}}
       onArchived={()=>{setSelected(null);setRetry(n=>n+1);onChanged();}}
       registerLeaveGuard={registerLeaveGuard}/>:
      <ArubaNarrativeDetailPanel embedded key={campaignId+':'+selected.kind+':'+selected.id}
       campaignId={campaignId} kind={selected.kind} entityId={selected.id} requestId={selected.requestId??0}
       isHSC={ruleset==='hsc'} ruleset={ruleset} notesEnabled={narrativeNotesEnabled}
       visualAssetsEnabled={visualAssetsEnabled} onClose={()=>{}} registerLeaveGuard={registerLeaveGuard}
       onSaved={saved=>{
        if(selected.kind==='npcs')setNpcs(rows=>rows.map(row=>row.id===saved.id?saved:row));
        else setMonsters(rows=>rows.map(row=>row.id===saved.id?saved:row));
        onChanged();
       }}/>}
    </section>
    </div>
  </SlideOverPanel>
 </section>;
}
