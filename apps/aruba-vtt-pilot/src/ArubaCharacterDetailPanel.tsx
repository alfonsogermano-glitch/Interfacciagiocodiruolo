import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeftIcon} from '@phosphor-icons/react';
import {listCharacterDrafts,saveFullCharacterSheet,archiveOwnedCharacter} from './client.mjs';
import {EntityDetailRail,type EntityDetailRailSection} from '../../../src/app/components/session/shared/EntityDetailRail';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {EntityDetailView} from '../../../src/app/components/session/shared/EntityDetailView';
import {ArubaNotesProvider} from './ArubaNotesCapability';
import {ArubaGMCharacterPortrait} from './ArubaGMCharacterPortrait';
import {readCharacterPortrait} from './client.mjs';
import {awaitArubaNoteWrites,subscribeArubaNoteError} from './ArubaNotesWriteRegistry.mjs';
import type {Character} from '../../../src/types/character';

type HscCharacter=Character & {player:string;notes:string};
type Draft={id:string;campaignId:string;ownerId:string;name:string;status:'draft'|'active';sheetData:Record<string,unknown>};

export function ArubaCharacterDetailPanel({characterId,campaignId,ownerId,notesEnabled,portraitsEnabled,onClose,onChanged,onArchived}:{
 characterId:string;campaignId:string;ownerId:string;notesEnabled:boolean;portraitsEnabled:boolean;
 onClose:()=>void;onChanged:()=>void;onArchived:()=>void;
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
   setDraft(found);
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Errore durante il caricamento');})
  .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[characterId,campaignId,ownerId]);
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
      {loading?<p>Caricamento della scheda da Aruba…</p>:
       error?<p role="alert" className="error">{error}</p>:
       draft?<ArubaPersistedSheet draft={draft} ownerId={ownerId} onChanged={onChanged} onArchived={onArchived}
        registerCloseGuard={registerCloseGuard} section={section} portraitsEnabled={portraitsEnabled}/>:null}
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
function ArubaPersistedSheet({draft,ownerId,onChanged,onArchived,registerCloseGuard,section,portraitsEnabled}:{
 draft:Draft;ownerId:string;onChanged:()=>void;onArchived:()=>void;
 registerCloseGuard:(guard:()=>Promise<void>)=>void;section:EntityDetailRailSection;portraitsEnabled:boolean;
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
  const currentRevision=++revision.current;
  setWorking(next);setSaving(true);setError(null);
  queue.current=queue.current.catch(()=>{}).then(async()=>{
   try{
    await saveFullCharacterSheet(fetch,campaignId,draft.id,next,ownerId);
    onChanged();
    if(currentRevision===revision.current)setError(null);
   }catch(e){
    if(currentRevision===revision.current)setError(e instanceof Error?e.message:'Salvataggio non riuscito');
    throw e;
   }
  }).finally(()=>{if(currentRevision===revision.current)setSaving(false);});
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
 return <section className="aruba-character-sheet" aria-label={'Scheda di '+working.name}>
  <div className="aruba-character-sheet-status">
   <span>{saving?'Salvataggio in corso…':error?'Modifiche non confermate':'Scheda salvata su Aruba'}</span>
   {error&&<span className="unsaved" role="alert">{error}</span>}
   {error&&<button type="button" className="character-panel-return" onClick={()=>update(working)}>Riprova salvataggio</button>}
  </div>
  <EntityDetailView
    entityType="character" entity={{...working,
     portraitImageUrl:portrait??undefined,portraitSourceImageUrl:undefined,portraitCropArea:null}}
    onUpdate={update} canEdit={true}
    campaignId={campaignId} accessToken={null} isHSC={true}
    showOwnerRow={false} showRail={false}
    activeSection={section}
    arubaPortraitEditor={portraitsEnabled?
     <ArubaGMCharacterPortrait campaignId={campaignId} characterId={draft.id} name={working.name}
      onSaved={setPortrait}/>:
     <p className="muted" role="status">Archivio ritratti Aruba non abilitato. Nessuna modifica alle immagini è consentita.</p>}
   />
  {archiving&&<p>Archiviazione in corso…</p>}
 </section>;
}
