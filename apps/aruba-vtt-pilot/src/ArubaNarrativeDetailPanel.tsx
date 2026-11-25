import {useEffect,useRef,useState} from 'react';
import {ArrowLeftIcon} from '@phosphor-icons/react';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {EntityDetailRail,type EntityDetailRailSection} from '../../../src/app/components/session/shared/EntityDetailRail';
import {EntityDetailView} from '../../../src/app/components/session/shared/EntityDetailView';
import {saveArubaNarrativeContent} from './client.mjs';
import {loadNarrativeDetail} from './narrative-detail-loader.mjs';
import {ArubaNarrativeNotesProvider} from './ArubaNotesCapability';
import {awaitArubaNoteWrites} from './ArubaNotesWriteRegistry.mjs';
import {ArubaNarrativeImageEditor} from './ArubaNarrativeImageEditor';
import type {RulesetId} from '../../../src/app/campaigns/campaignTypes';
import {ArubaSheetBoundary} from './ArubaSheetBoundary';

type Kind='npcs'|'monsters';
type Item={id:string;campaignId:string;name:string;[key:string]:unknown};

export function ArubaNarrativeDetailPanel({campaignId,kind,entityId,requestId,isHSC,ruleset,notesEnabled,visualAssetsEnabled,onClose,embedded=false,registerLeaveGuard,onSaved}:{
  campaignId:string;kind:Kind;entityId:string;requestId:number;isHSC:boolean;ruleset:string;notesEnabled:boolean;visualAssetsEnabled:boolean;onClose:()=>void;
  embedded?:boolean;registerLeaveGuard?:(guard:(()=>Promise<void>)|null)=>void;
  onSaved?:(item:Item)=>void;
}){
 const [item,setItem]=useState<Item|null>(null),[loading,setLoading]=useState(true);
  const [chapters,setChapters]=useState<any[]>([]);
  const [chapterWarning,setChapterWarning]=useState<string|null>(null);
  const [placementAvailable,setPlacementAvailable]=useState(false);
 const [error,setError]=useState<string|null>(null),[saving,setSaving]=useState(false);
 const [section,setSection]=useState<EntityDetailRailSection>('scheda');
  const saveQueue=useRef<Promise<void>>(Promise.resolve());
  const editRevision=useRef(0);
  const pendingSaves=useRef(0),saveError=useRef<string|null>(null);
  useEffect(()=>{
   registerLeaveGuard?.(async()=>{
    await saveQueue.current;
    if(saveError.current)throw Error(saveError.current);
    if(notesEnabled)await awaitArubaNoteWrites(campaignId,entityId);
   });
   return ()=>registerLeaveGuard?.(null);
  },[registerLeaveGuard,campaignId,entityId,notesEnabled]);
 useEffect(()=>{
   let active=true;setItem(null);setLoading(true);setError(null);setSection('scheda');
   setChapters([]);setChapterWarning(null);setPlacementAvailable(false);
    void loadNarrativeDetail(fetch.bind(window),campaignId,kind,entityId).then(result=>{
    if(!active)return;
     setItem(result.item as Item);setChapters(result.chapters);
     setChapterWarning(result.chapterWarning);setPlacementAvailable(result.placementAvailable);
  }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Caricamento non riuscito');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
  },[campaignId,kind,entityId,requestId]);
  const updateItem=(next:Item)=>{
   if(!placementAvailable&&item&&
    (next.chapterId!==item.chapterId||next.sceneId!==item.sceneId||next.environmentId!==item.environmentId)){
    setError('Collegamenti narrativi non modificabili finché i capitoli non sono verificati.');return;
   }
  const revision=++editRevision.current;
  setItem(next);setError(null);saveError.current=null;setSaving(true);pendingSaves.current+=1;
  saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{
   const saved=await saveArubaNarrativeContent(fetch.bind(window),campaignId,kind,next);
   saveError.current=null;setError(null);
   setItem(current=>revision===editRevision.current&&current?.id===saved.id?saved as Item:current);
    onSaved?.(saved as Item);
  }).catch(reason=>{
   const message=reason instanceof Error?reason.message:'Salvataggio non riuscito';
   saveError.current=message;setError(message);
  }).finally(()=>{pendingSaves.current-=1;if(pendingSaves.current===0)setSaving(false);});
 };
 const closeAfterSave=()=>{void saveQueue.current.then(async()=>{
  if(saveError.current!==null)return;
  try{if(notesEnabled)await awaitArubaNoteWrites(campaignId,entityId);onClose();}
  catch(reason){setError(reason instanceof Error?reason.message:'Salvataggio note non riuscito');}
 });};
  const label=kind==='npcs'?'PNG':'mostro';
  if(embedded)return <ArubaNarrativeNotesProvider enabled={notesEnabled} campaignId={campaignId} kind={kind} entityId={entityId}>
   <div data-session-sheet-detail={kind} data-campaign-id={campaignId} data-entity-id={entityId}>
    {loading?<p role="status">Caricamento {label} da Aruba…</p>:item?<>
     {error&&<p role="alert" className="error">{error}</p>}
     {chapterWarning&&<p role="status" className="muted">{chapterWarning}</p>}
     <ArubaSheetBoundary><EntityDetailView entityType={kind==='npcs'?'npc':'monster'} entity={item}
      onUpdate={updateItem} canEdit campaignId={campaignId} accessToken={null}
      isHSC={isHSC} showRail={false} activeSection="scheda"
      arubaReadOnlyMedia arubaIsolatedNarrative arubaNarrativeChapters={chapters}
      arubaNarrativePlacementUnavailable={!placementAvailable}
      arubaRuleset={ruleset as RulesetId}
      arubaPortraitEditor={visualAssetsEnabled?<ArubaNarrativeImageEditor entity={item as any} campaignId={campaignId}
       kind={kind} onUpdate={next=>updateItem(next as Item)}/>:
       <p className="muted" role="status">Asset grafici non abilitati: immagini e cornici non sono modificabili.</p>}/></ArubaSheetBoundary>
    </>:error?<p role="alert" className="error">{error}</p>:null}
   </div>
  </ArubaNarrativeNotesProvider>;
 return <ArubaNarrativeNotesProvider enabled={notesEnabled} campaignId={campaignId} kind={kind} entityId={entityId}><div className="aruba-entity-overlay" data-entity-context="narrative-detail">
   <div className="aruba-entity-backdrop" role="presentation" onClick={closeAfterSave}/>
   <SlideOverPanel isOpen onClose={closeAfterSave} rightOffset="80px" widthClassName="w-full max-w-6xl">
    <div className="aruba-entity-slide-content"><div className="aruba-entity-back-column">
     <button type="button" onClick={closeAfterSave} disabled={saving}><ArrowLeftIcon size={17} weight="duotone"/> {saving?'Salvataggio…':'Torna alla sessione'}</button>
    </div><div className="aruba-entity-detail-main">
     {loading?<p role="status">Caricamento {label} da Aruba…</p>:item?<>
       {error&&<p role="alert" className="error">{error}</p>}
       {chapterWarning&&<p role="status" className="muted">{chapterWarning}</p>}
       <ArubaSheetBoundary><EntityDetailView entityType={kind==='npcs'?'npc':'monster'} entity={item} onUpdate={updateItem} canEdit
       campaignId={campaignId} accessToken={null} isHSC={isHSC} showRail={false} activeSection={section}
       arubaReadOnlyMedia arubaIsolatedNarrative
        arubaNarrativeChapters={chapters}
        arubaNarrativePlacementUnavailable={!placementAvailable}
       arubaRuleset={ruleset as RulesetId}
       arubaPortraitEditor={visualAssetsEnabled?<ArubaNarrativeImageEditor entity={item as any} campaignId={campaignId}
        kind={kind} onUpdate={next=>updateItem(next as Item)}/>:
         <p className="muted" role="status">Asset grafici Aruba non abilitati: immagini e cornici non sono modificabili.</p>}/></ArubaSheetBoundary></>:error?<p role="alert" className="error">{error}</p>:null}
   </div></div>
  </SlideOverPanel>
  <div className="aruba-entity-rail" aria-label={`Barra contestuale ${label}`}>
   <EntityDetailRail activeSection={section} onSectionChange={setSection}/>
  </div>
 </div></ArubaNarrativeNotesProvider>;
}
