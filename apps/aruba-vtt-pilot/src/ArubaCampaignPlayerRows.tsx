import {useEffect,useState} from 'react';
import {EntityCard} from '../../../src/app/components/session/shared/EntityCard';
import {listOwnedCampaignRoster,listCharacterDrafts,listCharacterAvailability,setCharacterAvailability} from './client.mjs';
import {composeOwnedCampaignPlayerRows} from './campaign-player-rows.mjs';
type Char={id:string;campaignId:string;ownerId:string;name:string;status:string;
 sheetData:Record<string,unknown>};
type Row={userId:string;displayName:string;role:'gm'|'player';characters:Char[]};
/** CampaignHome Players subset; authoritative server roles + GM-owned PGs.
 * Player character ownership and assignment cannot be invented. */
export function ArubaCampaignPlayerRows({campaignId,ownerId,revision,availabilityEnabled,onOpenCharacter}:{
 campaignId:string;ownerId:string;revision:number;availabilityEnabled:boolean;onOpenCharacter:(id:string)=>void;
}){
 const [rows,setRows]=useState<Row[]>([]);
 const [busy,setBusy]=useState(true);
 const [availability,setAvailability]=useState<Map<string,boolean>>(new Map());
 const [pending,setPending]=useState<string|null>(null);
 const [saveError,setSaveError]=useState<string|null>(null);
 async function changeAvailable(id:string,now:boolean){
  if(!availabilityEnabled||pending)return;
  setPending(id);setSaveError(null);
  try{
   await setCharacterAvailability(fetch,campaignId,id,!now);
   setAvailability(prev=>new Map(prev).set(id,!now));
  }catch(e){setSaveError(e instanceof Error?e.message:'Impossibile aggiornare la disponibilità');}
  finally{setPending(null);}
 }
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;setRows([]);setError(null);setBusy(true);
  void Promise.all([
   listOwnedCampaignRoster(fetch,campaignId),
   listCharacterDrafts(fetch,campaignId,ownerId),
   availabilityEnabled?listCharacterAvailability(fetch,campaignId):Promise.resolve(new Map()),
  ]).then(([members,characters,flags])=>{
   if(active){setRows(composeOwnedCampaignPlayerRows(members,characters,ownerId));setAvailability(flags);}
  }).catch(reason=>{
   if(active)setError(reason instanceof Error?reason.message:'Partecipanti non disponibili');
  }).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[campaignId,ownerId,revision,availabilityEnabled]);
 return <section className="aruba-campaign-player-rows" aria-label="Partecipanti campagna">
  <h2>Giocatori e personaggi</h2>
  <p className="muted">Ruoli dalla campagna · schede attive del GM. Le assegnazioni ai giocatori non sono ancora disponibili.</p>
  {busy&&<p role="status">Caricamento partecipanti…</p>}
  {error&&<p role="alert">{error}</p>}
  {saveError&&<p role="alert">{saveError}</p>}
  {!busy&&!error&&rows.map(row=><section key={row.userId}
   className="aruba-campaign-player-row" data-campaign-member-id={row.userId}
   aria-label={'Partecipante '+row.displayName}>
   <div className="aruba-campaign-member">
    <strong>{row.displayName}</strong><span>{row.role==='gm'?'Game Master':'Giocatore'}</span>
   </div>
   {row.characters.length>0?
    <div className="aruba-campaign-character-grid">
     {row.characters.map(c=><div key={c.id} role="button" tabIndex={0}
      data-campaign-character-id={c.id} aria-label={'Apri scheda campagna di '+c.name}
      onKeyDown={event=>{if(event.target===event.currentTarget&&
       (event.key==='Enter'||event.key===' ')){event.preventDefault();onOpenCharacter(c.id);}}}>
      <EntityCard name={c.name}
       subtitle={[c.sheetData.style,c.sheetData.viaggio].filter(Boolean).join(' · ')}
       secondaryText={typeof c.sheetData.description==='string'?c.sheetData.description:undefined}
       onClick={()=>onOpenCharacter(c.id)}/>
      {row.role==='gm'&&availabilityEnabled&&
       <button type="button" className="aruba-availability-toggle"
        aria-label={'Disponibilità di '+c.name}
        aria-pressed={availability.get(c.id)===true}
        disabled={pending!==null||!availability.has(c.id)}
        onClick={()=>void changeAvailable(c.id,availability.get(c.id)===true)}>
        {availability.get(c.id)===true?'Disponibile per i giocatori':'Rendi disponibile ai giocatori'}
       </button>}
     </div>)}
    </div>:
    <p className="muted aruba-no-assigned-character">
     {row.role==='gm'?'Nessun personaggio attivo del GM.':'Nessuna scheda assegnata su Aruba.'}
    </p>}
  </section>)}
 </section>;
}
