import {useEffect} from 'react';
import {
 setSessionMapReady,setActiveSessionMapTool,configureSessionGrid,
 DEFAULT_SESSION_GRID,useSessionMapReady,useActiveSessionMapTool,
 resetSessionMapRuntime,setSessionMapCurrentUserId,getSessionMapCurrentUserId,
 configureSessionMapFit,configureSessionMapCenter,configureSessionMapHistory,
 setSessionMapSelectionArmed,updateSessionMapFogSettings,
} from '../../../src/app/components/session/mapToolStore';

/** Dedicated nonshipping browser harness for the untouched mapToolStore.
 * The in-memory canvas fixture cannot persist, sync or mutate campaigns.
 * It must never be confused with a usable multiplayer map. */
export function ArubaOriginalMapToolQA(){
 const ready=useSessionMapReady();
 const tool=useActiveSessionMapTool();
 useEffect(()=>{
  // Hard reset: every QA mount starts with zero map ownership/capabilities.
  resetSessionMapRuntime();
  return()=>resetSessionMapRuntime();
 },[]);
 return <section aria-label="Collaudo isolato strumenti mappa" data-map-qa-fixture="local-only"
  className="mt-4 rounded border border-[var(--dash-border-soft)] p-3">
  <p>Stato di prova del solo frontend: nessuna mappa, nessuna campagna e nessuna sessione di rete.</p>
  <div className="flex gap-2">
   <button type="button" onClick={()=>setSessionMapReady(true)} disabled={ready}>
    QA: mappa locale pronta
   </button>
   <button type="button" onClick={()=>resetSessionMapRuntime()} disabled={!ready}>
    QA: mappa disconnessa
   </button>
  </div>
  <button type="button" disabled={!ready} onClick={()=>{
   // Deliberately poison every sensitive global slot, then test that
   // disconnect removes it. No server or persisted map data is involved.
   setSessionMapCurrentUserId('00000000-0000-4000-8000-000000000002');
   configureSessionGrid(DEFAULT_SESSION_GRID,true,()=>{});
   configureSessionMapFit(true,()=>{});
   configureSessionMapCenter(true,()=>{});
   configureSessionMapHistory(()=>{},()=>{},true,true);
   setSessionMapSelectionArmed(true);
   updateSessionMapFogSettings({fullMapCovered:true,previewAsPlayer:true});
  }}>QA: imposta stato GM temporaneo</button>
  <output data-map-qa-user={getSessionMapCurrentUserId()??'none'} />
  <output data-map-qa-ready={String(ready)} data-map-qa-tool={tool}>
   {ready?'Mappa di prova (solo stato locale)':'Nessuna mappa pronta'} · Strumento: {tool}
  </output>
 </section>;
}
