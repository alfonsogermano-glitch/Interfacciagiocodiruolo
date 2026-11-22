import {useEffect,useRef,useState} from 'react';
import {ArrowLeftIcon} from '@phosphor-icons/react';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {EntityDetailRail,type EntityDetailRailSection} from '../../../src/app/components/session/shared/EntityDetailRail';
import {EntityDetailView} from '../../../src/app/components/session/shared/EntityDetailView';
import {listArubaChapters,listArubaNarrativeContent,saveArubaNarrativeContent} from './client.mjs';
import {ArubaNarrativeNotesProvider} from './ArubaNotesCapability';
import {awaitArubaNoteWrites} from './ArubaNotesWriteRegistry.mjs';
import {ArubaNarrativeImageEditor} from './ArubaNarrativeImageEditor';
import type {RulesetId} from '../../../src/app/campaigns/campaignTypes';

type Kind='npcs'|'monsters';
type Item={id:string;campaignId:string;name:string;[key:string]:unknown};

export function ArubaNarrativeDetailPanel({campaignId,kind,entityId,requestId,isHSC,ruleset,notesEnabled,visualAssetsEnabled,onClose}:{
 campaignId:string;kind:Kind;entityId:string;requestId:number;isHSC:boolean;ruleset:string;notesEnabled:boolean;visualAssetsEnabled:boolean;onClose:()=>void;
}){
 const [item,setItem]=useState<Item|null>(null),[loading,setLoading]=useState(true);
 const [chapters,setChapters]=useState<any[]>([]);
 const [error,setError]=useState<string|null>(null),[saving,setSaving]=useState(false);
 const [section,setSection]=useState<EntityDetailRailSection>('scheda');
 const saveQueue=useRef<Promise<void>>(Promise.resolve());
 const pendingSaves=useRef(0),saveError=useRef<string|null>(null);
 useEffect(()=>{
  let active=true;setItem(null);setLoading(true);setError(null);setSection('scheda');
   void Promise.all([listArubaNarrativeContent(fetch.bind(window),campaignId,kind),listArubaChapters(fetch.bind(window),campaignId)]).then(([items,chapterItems])=>{
   if(!active)return;
   const found=items.find(candidate=>candidate.id===entityId);
   if(!found)throw new Error('Contenuto non trovato o non autorizzato');
    setItem(found as Item);setChapters(chapterItems);
  }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Caricamento non riuscito');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
  },[campaignId,kind,entityId,requestId]);
 const updateItem=(next:Item)=>{
  setItem(next);setError(null);saveError.current=null;setSaving(true);pendingSaves.current+=1;
  saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{
   const saved=await saveArubaNarrativeContent(fetch.bind(window),campaignId,kind,next);
   saveError.current=null;setError(null);
   setItem(current=>current?.id===saved.id?saved as Item:current);
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
 return <ArubaNarrativeNotesProvider enabled={notesEnabled} campaignId={campaignId} kind={kind} entityId={entityId}><div className="aruba-entity-overlay" data-entity-context="narrative-detail">
   <div className="aruba-entity-backdrop" role="presentation" onClick={closeAfterSave}/>
   <SlideOverPanel isOpen onClose={closeAfterSave} rightOffset="80px" widthClassName="w-full max-w-6xl">
    <div className="aruba-entity-slide-content"><div className="aruba-entity-back-column">
     <button type="button" onClick={closeAfterSave} disabled={saving}><ArrowLeftIcon size={17} weight="duotone"/> {saving?'Salvataggio…':'Torna alla sessione'}</button>
    </div><div className="aruba-entity-detail-main">
     {loading?<p role="status">Caricamento {label} da Aruba…</p>:item?<>
      {error&&<p role="alert" className="error">{error}</p>}
      <EntityDetailView entityType={kind==='npcs'?'npc':'monster'} entity={item} onUpdate={updateItem} canEdit
       campaignId={campaignId} accessToken={null} isHSC={isHSC} showRail={false} activeSection={section}
       arubaReadOnlyMedia arubaIsolatedNarrative
       arubaNarrativeChapters={chapters}
       arubaRuleset={ruleset as RulesetId}
       arubaPortraitEditor={visualAssetsEnabled?<ArubaNarrativeImageEditor entity={item as any} campaignId={campaignId}
        kind={kind} onUpdate={next=>updateItem(next as Item)}/>:
        <p className="muted" role="status">Asset grafici Aruba non abilitati: immagini e cornici non sono modificabili.</p>}/></>:error?<p role="alert" className="error">{error}</p>:null}
   </div></div>
  </SlideOverPanel>
  <div className="aruba-entity-rail" aria-label={`Barra contestuale ${label}`}>
   <EntityDetailRail activeSection={section} onSectionChange={setSection}/>
  </div>
 </div></ArubaNarrativeNotesProvider>;
}
