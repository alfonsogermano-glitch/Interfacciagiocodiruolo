import {useEffect,useState,type FormEvent} from 'react';
import {listCharacterDrafts,createCharacterDraft} from './client.mjs';
type Draft={id:string;campaignId:string;ownerId:string;name:string;status:'draft';sheetData:Record<string,unknown>};
export function ArubaCharacterDrafts({campaignId,ownerId}:{campaignId:string;ownerId:string}){
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [loading,setLoading]=useState(true);
 const [pending,setPending]=useState(false);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;setDrafts([]);setLoading(true);setError(null);
  void listCharacterDrafts(fetch,campaignId,ownerId).then(x=>{if(active)setDrafts(x);})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'Errore caricamento');})
   .finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[campaignId,ownerId]);
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending)return;
  const form=event.currentTarget;
  setPending(true);setError(null);
  try{
   const draft=await createCharacterDraft(fetch,campaignId,String(new FormData(form).get('name')??''),ownerId);
   setDrafts(current=>[draft,...current]);form.reset();
  }catch(e){setError(e instanceof Error?e.message:'Impossibile creare la bozza');}
  finally{setPending(false);}
 }
 return <section className="character-drafts" aria-label="Bozze personaggi Aruba">
   <div className="overline">ARCHIVIO PERSONAGGI · ARUBA</div><h2>Personaggi della campagna</h2>
   <p className="muted">Le bozze sono salvate su Aruba. L'editor originale di Hollowgate non è ancora disponibile: nessuna statistica viene inventata.</p>
   {error&&<p role="alert" className="error">{error}</p>}
   <form onSubmit={e=>void create(e)} className="character-draft-form">
     <label htmlFor="aruba-character-name">Nome bozza</label>
     <input id="aruba-character-name" name="name" required maxLength={120} disabled={pending}/>
     <button type="submit" disabled={pending}>{pending?'Salvataggio…':'Crea bozza'}</button>
   </form>
   {loading?<div className="empty">Caricamento…</div>:drafts.length===0?
    <div className="empty">Nessun personaggio nella campagna.</div>:
    <div className="character-draft-list">{drafts.map(d=><article key={d.id}><strong>{d.name}</strong><span>Bozza · scheda completa da migrare</span></article>)}</div>}
 </section>;
}
