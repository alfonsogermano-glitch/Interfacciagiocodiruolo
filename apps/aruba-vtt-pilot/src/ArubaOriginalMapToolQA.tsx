import {useEffect,useState} from 'react';
import {
 setSessionMapReady,setActiveSessionMapTool,configureSessionGrid,
 configureSessionMapFit,configureSessionMapCenter,configureSessionMapHistory,
 DEFAULT_SESSION_GRID,useSessionMapReady,useActiveSessionMapTool,
} from '../../../src/app/components/session/mapToolStore';

/** Dedicated nonshipping browser harness for the untouched mapToolStore.
 * The in-memory canvas fixture cannot persist, sync or mutate campaigns.
 * It must never be confused with a usable multiplayer map. */
export function ArubaOriginalMapToolQA(){
 const ready=useSessionMapReady();
 const tool=useActiveSessionMapTool();
 useEffect(()=>{
  // Hard reset: every QA mount starts with zero map ownership/capabilities.
  setSessionMapReady(false);
  setActiveSessionMapTool('move');
  configureSessionGrid(DEFAULT_SESSION_GRID,false,null);
  configureSessionMapFit(false,null);
  configureSessionMapCenter(false,null);
  configureSessionMapHistory(null,null,false,false);
  return()=>{
   setSessionMapReady(false);
   setActiveSessionMapTool('move');
   configureSessionGrid(DEFAULT_SESSION_GRID,false,null);
   configureSessionMapFit(false,null);
   configureSessionMapCenter(false,null);
   configureSessionMapHistory(null,null,false,false);
  };
 },[]);
 return <section aria-label="Collaudo isolato strumenti mappa" data-map-qa-fixture="local-only"
  className="mt-4 rounded border border-[var(--dash-border-soft)] p-3">
  <p>Stato di prova del solo frontend: nessuna mappa, nessuna campagna e nessuna sessione di rete.</p>
  <div className="flex gap-2">
   <button type="button" onClick={()=>setSessionMapReady(true)} disabled={ready}>
    QA: mappa locale pronta
   </button>
   <button type="button" onClick={()=>{setSessionMapReady(false);setActiveSessionMapTool('move');}} disabled={!ready}>
    QA: mappa disconnessa
   </button>
  </div>
  <output data-map-qa-ready={String(ready)} data-map-qa-tool={tool}>
   {ready?'Mappa di prova (solo stato locale)':'Nessuna mappa pronta'} · Strumento: {tool}
  </output>
 </section>;
}
