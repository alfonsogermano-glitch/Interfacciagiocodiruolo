import {useEffect,useMemo,useRef,useState} from 'react';
import {ArubaPortraitEntityCard} from './ArubaPortraitEntityCard';
import {listOwnedCampaignRoster,listCharacterDrafts,listCharacterAvailability,setCharacterAvailability,
 listCharacterAssignments,setCharacterAssignment} from './client.mjs';
import {composeOwnedCampaignPlayerRows,validateOwnedCampaignPlayerSnapshot} from './campaign-player-rows.mjs';
type Char={id:string;campaignId:string;ownerId:string;name:string;status:string;
 sheetData:Record<string,unknown>};
type Member={userId:string;displayName:string;role:'gm'|'player'};
type Row={userId:string;displayName:string;role:'gm'|'player';characters:Char[]};
/** Original EntityCard + campaign member rows. Assignment changes are authoritative:
 * only a confirmed Aruba server response updates player grouping. */
export function ArubaCampaignPlayerRows({campaignId,ownerId,revision,availabilityEnabled,assignmentsEnabled,onOpenCharacter,portraitsEnabled=false}:{
 campaignId:string;ownerId:string;revision:number;availabilityEnabled:boolean;
 assignmentsEnabled:boolean;portraitsEnabled?:boolean;onOpenCharacter:(id:string)=>void;
}){
 const [members,setMembers]=useState<Member[]>([]);
 const [characters,setCharacters]=useState<Char[]>([]);
 const [busy,setBusy]=useState(true);
 const [availability,setAvailability]=useState<Map<string,boolean>>(new Map());
 const [assignments,setAssignments]=useState<Map<string,string>>(new Map());
 const [pending,setPending]=useState<string|null>(null);
 const [saveError,setSaveError]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [retryRevision,setRetryRevision]=useState(0);
 const [snapshotKey,setSnapshotKey]=useState('');
 const currentKey=campaignId+':'+ownerId+':'+revision+':'+retryRevision;
 const requestGeneration=useRef(0);
 const currentKeyRef=useRef(currentKey);
 useEffect(()=>{
  currentKeyRef.current=currentKey;
  requestGeneration.current++;
 },[currentKey]);
 const rows=useMemo<Row[]>(()=> {
  if(busy||error||snapshotKey!==currentKey)return [];
  try{return composeOwnedCampaignPlayerRows(members,characters,ownerId,assignments);}
  catch{return [];}
 },[members,characters,ownerId,assignments,busy,error,snapshotKey,currentKey]);
 const groupingError=!busy&&!error&&snapshotKey===currentKey&&rows.length===0?'Assegnazioni o partecipanti non verificati':null;
 async function changeAvailable(id:string,now:boolean){
  if(!availabilityEnabled||pending||busy||error||snapshotKey!==currentKey||assignments.has(id))return;
  const generation=requestGeneration.current;
  setPending(id);setSaveError(null);
  try{
   await setCharacterAvailability(fetch,campaignId,id,!now);
   if(generation===requestGeneration.current&&currentKeyRef.current===currentKey)setAvailability(prev=>new Map(prev).set(id,!now));
  }catch(e){if(generation===requestGeneration.current&&currentKeyRef.current===currentKey)setSaveError(e instanceof Error?e.message:'Impossibile aggiornare la disponibilità');}
  finally{if(generation===requestGeneration.current&&currentKeyRef.current===currentKey)setPending(null);}
 }
 async function changeAssignment(id:string,playerId:string){
  if(!assignmentsEnabled||!availabilityEnabled||pending||busy||error||snapshotKey!==currentKey||!availability.get(id))return;
  const verifiedPlayer=members.some(m=>m.userId===playerId&&m.role==='player');
  if(playerId!==''&&!verifiedPlayer)return;
  const generation=requestGeneration.current;
  setPending(id);setSaveError(null);
  try{
   await setCharacterAssignment(fetch,campaignId,id,playerId||null);
   if(generation===requestGeneration.current)setAssignments(prev=>{
    const next=new Map(prev);
    if(playerId)next.set(id,playerId);else next.delete(id);
    return next;
   });
  }catch(e){if(generation===requestGeneration.current)setSaveError(e instanceof Error?e.message:'Impossibile aggiornare l’assegnazione');}
  finally{if(generation===requestGeneration.current)setPending(null);}
 }
 useEffect(()=>{
  let active=true;
  setSnapshotKey('');setPending(null);
  setMembers([]);setCharacters([]);setAssignments(new Map());setAvailability(new Map());
  setError(null);setSaveError(null);setBusy(true);
  void Promise.all([
   listOwnedCampaignRoster(fetch,campaignId),
   listCharacterDrafts(fetch,campaignId,ownerId),
   availabilityEnabled?listCharacterAvailability(fetch,campaignId):Promise.resolve(new Map()),
   assignmentsEnabled?listCharacterAssignments(fetch,campaignId):Promise.resolve(new Map()),
  ]).then(([roster,pgs,flags,links])=>{
   if(!active)return;
   // Validate the complete server snapshot BEFORE publishing any portion of it
   // to React. A rejected assignment must not leave a partially trusted roster.
   validateOwnedCampaignPlayerSnapshot(roster,pgs,ownerId,flags,links,availabilityEnabled,assignmentsEnabled);
   setMembers(roster);setCharacters(pgs);setAvailability(flags);setAssignments(links);
   setSnapshotKey(currentKey);
  }).catch(reason=>{
   if(active)setError(reason instanceof Error?reason.message:'Partecipanti non disponibili');
  }).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[campaignId,ownerId,revision,retryRevision,availabilityEnabled,assignmentsEnabled]);
 return <section className="aruba-campaign-player-rows" aria-label="Partecipanti campagna">
  <h2>Giocatori e personaggi</h2>
  <p className="muted">Ruoli e assegnazioni verificati dal server · le schede restano di proprietà del GM.</p>
  {(busy||snapshotKey!==currentKey&&!error)&&<p role="status">Caricamento partecipanti…</p>}
  {error&&<div role="alert"><p>{error}</p><button type="button" disabled={busy}
   onClick={()=>setRetryRevision(current=>current+1)}>Riprova caricamento partecipanti</button></div>}
  {groupingError&&<p role="alert">{groupingError}</p>}
  {saveError&&<p role="alert">{saveError}</p>}
  {!busy&&!error&&!groupingError&&snapshotKey===currentKey&&rows.map(row=><section key={row.userId}
   className="aruba-campaign-player-row" data-campaign-member-id={row.userId}
   aria-label={'Partecipante '+row.displayName}>
   <div className="aruba-campaign-member">
    <strong>{row.displayName}</strong><span>{row.role==='gm'?'Game Master':'Giocatore'}</span>
   </div>
   {row.characters.length>0?
    <div className="aruba-campaign-character-grid">
     {row.characters.map(c=><div key={c.id} className="aruba-campaign-character-item"
      data-campaign-character-id={c.id}>
      <div role="button" tabIndex={0} className="aruba-campaign-character-open"
       aria-label={'Apri scheda campagna di '+c.name}
       onKeyDown={event=>{if(event.target===event.currentTarget&&
        (event.key==='Enter'||event.key===' ')){event.preventDefault();onOpenCharacter(c.id);}}}>
      <ArubaPortraitEntityCard campaignId={campaignId} characterId={c.id} enabled={portraitsEnabled} name={c.name}
       subtitle={[c.sheetData.style,c.sheetData.viaggio].filter(Boolean).join(' · ')}
       secondaryText={typeof c.sheetData.description==='string'?c.sheetData.description:undefined}
       onClick={()=>onOpenCharacter(c.id)}/>
      </div>
      {availabilityEnabled&&
       <button type="button" className="aruba-availability-toggle"
        aria-label={'Disponibilità di '+c.name}
        aria-pressed={availability.get(c.id)===true}
        disabled={pending!==null||!availability.has(c.id)||assignments.has(c.id)}
        onClick={()=>void changeAvailable(c.id,availability.get(c.id)===true)}>
        {availability.get(c.id)===true?'Disponibile per i giocatori':'Rendi disponibile ai giocatori'}
       </button>}
      {assignmentsEnabled&&availability.get(c.id)===true&&
       <label className="aruba-assignment-label">
        <span>Assegna a un giocatore</span>
        <select aria-label={'Assegna '+c.name+' a un giocatore'}
         value={assignments.get(c.id)??''} disabled={pending!==null}
         onChange={e=>void changeAssignment(c.id,e.target.value)}>
         <option value="">Nessun giocatore</option>
         {members.filter(m=>m.role==='player').map(m=>
          <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
        </select>
       </label>}
     </div>)}
    </div>:
    <p className="muted aruba-no-assigned-character">
     {row.role==='gm'?'Nessun personaggio attivo non assegnato.':'Nessuna scheda assegnata su Aruba.'}
    </p>}
  </section>)}
 </section>;
}
