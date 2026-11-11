import {useEffect,useRef,useState,type FormEvent} from 'react';
import {listCharacterDrafts,createCharacterDraft,saveFullCharacterSheet,archiveOwnedCharacter} from './client.mjs';
import {CompleteCharacterSheet} from '../../../src/app/components/CompleteCharacterSheet';
import {CharacterCreationWizard} from '../../../src/app/components/gm/CharacterCreationWizard';
import type {Character} from '../../../src/types/character';

type HscCharacter=Character & {player:string;notes:string};
type Draft={id:string;campaignId:string;ownerId:string;name:string;status:'draft'|'active';sheetData:Record<string,unknown>};

export function ArubaCharacterDrafts({campaignId,ownerId,ruleset}:{
 campaignId:string;ownerId:string;ruleset:string;
}){
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [loading,setLoading]=useState(true);
 const [pending,setPending]=useState(false);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [viewingId,setViewingId]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const savingRef=useRef(false);
 useEffect(()=>{
  let active=true;
  setDrafts([]);setEditingId(null);setViewingId(null);setLoading(true);setError(null);
  void listCharacterDrafts(fetch,campaignId,ownerId).then(list=>{if(active)setDrafts(list);})
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
   setDrafts(list=>[draft,...list]);form.reset();
   if(ruleset==='hsc')setEditingId(draft.id);
  }catch(e){setError(e instanceof Error?e.message:'Impossibile creare la bozza');}
  finally{setPending(false);}
 }
 const editing=drafts.find(d=>d.id===editingId);
 const viewing=drafts.find(d=>d.id===viewingId&&d.status==='active');
 async function save(character:HscCharacter){
  if(!editing||savingRef.current)return;
  savingRef.current=true;setError(null);
  try{
   const saved=await saveFullCharacterSheet(fetch,campaignId,editing.id,character,ownerId);
   setDrafts(list=>list.map(d=>d.id===saved.id?saved:d));
   setEditingId(null);
  }catch(e){setError(e instanceof Error?e.message:'Errore durante il salvataggio');}
  finally{savingRef.current=false;}
 }
 return <section className="character-drafts" aria-label="Personaggi Aruba">
   <div className="overline">PERSONAGGI · DATABASE ARUBA</div><h2>Personaggi della campagna</h2>
   <p className="muted">{ruleset==='hsc'?
    'Editor originale di High School Cthulhu: otto passaggi, abilità, tratti ed equipaggiamento. Le immagini non sono ancora migrabili.':
    'Le schede di questo regolamento non sono ancora state migrate: è possibile conservare bozze nominali.'}</p>
   {error&&<p role="alert" className="error">{error}</p>}
   <form onSubmit={e=>void create(e)} className="character-draft-form">
     <label htmlFor="aruba-character-name">Nome personaggio</label>
     <input id="aruba-character-name" name="name" required maxLength={120} disabled={pending}/>
     <button type="submit" disabled={pending}>{pending?'Salvataggio…':'Nuovo personaggio'}</button>
   </form>
   {loading?<div className="empty">Caricamento…</div>:drafts.length===0?
    <div className="empty">Nessun personaggio nella campagna.</div>:
    <div className="character-draft-list">{drafts.map(d=><article key={d.id}>
      <strong>{d.name}</strong><span>{d.status==='active'?'Scheda completa salvata su Aruba':'Bozza da completare'}</span>
      {ruleset==='hsc'&&d.status==='active'&&<button type="button" className="character-edit-action"
        onClick={()=>{setError(null);setViewingId(d.id);}}>Apri scheda</button>}
      {ruleset==='hsc'&&<button type="button" className="character-edit-action" onClick={()=>{setError(null);setEditingId(d.id);}}>
       {d.status==='active'?'Modifica scheda':'Completa scheda'}</button>}
    </article>)}</div>}
   {viewing&&ruleset==='hsc'&&<ArubaCharacterSheetView
     key={viewing.id} draft={viewing} campaignId={campaignId} ownerId={ownerId}
     onClose={()=>setViewingId(null)}
     onSaved={value=>setDrafts(list=>list.map(item=>item.id===value.id?value:item))}
     onArchived={id=>{setDrafts(list=>list.filter(item=>item.id!==id));setViewingId(null);}}
   />}
   {editing&&ruleset==='hsc'&&<div className="aruba-original-wizard" key={editing.id}>
     <CharacterCreationWizard
       existingCharacters={drafts.filter(d=>d.id!==editing.id).map(d=>({id:d.id,name:d.name}))}
       initialCharacter={editing.status==='active'?({
        ...editing.sheetData,id:editing.id,name:editing.name,
        player:'',notes:String(editing.sheetData.notes??''),
       } as HscCharacter):null}
       onAdd={character=>{void save(character);}}
       onClose={()=>{if(!savingRef.current)setEditingId(null);}}
     />
     {error&&<p className="aruba-wizard-error" role="alert">{error}</p>}
   </div>}
 </section>;
}

function ArubaCharacterSheetView({draft,campaignId,ownerId,onClose,onSaved,onArchived}:{
 draft:Draft;campaignId:string;ownerId:string;
 onClose:()=>void;onSaved:(value:Draft)=>void;onArchived:(id:string)=>void;
}){
 const [working,setWorking]=useState<HscCharacter>(()=>({
  ...draft.sheetData,id:draft.id,name:draft.name,
  player:'',notes:String(draft.sheetData.notes??''),
 } as HscCharacter));
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [archiving,setArchiving]=useState(false);
 const queue=useRef<Promise<void>>(Promise.resolve());
 const busy=useRef(false);
 function update(next:HscCharacter){
  if(archiving||busy.current)return;
  setWorking(next);setSaving(true);setError(null);
  queue.current=queue.current.catch(()=>{}).then(async()=>{
   try{
    const result=await saveFullCharacterSheet(fetch,campaignId,draft.id,next,ownerId);
    onSaved(result);
   }catch(e){setError(e instanceof Error?e.message:'Salvataggio non riuscito');throw e;}
  }).finally(()=>setSaving(false));
 }
 async function close(){
  if(archiving)return;
  try{await queue.current;onClose();}
  catch{setError('Le modifiche non sono state salvate. Riprova prima di chiudere la scheda.');}
 }
 async function archive(){
  if(busy.current)return;
  busy.current=true;setArchiving(true);setError(null);
  try{
   await queue.current;
   const id=await archiveOwnedCharacter(fetch,campaignId,draft.id,ownerId);
   onArchived(id);
  }catch(e){setError(e instanceof Error?e.message:'Archiviazione non riuscita');setArchiving(false);busy.current=false;}
 }
 return <section className="aruba-character-sheet" aria-label={'Scheda completa di '+working.name}>
  <div className="aruba-character-sheet-status">
   <button type="button" className="character-panel-return" onClick={()=>void close()} disabled={archiving}>Torna ai personaggi</button>
   <span>{saving?'Salvataggio in corso…':error?'Modifiche non confermate':'Scheda salvata su Aruba'}</span>
   {error&&<span className="unsaved" role="alert">{error}</span>}
   {error&&<button type="button" className="character-panel-return" onClick={()=>update(working)}>Riprova salvataggio</button>}
  </div>
  <CompleteCharacterSheet
   character={working}
   audacia={working.audacia}
   onAudaciaUpdate={value=>update({...working,audacia:value})}
   onUpdate={update}
   onDelete={()=>void archive()}
  />
  {archiving&&<p>Archiviazione in corso…</p>}
 </section>;
}
