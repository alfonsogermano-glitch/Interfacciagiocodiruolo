import {useEffect,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {EntityCard} from '../../../src/app/components/session/shared/EntityCard';
import {EntityDetailView} from '../../../src/app/components/session/shared/EntityDetailView';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {EntityDetailRail,type EntityDetailRailSection} from '../../../src/app/components/session/shared/EntityDetailRail';
import {listJoinedPlayerCampaigns,listAssignedPlayerCharacters} from './client.mjs';
import type {Character} from '../../../src/types/character';
type Campaign={id:string;ownerId:string;name:string};
type Sheet={id:string;campaignId:string;ownerId:string;name:string;status:string;sheetData:Record<string,unknown>};
/** Player section uses original Hollowgate cards and EntityDetailView in read-only
 * mode. No owner-edit API, archive, wizard, token or Notes write provider. */
export function ArubaAssignedCharacterPanel(){
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [campaignId,setCampaignId]=useState<string|null>(null);
 const [characters,setCharacters]=useState<Sheet[]>([]);
 const [openId,setOpenId]=useState<string|null>(null);
 const [section,setSection]=useState<EntityDetailRailSection>('scheda');
 const [busy,setBusy]=useState(true);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [verifying,setVerifying]=useState(false);
 // Invalidate any pending detail authorization when the campaign changes.
 const revision=useRef(0);
 async function openAssigned(id:string){
  if(!campaignId||verifying)return;
  const request=++revision.current;
  setVerifying(true);setError(null);
  try{
   // Reauthorize immediately BEFORE opening even if the list is stale.
   const fresh=await listAssignedPlayerCharacters(fetch,campaignId);
   if(request!==revision.current)return;
   setCharacters(fresh);
   if(!fresh.some(c=>c.id===id)){
    setOpenId(null);
    setError('Il personaggio non è più assegnato al tuo account.');
   }else{setSection('scheda');setOpenId(id);}
  }catch(e){
   if(request===revision.current){
    setCharacters([]);setOpenId(null);
    setError(e instanceof Error?e.message:'Autorizzazione personaggio non verificata');
   }
  }finally{if(request===revision.current)setVerifying(false);}
 }
 useEffect(()=>{
  let active=true;setBusy(true);
  void listJoinedPlayerCampaigns(fetch).then(rows=>{
   if(active){setCampaigns(rows);setCampaignId(rows[0]?.id??null);}
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Campagne non disponibili');})
   .finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  let active=true;revision.current++;setVerifying(false);
  setCharacters([]);setOpenId(null);setSection('scheda');
  if(!campaignId)return;
  setLoading(true);setError(null);
  void listAssignedPlayerCharacters(fetch,campaignId).then(list=>{
   if(active)setCharacters(list);
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Schede non disponibili');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[campaignId]);
 // A tab returning to the foreground must not keep showing a revoked sheet.
 // Do not poll user data or silently grant rights based on stale browser state.
 useEffect(()=>{
  if(!campaignId)return;
  let active=true;
  async function verifyOnReturn(){
   const request=++revision.current;
   try{
    const fresh=await listAssignedPlayerCharacters(fetch,campaignId);
    if(!active||request!==revision.current)return;
    setCharacters(fresh);
    if(openId&&!fresh.some(c=>c.id===openId)){
     setOpenId(null);
     setError('La scheda non è più accessibile: assegnazione revocata.');
    }
   }catch(e){
    if(!active||request!==revision.current)return;
    setCharacters([]);setOpenId(null);
    setError(e instanceof Error?e.message:'Autorizzazione personaggio non verificata');
   }
  }
  const focus=()=>{void verifyOnReturn();};
  const visible=()=>{if(document.visibilityState==='visible')focus();};
  window.addEventListener('focus',focus);
  document.addEventListener('visibilitychange',visible);
  return()=>{active=false;window.removeEventListener('focus',focus);
   document.removeEventListener('visibilitychange',visible);};
 },[campaignId,openId]);
 const selected=characters.find(c=>c.id===openId)??null;
 const original=selected?({
  ...selected.sheetData,id:selected.id,name:selected.name,
  player:'',notes:String(selected.sheetData.notes??''),
 } as Character):null;
 return <section className="aruba-player-owned-campaigns" aria-label="I miei personaggi assegnati">
  <h2>I miei personaggi assegnati</h2>
  <p className="muted">Schede autorizzate per la tua partecipazione · visualizzazione in sola lettura.</p>
  {busy&&<p role="status">Caricamento campagne…</p>}
  {error&&<p role="alert">{error}</p>}
  {!busy&&!error&&campaigns.length===0&&<p className="muted">Non partecipi ancora a campagne abilitate.</p>}
  <div aria-label="Campagne a cui partecipo">
   {campaigns.map(c=><button key={c.id} type="button" className="aruba-player-campaign-button"
    aria-pressed={campaignId===c.id} onClick={()=>setCampaignId(c.id)}>{c.name}</button>)}
  </div>
  {(loading||verifying)&&<p role="status">{verifying?'Verifica autorizzazione…':'Caricamento schede assegnate…'}</p>}
  {!loading&&!error&&campaignId&&characters.length===0&&<p className="muted">Nessun personaggio assegnato in questa campagna.</p>}
  {!loading&&!error&&<div className="aruba-player-character-cards">
   {characters.map(c=><div role="button" tabIndex={0} key={c.id}
     className="aruba-player-character-open" data-player-character-id={c.id}
     aria-label={'Apri scheda assegnata di '+c.name}
     onClick={()=>void openAssigned(c.id)}
     onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){
      e.preventDefault();void openAssigned(c.id);}}}>
    <EntityCard name={c.name}
     subtitle={[c.sheetData.style,c.sheetData.viaggio].filter(Boolean).join(' · ')}/>
   </div>)}
  </div>}
  {selected&&original&&<div className="aruba-entity-overlay" data-entity-context="player-assigned-detail">
   <div className="aruba-entity-backdrop" role="presentation" onClick={()=>setOpenId(null)}/>
   <SlideOverPanel isOpen onClose={()=>setOpenId(null)} rightOffset="80px" widthClassName="w-full max-w-6xl">
    <div className="aruba-entity-slide-content">
     <div className="aruba-entity-back-column">
      <button type="button" onClick={()=>setOpenId(null)}><ArrowLeft size={17}/> Torna ai personaggi</button>
     </div>
     <div className="aruba-entity-detail-main">
      <section aria-label={'Scheda di '+selected.name}>
       <EntityDetailView entityType="character" entity={original}
        onUpdate={()=>{}} canEdit={false} campaignId={selected.campaignId}
        accessToken={null} isHSC={true} isDraft={true}
        showOwnerRow={false} showRail={false} activeSection={section}/>
      </section>
     </div>
    </div>
   </SlideOverPanel>
   <div className="aruba-entity-rail" aria-label="Barra contestuale personaggio">
    <EntityDetailRail activeSection={section} onSectionChange={setSection}/>
   </div>
  </div>}
 </section>;
}
