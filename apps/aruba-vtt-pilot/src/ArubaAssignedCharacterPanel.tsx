import {useEffect,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {EntityCard} from '../../../src/app/components/session/shared/EntityCard';
import {EntityDetailView} from '../../../src/app/components/session/shared/EntityDetailView';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {EntityDetailRail,type EntityDetailRailSection} from '../../../src/app/components/session/shared/EntityDetailRail';
import {claimAvailableCharacter,getCurrentCharacterClaim,listJoinedPlayerCampaigns,listAssignedPlayerCharacters,readCharacterPortrait,saveClaimedCharacterSheet} from './client.mjs';
import {loadAuthorizedPlayerVisualAssets} from './ArubaPlayerVisualAssets';
import {resolveAuthorizedPlayerMedia} from './player-visual-assets.mjs';
import type {VisualAsset} from './ArubaVisualAssetsStorage';
import type {Character} from '../../../src/types/character';
import {ArubaClaimedCharacterPortrait} from './ArubaClaimedCharacterPortrait';
type Campaign={id:string;ownerId:string;name:string};
type Sheet={id:string;campaignId:string;ownerId:string;name:string;status:string;sheetData:Record<string,unknown>};
/** Player section uses original Hollowgate cards and EntityDetailView. Assigned
 * sheets stay read-only; only the independently verified current claim can save. */
export function ArubaAssignedCharacterPanel({portraitsEnabled=false,visualAssetsEnabled=false,claimsEnabled=false,fixedCampaignId=null}:{portraitsEnabled?:boolean;visualAssetsEnabled?:boolean;claimsEnabled?:boolean;fixedCampaignId?:string|null}){
 // Portrait binary is *never* stored in the character sheet JSON.
 // Load only after character authorization and when server advertises media access.
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [campaignId,setCampaignId]=useState<string|null>(null);
 const [characters,setCharacters]=useState<Sheet[]>([]);
 const [openId,setOpenId]=useState<string|null>(null);
 const [section,setSection]=useState<EntityDetailRailSection>('scheda');
 const [busy,setBusy]=useState(true);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [verifying,setVerifying]=useState(false);
 const [portrait,setPortrait]=useState<string|null>(null);
 const [portraitLoading,setPortraitLoading]=useState(false);
 const [portraitError,setPortraitError]=useState<string|null>(null);
 const [visualAssets,setVisualAssets]=useState<VisualAsset[]>([]);
 const [claimedCharacterId,setClaimedCharacterId]=useState<string|null>(null);
 const [releasing,setReleasing]=useState(false);
 const [saving,setSaving]=useState(false);
 const saveQueue=useRef<Promise<void>>(Promise.resolve());
 const saveRevision=useRef(0);
 // Invalidate any pending detail authorization when the campaign changes.
 const revision=useRef(0);
 async function openAssigned(id:string){
  if(!campaignId||verifying)return;
  const request=++revision.current;
  setVerifying(true);setError(null);
  try{
   // Reauthorize immediately BEFORE opening even if the list is stale.
   const [fresh,claim]=await Promise.all([listAssignedPlayerCharacters(fetch,campaignId),claimsEnabled?getCurrentCharacterClaim(fetch,campaignId):Promise.resolve(null)]);
   if(request!==revision.current)return;
   setCharacters(fresh);setClaimedCharacterId(claim?.characterId??null);
   if(!fresh.some(c=>c.id===id)){
    setOpenId(null);
    setError('Il personaggio non è più assegnato al tuo account.');
   }else{setSection('scheda');setOpenId(id);}
  }catch(e){
   if(request===revision.current){
    setCharacters([]);setOpenId(null);setPortrait(null);setPortraitError(null);
    setError(e instanceof Error?e.message:'Autorizzazione personaggio non verificata');
   }
  }finally{if(request===revision.current)setVerifying(false);}
 }
 useEffect(()=>{
  let active=true;setBusy(true);
   void listJoinedPlayerCampaigns(fetch).then(rows=>{
    if(active){setCampaigns(rows);setCampaignId(fixedCampaignId&&rows.some(row=>row.id===fixedCampaignId)?fixedCampaignId:fixedCampaignId?null:rows[0]?.id??null);
     if(fixedCampaignId&&!rows.some(row=>row.id===fixedCampaignId))setError('Partecipazione alla campagna non più autorizzata.');}
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Campagne non disponibili');})
   .finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
  },[fixedCampaignId]);
 useEffect(()=>{
  let active=true;revision.current++;setVerifying(false);
  setPortrait(null);setPortraitError(null);setPortraitLoading(false);
   setCharacters([]);setClaimedCharacterId(null);setOpenId(null);setSection('scheda');
  if(!campaignId)return;
  setLoading(true);setError(null);
   void Promise.all([listAssignedPlayerCharacters(fetch,campaignId),claimsEnabled?getCurrentCharacterClaim(fetch,campaignId):Promise.resolve(null)]).then(([list,claim])=>{
    if(active){setCharacters(list);setClaimedCharacterId(claim?.characterId??null);}
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Schede non disponibili');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
  },[campaignId,claimsEnabled]);
 async function releaseClaim(characterId:string){
  if(!campaignId||!claimsEnabled||releasing||claimedCharacterId!==characterId)return;
  setReleasing(true);setError(null);
  try{
   await saveQueue.current;
   await claimAvailableCharacter(fetch,characterId,'release');
   const [fresh,claim]=await Promise.all([listAssignedPlayerCharacters(fetch,campaignId),getCurrentCharacterClaim(fetch,campaignId)]);
   setCharacters(fresh);setClaimedCharacterId(claim?.characterId??null);
   if(openId===characterId&&!fresh.some(item=>item.id===characterId)){setOpenId(null);setPortrait(null);setPortraitError(null);}
  }catch(e){setError(e instanceof Error?e.message:'Rilascio personaggio non riuscito');}
  finally{setReleasing(false);}
 }
 // A tab returning to the foreground must not keep showing a revoked sheet.
 // Do not poll user data or silently grant rights based on stale browser state.
 useEffect(()=>{
  if(!campaignId)return;
  let active=true;
  async function verifyOnReturn(){
   const request=++revision.current;
   try{
     const [fresh,claim]=await Promise.all([listAssignedPlayerCharacters(fetch,campaignId),claimsEnabled?getCurrentCharacterClaim(fetch,campaignId):Promise.resolve(null)]);
     if(!active||request!==revision.current)return;
     setCharacters(fresh);setClaimedCharacterId(claim?.characterId??null);
    if(openId&&!fresh.some(c=>c.id===openId)){
     setPortrait(null);setPortraitError(null);
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
  },[campaignId,openId,claimsEnabled]);
 const selected=characters.find(c=>c.id===openId)??null;
 // No player media GET before a confirmed active character assignment.
 // Abort stale responses on campaign switch, revocation, close or unmount.
 useEffect(()=>{
  let live=true;
  setPortrait(null);setPortraitError(null);setPortraitLoading(false);
  if(!selected||!campaignId||!portraitsEnabled)return;
  setPortraitLoading(true);
  void readCharacterPortrait(fetch,campaignId,selected.id)
   .then(img=>{if(live)setPortrait(img);})
   .catch(e=>{if(live){setPortrait(null);
    setPortraitError(e instanceof Error?e.message:'Immagine non disponibile');}})
   .finally(()=>{if(live)setPortraitLoading(false);});
  return()=>{live=false;};
 },[campaignId,selected?.id,portraitsEnabled]);
 // Metadata is fetched only AFTER the assignment recheck above. Fail-soft:
 // missing assets leave frames/cover empty, never fall back to legacy URLs.
 useEffect(()=>{
  let live=true;
  setVisualAssets([]);
  if(!selected||!campaignId||!visualAssetsEnabled)return;
  void loadAuthorizedPlayerVisualAssets(campaignId)
   .then(items=>{if(live)setVisualAssets(items);})
   .catch(()=>{if(live)setVisualAssets([]);});
  return()=>{live=false;};
 },[campaignId,selected?.id,visualAssetsEnabled]);
 const media=selected?resolveAuthorizedPlayerMedia(selected.sheetData,campaignId,visualAssets):null;
 const original=selected?({
  ...selected.sheetData,id:selected.id,name:selected.name,
  // Explicitly discard legacy Supabase URLs and source crop fields. Only
  // PostgreSQL-authorized portrait and referenced visual assets may reach
  // EntityDetailView/Token.
  portraitImageUrl:portrait??undefined,
  portraitSourceImageUrl:undefined,portraitCropArea:null,
  coverImageUrl:media?.coverImageUrl,
  portraitFrameAssetId:media?.portraitFrameAssetId??null,
  coverFrameAssetId:media?.coverFrameAssetId??null,
  player:'',notes:String(selected.sheetData.notes??''),
  } as Character):null;
 function updateClaimed(next:Character){
  if(!selected||claimedCharacterId!==selected.id||releasing)return;
  const characterId=selected.id,campaign=selected.campaignId,ownerId=selected.ownerId;
  const currentRevision=++saveRevision.current;
  setCharacters(items=>items.map(item=>item.id===characterId?{...item,name:next.name,sheetData:next as unknown as Record<string,unknown>}:item));
  setSaving(true);setError(null);
  saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{
   const saved=await saveClaimedCharacterSheet(fetch,campaign,characterId,next,ownerId);
   setCharacters(items=>items.map(item=>item.id===characterId?saved:item));
  }).catch(e=>{if(currentRevision===saveRevision.current)setError(e instanceof Error?e.message:'Salvataggio non riuscito');})
   .finally(()=>{if(currentRevision===saveRevision.current)setSaving(false);});
 }
 return <section className="aruba-player-owned-campaigns" aria-label="I miei personaggi assegnati">
  <h2>I miei personaggi assegnati</h2>
  <p className="muted">Schede autorizzate per la tua partecipazione · i personaggi reclamati sono modificabili.</p>
  {saving&&<p role="status">Salvataggio scheda…</p>}
  {busy&&<p role="status">Caricamento campagne…</p>}
  {error&&<p role="alert">{error}</p>}
  {!busy&&!error&&campaigns.length===0&&<p className="muted">Non partecipi ancora a campagne abilitate.</p>}
   {!fixedCampaignId&&<div aria-label="Campagne a cui partecipo">
    {campaigns.map(c=><button key={c.id} type="button" className="aruba-player-campaign-button"
     aria-pressed={campaignId===c.id} onClick={()=>setCampaignId(c.id)}>{c.name}</button>)}
   </div>}
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
     {claimsEnabled&&claimedCharacterId===c.id&&<button type="button" disabled={releasing}
      className="aruba-player-character-release" onClick={event=>{event.stopPropagation();void releaseClaim(c.id);}}>
      {releasing?'Rilascio…':'Rilascia al GM'}</button>}
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
       {portraitLoading&&<p role="status">Caricamento immagine…</p>}
       {portraitError&&<p role="alert">{portraitError}</p>}
        <EntityDetailView entityType="character" entity={original}
         onUpdate={updateClaimed} canEdit={claimsEnabled&&claimedCharacterId===selected.id&&!releasing} campaignId={selected.campaignId}
         accessToken={null} isHSC={true} isDraft={true} arubaReadOnlyMedia={true}
         arubaReadOnlyVisualAssets={visualAssetsEnabled?visualAssets:undefined}
         arubaPortraitEditor={claimsEnabled&&claimedCharacterId===selected.id&&portraitsEnabled?
          <ArubaClaimedCharacterPortrait campaignId={selected.campaignId} characterId={selected.id} name={selected.name} onSaved={setPortrait}/>:undefined}
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
