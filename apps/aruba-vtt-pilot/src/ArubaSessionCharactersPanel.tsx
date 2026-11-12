import {useEffect,useState} from 'react';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {listCharacterDrafts} from './client.mjs';
import type {SessionEntityOpenRequest} from './ArubaCampaignCharacterCards';
type CharacterEntry={
 id:string;campaignId:string;ownerId:string;name:string;
 status:'draft'|'active';sheetData:Record<string,unknown>;
};
/** Session's Schede panel: Aruba-backed list, original SlideOverPanel and
 * original EntityDetailView via ArubaCharacterDetailPanel on selection.
 * PG only; do not invent PNG/Mostri or a Supabase path. */
export function ArubaSessionCharactersPanel({campaignId,ownerId,initialSelection,onClose,onOpenCharacter}:{
 campaignId:string;ownerId:string;initialSelection?:SessionEntityOpenRequest|null;
 onClose:()=>void;
 onOpenCharacter:(characterId:string)=>void;
}){
 const [characters,setCharacters]=useState<CharacterEntry[]>([]);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;
  setBusy(true);setError(null);setCharacters([]);
  void listCharacterDrafts(fetch,campaignId,ownerId)
   .then(list=>{if(active)setCharacters(list.filter(c=>c.status==='active'));})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'Impossibile caricare le schede');})
   .finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[campaignId,ownerId]);
 return <section className="aruba-session-characters-host" aria-label="Schede della sessione">
  <SlideOverPanel isOpen onClose={onClose} widthClassName="max-w-none"
   rightOffset="5rem" panelWidth={Math.max(320,Math.min(1024,typeof window==='undefined'?1024:window.innerWidth-180))}>
   <div className="aruba-session-character-list">
    <h2>Schede</h2>
    <p className="muted">Personaggi della campagna · schede originali Hollowgate</p>
    {busy&&<p role="status">Caricamento schede…</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {!busy&&!error&&!characters.length&&<p>Nessun personaggio disponibile nella campagna.</p>}
    {!busy&&!error&&characters.map(c=>
     <button key={c.id} type="button" className={'aruba-session-character-row'+(initialSelection?.id===c.id?' selected':'')}
      aria-current={initialSelection?.id===c.id?'true':undefined}
      onClick={()=>onOpenCharacter(c.id)} aria-label={'Apri scheda di '+c.name}>
      <strong>{c.name}</strong><span>Apri la scheda</span>
     </button>)}
   </div>
  </SlideOverPanel>
 </section>;
}
