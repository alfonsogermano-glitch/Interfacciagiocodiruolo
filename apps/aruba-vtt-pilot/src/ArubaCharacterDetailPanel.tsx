import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeftIcon} from '@phosphor-icons/react';
import {listCharacterDrafts,saveFullCharacterSheet,archiveOwnedCharacter} from './client.mjs';
import {EntityDetailRail,type EntityDetailRailSection} from '../../../src/app/components/session/shared/EntityDetailRail';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {EntityDetailView} from '../../../src/app/components/session/shared/EntityDetailView';
import {ArubaNotesProvider} from './ArubaNotesCapability';
import {ArubaCharacterImageEditor} from './ArubaCharacterImageEditor';
import {readCharacterPortrait} from './client.mjs';
import {awaitArubaNoteWrites,subscribeArubaNoteError} from './ArubaNotesWriteRegistry.mjs';
import type {Character} from '../../../src/types/character';
import {ArubaSheetBoundary} from './ArubaSheetBoundary';
import {withoutCharacterPortraitPresentation} from './character-portrait-presentation.mjs';

type HscCharacter=Character & {player:string;notes:string};
type Draft={id:string;campaignId:string;ownerId:string;name:string;status:'draft'|'active';sheetData:Record<string,unknown>};

export function ArubaCharacterDetailPanel({characterId,campaignId,ownerId,ownerDisplayName,notesEnabled,portraitsEnabled,visualAssetsEnabled,onClose,onChanged,onArchived,embedded=false,registerLeaveGuard}:{
 characterId:string;campaignId:string;ownerId:string;ownerDisplayName?:string;notesEnabled:boolean;portraitsEnabled:boolean;visualAssetsEnabled:boolean;
  onClose:()=>void;onChanged:(saved?:Draft)=>void;onArchived:()=>void;
  embedded?:boolean;registerLeaveGuard?:(guard:(()=>Promise<void>)|null)=>void;
}){
 const [draft,setDraft]=useState<Draft|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [section,setSection]=useState<EntityDetailRailSection>('scheda');
 const [closing,setClosing]=useState(false);
 const [closeError,setCloseError]=useState<string|null>(null);
 const [notesError,setNotesError]=useState<string|null>(null);
 const closeGuard=useRef<()=>Promise<void>>(async()=>{});
  const registerCloseGuard=useCallback((guard:()=>Promise<void>)=>{closeGuard.current=guard;},[]);
  useEffect(()=>{
   registerLeaveGuard?.(async()=>{
    await closeGuard.current();
    if(notesEnabled)await awaitArubaNoteWrites(campaignId,characterId);
   });
   return ()=>registerLeaveGuard?.(null);
  },[registerLeaveGuard,campaignId,characterId,notesEnabled]);
 async function requestClose(){
  if(closing)return;setClosing(true);setCloseError(null);
  try{await closeGuard.current();if(notesEnabled)await awaitArubaNoteWrites(campaignId,characterId);onClose();}
  catch{setCloseError('Il salvataggio non è confermato: verifica la scheda e riprova prima di uscire.');setClosing(false);}
 }
 useEffect(()=>{
  if(!notesEnabled){setNotesError(null);return;}
  return subscribeArubaNoteError(campaignId,characterId,setNotesError);
 },[notesEnabled,campaignId,characterId]);
 useEffect(()=>{
  let alive=true;setDraft(null);setLoading(true);setError(null);setSection('scheda');
  void listCharacterDrafts(fetch,campaignId,ownerId).then(list=>{
   if(!alive)return;
    const found=list.find(d=>d.id===characterId&&d.status==='active');
    if(!found)throw Error('Personaggio non trovato o non autorizzato');
    if(found.sheetData.recoveredPlaceholder===true)
     throw Error('Segnaposto tecnico di recupero: la scheda originale non è presente. Il record è in attesa di pulizia.');
   setDraft(found);
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Errore durante il caricamento');})
  .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[characterId,campaignId,ownerId]);
  if(embedded)return <ArubaNotesProvider enabled={notesEnabled} campaignId={campaignId} characterId={characterId}>
   <div data-session-sheet-detail="pg" data-campaign-id={campaignId} data-entity-id={characterId}>
    {notesError&&<p className="error" role="alert">Note non salvate: {notesError}</p>}
     {loading?<p role="status">Caricamento della scheda…</p>:
     error?<p role="alert" className="error">{error}</p>:
     draft?<ArubaPersistedSheet key={draft.id} draft={draft} ownerId={ownerId} ownerDisplayName={ownerDisplayName}
      onChanged={onChanged} onArchived={onArchived} registerCloseGuard={registerCloseGuard}
       section="scheda" sessionDetail portraitsEnabled={portraitsEnabled} visualAssetsEnabled={visualAssetsEnabled}/>:null}
   </div>
  </ArubaNotesProvider>;
  return <ArubaNotesProvider enabled={notesEnabled} campaignId={campaignId} characterId={characterId}><div className="aruba-entity-overlay" data-entity-context="characters-detail">
  <div className="aruba-entity-backdrop" role="presentation" onClick={()=>void requestClose()}/>
  <SlideOverPanel isOpen onClose={()=>void requestClose()} rightOffset="80px" widthClassName="w-full max-w-6xl">
    <div className="aruba-entity-slide-content">
     <div className="aruba-entity-back-column">
      <button type="button" onClick={()=>void requestClose()} disabled={closing}><ArrowLeftIcon size={17} weight="duotone"/> Torna ai personaggi</button>
     </div>
     <div className="aruba-entity-detail-main">
      {closeError&&<p className="error" role="alert">{closeError}</p>}
      {notesError&&<p className="error" role="alert">Note non salvate: {notesError}</p>}
       {loading?<p>Caricamento della scheda…</p>:
       error?<p role="alert" className="error">{error}</p>:
       draft?<ArubaPersistedSheet draft={draft} ownerId={ownerId} ownerDisplayName={ownerDisplayName} onChanged={onChanged} onArchived={onArchived}
        registerCloseGuard={registerCloseGuard} section={section} onSectionChange={setSection} portraitsEnabled={portraitsEnabled}
        visualAssetsEnabled={visualAssetsEnabled}/>:null}
     </div>
    </div>
  </SlideOverPanel>
  <div className="aruba-entity-rail" aria-label="Barra contestuale personaggio">
   <EntityDetailRail activeSection={section} onSectionChange={setSection}/>
  </div>
 </div></ArubaNotesProvider>;
}
/* Staging: ORIGINAL EntityDetailView base HSC tabs (summary, conditions,
 * equipment, origins, storia). Backend-dependent custom notes are disabled
 * until the Aruba notes API and permissions are ready. */
function ArubaPersistedSheet({draft,ownerId,ownerDisplayName,onChanged,onArchived,registerCloseGuard,section,onSectionChange,sessionDetail=false,portraitsEnabled,visualAssetsEnabled}:{
 draft:Draft;ownerId:string;ownerDisplayName?:string;onChanged:(saved?:Draft)=>void;onArchived:()=>void;
  registerCloseGuard:(guard:()=>Promise<void>)=>void;section:EntityDetailRailSection;onSectionChange?:(section:EntityDetailRailSection)=>void;portraitsEnabled:boolean;visualAssetsEnabled:boolean;
  sessionDetail?:boolean;
}){
 const campaignId=draft.campaignId;
 const [working,setWorking]=useState<HscCharacter>(()=>({
  ...draft.sheetData,id:draft.id,name:draft.name,
  player:'',notes:String(draft.sheetData.notes??''),
 } as HscCharacter));
 // The portrait is deliberately kept out of persistent character JSON.
 const [portrait,setPortrait]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;setPortrait(null);
  if(!portraitsEnabled)return;
  void readCharacterPortrait(fetch,campaignId,draft.id)
   .then(url=>{if(active)setPortrait(url);})
   .catch(()=>{if(active)setPortrait(null);});
  return()=>{active=false;};
 },[campaignId,draft.id,portraitsEnabled]);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [archiving,setArchiving]=useState(false);
 const queue=useRef<Promise<void>>(Promise.resolve());
 const busy=useRef(false);
 const revision=useRef(0);
 useEffect(()=>{registerCloseGuard(()=>queue.current);},[registerCloseGuard]);
  function update(next:HscCharacter){
   if(archiving||busy.current)return;
   next=withoutCharacterPortraitPresentation(next,working) as HscCharacter;
  const currentRevision=++revision.current;
  setWorking(next);setSaving(true);setError(null);
  queue.current=queue.current.catch(()=>{}).then(async()=>{
   try{
     const saved=await saveFullCharacterSheet(fetch,campaignId,draft.id,next,ownerId);
     onChanged(saved);
    if(currentRevision===revision.current)setError(null);
   }catch(e){
    if(currentRevision===revision.current)setError(e instanceof Error?e.message:'Salvataggio non riuscito');
    throw e;
   }
   }).finally(()=>{if(currentRevision===revision.current)setSaving(false);});
   // The queue remains rejected for leave guards, but a failed autosave must
   // not become an unhandled rejection before the user retries or leaves.
   void queue.current.catch(()=>{});
 }
 async function archive(){
  if(busy.current)return;
  busy.current=true;setArchiving(true);setError(null);
  try{
   await queue.current;
   await archiveOwnedCharacter(fetch,campaignId,draft.id,ownerId);
   onArchived();
  }catch(e){setError(e instanceof Error?e.message:'Archiviazione non riuscita');setArchiving(false);busy.current=false;}
 }
 return <section className={sessionDetail?'aruba-session-character-sheet':'aruba-character-sheet'} aria-label={'Scheda di '+working.name}>
  {(saving||error)&&<div className="aruba-character-sheet-status">
    <span>{saving?'Salvataggio in corso…':'Modifiche non confermate'}</span>
   {error&&<span className="unsaved" role="alert">{error}</span>}
   {error&&<button type="button" className="character-panel-return" onClick={()=>update(working)}>Riprova salvataggio</button>}
  </div>}
   <ArubaSheetBoundary><EntityDetailView
    entityType="character" entity={{...working,
     ownerDisplayName,
     portraitImageUrl:portrait??undefined,portraitSourceImageUrl:undefined,portraitCropArea:null}}
    onUpdate={update} canEdit={true}
    campaignId={campaignId} accessToken={null} isHSC={true}
     showOwnerRow={true} showRail={!sessionDetail}
     activeSection={section} onActiveSectionChange={onSectionChange}
    arubaPortraitEditor={visualAssetsEnabled?
     <ArubaCharacterImageEditor entity={{...working,
       portraitImageUrl:portrait??undefined,portraitSourceImageUrl:undefined,portraitCropArea:null}}
      campaignId={campaignId} characterId={draft.id} name={working.name}
      portraitsEnabled={portraitsEnabled} onUpdate={update} onPortraitSaved={setPortrait}/>:
     portraitsEnabled?
       <p className="muted" role="status">Asset grafici non abilitati: cornici e copertine non sono modificabili.</p>:
       <p className="muted" role="status">Archivio ritratti non abilitato. Nessuna modifica alle immagini è consentita.</p>}
    /></ArubaSheetBoundary>
  {archiving&&<p>Archiviazione in corso…</p>}
 </section>;
}
