import {useEffect,useState} from 'react';
import {ArubaPortraitEntityCard} from './ArubaPortraitEntityCard';
import {listCharacterDrafts} from './client.mjs';
export type SessionEntityOpenRequest={kind:'pg';id:string;requestId:number};
type Entry={id:string;campaignId:string;ownerId:string;name:string;status:string;sheetData:Record<string,unknown>};
/** Real Aruba PGs rendered with the original CampaignHome EntityCard. */
export function ArubaCampaignCharacterCards({campaignId,ownerId,revision,onOpenCharacter,portraitsEnabled=false}:{
 campaignId:string;ownerId:string;revision:number;portraitsEnabled?:boolean;onOpenCharacter:(id:string)=>void;
}){
 const [rows,setRows]=useState<Entry[]>([]);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true;setBusy(true);setError(null);setRows([]);
  void listCharacterDrafts(fetch,campaignId,ownerId)
   .then(all=>{if(alive)setRows(all.filter(x=>x.status==='active'));})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:'Personaggi non disponibili');})
   .finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[campaignId,ownerId,revision]);
 return <section className="aruba-campaign-character-section" aria-label="Personaggi della campagna">
  <h2>Personaggi</h2>
  {busy&&<p role="status">Caricamento personaggi della campagna…</p>}
  {error&&<p role="alert" className="error">{error}</p>}
  {!busy&&!error&&!rows.length&&<p>Nessun personaggio attivo in questa campagna.</p>}
  {!busy&&!error&&<div className="aruba-campaign-character-grid">
   {rows.map(c=><div key={c.id} role="button" tabIndex={0}
    data-campaign-character-id={c.id} aria-label={'Apri scheda campagna di '+c.name}
    onKeyDown={event=>{if(event.target===event.currentTarget&&
     (event.key==='Enter'||event.key===' ')){event.preventDefault();onOpenCharacter(c.id);}}}>
    <ArubaPortraitEntityCard campaignId={campaignId} characterId={c.id} enabled={portraitsEnabled} name={c.name}
     subtitle={[c.sheetData.style,c.sheetData.viaggio].filter(Boolean).join(' · ')}
     secondaryText={typeof c.sheetData.description==='string'?c.sheetData.description:undefined}
     onClick={()=>onOpenCharacter(c.id)}/>
   </div>)}
  </div>}
 </section>;
}
