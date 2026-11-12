import {useEffect,useRef,useState} from 'react';
import {listCharacterDrafts,createCharacterDraft,saveFullCharacterSheet} from './client.mjs';
import {CharacterCreationWizard} from '../../../src/app/components/gm/CharacterCreationWizard';
import {EntityFilterToolbar,type SortMode,type ViewMode} from '../../../src/app/components/session/shared/EntityFilterToolbar';
import {EntityCard} from '../../../src/app/components/session/shared/EntityCard';
import {EntityPagination,paginateItems} from '../../../src/app/components/session/shared/EntityPagination';
import {Plus,Users,UserRound,MoreVertical,Pencil} from 'lucide-react';
import type {Character} from '../../../src/types/character';

type HscCharacter=Character & {player:string;notes:string};
type Draft={id:string;campaignId:string;ownerId:string;name:string;status:'draft'|'active';sheetData:Record<string,unknown>;createdAt?:string;updatedAt?:string};

type OwnedCampaign={id:string;name:string;ruleset:string};
export function ArubaCharacterDrafts({campaigns,activeCampaignId,ownerId,onOpenDetail,catalogRevision}:{
 campaigns:OwnedCampaign[];activeCampaignId:string|null;ownerId:string;catalogRevision:number;
 onOpenDetail:(id:string,campaignId:string)=>void;
}){
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [loading,setLoading]=useState(true);
 const [pending,setPending]=useState(false);
 const [creating,setCreating]=useState(false);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [tab,setTab]=useState<'characters'|'npcs'|'monsters'>('characters');
 const [search,setSearch]=useState('');
 const [sort,setSort]=useState<SortMode>('recent');
 const [viewMode,setViewMode]=useState<ViewMode>('grid');
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [filter,setFilter]=useState<'all'|'assigned'|'unassigned'>('all');
 const [campaignFilter,setCampaignFilter]=useState('');
 const [statusFilter,setStatusFilter]=useState<'all'|'completed'|'draft'>('all');
 const [page,setPage]=useState(1);
 const [pageSize,setPageSize]=useState(9);
 const savingRef=useRef(false);
 useEffect(()=>{
  let active=true;
  setDrafts([]);setEditingId(null);setCreating(false);setLoading(true);setError(null);
  void Promise.all(campaigns.map(c=>listCharacterDrafts(fetch,c.id,ownerId))).then(groups=>{
   if(active)setDrafts(groups.flat());
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Errore caricamento');})
   .finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[campaigns,ownerId,catalogRevision]);
 useEffect(()=>setPage(1),[search,sort,filter,campaignFilter,statusFilter,tab,pageSize]);
 const activeCampaign=campaigns.find(c=>c.id===activeCampaignId);
 const canCreate=activeCampaign?.ruleset==='hsc';
 const rulesetFor=(id:string)=>campaigns.find(c=>c.id===id)?.ruleset??'';
 const campaignNameFor=(id:string)=>campaigns.find(c=>c.id===id)?.name??'Campagna non disponibile';
 const filtered=drafts.filter(d=>(filter!=='unassigned')&&
  (statusFilter==='all'||(statusFilter==='completed'?d.status==='active':d.status==='draft'))&&
  (!campaignFilter||d.campaignId===campaignFilter)&&
  [d.name,String(d.sheetData.style??''),String(d.sheetData.viaggio??''),campaignNameFor(d.campaignId)]
   .some(value=>value.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it').trim())));
 filtered.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'it'):sort==='name-desc'?b.name.localeCompare(a.name,'it'):
  sort==='oldest'?(Date.parse(a.createdAt??'')||0)-(Date.parse(b.createdAt??'')||0):
  sort==='updated'?(Date.parse(b.updatedAt??'')||0)-(Date.parse(a.updatedAt??'')||0):
  (Date.parse(b.createdAt??'')||0)-(Date.parse(a.createdAt??'')||0));
 const {pageItems,totalPages,safePage,startIndex,endIndex}=paginateItems(filtered,page,pageSize);
 const editing=drafts.find(d=>d.id===editingId);
 // New character: the ORIGINAL wizard asks the name. No extra name input
 // or empty draft is created until the wizard confirms the full character.
 async function save(character:HscCharacter){
  if(savingRef.current)return;
  savingRef.current=true;setPending(true);setError(null);
  try{
   let target=editing;
   const campaignId=creating?activeCampaign?.id:editing?.campaignId;
   if(!campaignId)throw Error('Seleziona prima la campagna dalla barra sinistra');
   if(creating){
    const draft=await createCharacterDraft(fetch,campaignId,character.name,ownerId);
    target=draft;
    setDrafts(list=>[draft,...list]); // preserve recoverable draft if full save fails
    setEditingId(draft.id);
    setCreating(false);
   }
   if(!target)throw Error('Seleziona un personaggio');
   const saved=await saveFullCharacterSheet(fetch,campaignId,target.id,character,ownerId);
   setDrafts(list=>list.map(d=>d.id===saved.id?saved:d));
   setEditingId(null);setCreating(false);
  }catch(e){setError(e instanceof Error?e.message:'Errore durante il salvataggio');}
  finally{savingRef.current=false;setPending(false);}
 }
 return <section className="aruba-character-library" aria-label="Archivio personaggi">
   <div className="aruba-character-toolbar">
    <div className="aruba-character-tabs" role="tablist" aria-label="Archivi personaggi">
     {([{id:'characters',label:'Personaggi'},{id:'npcs',label:'PNG'},{id:'monsters',label:'Mostri'}] as const).map(entry=>
      <button key={entry.id} role="tab" type="button" aria-selected={tab===entry.id}
       className={tab===entry.id?'selected':''} onClick={()=>setTab(entry.id)}>{entry.label}</button>)}
    </div>
    {tab==='characters'&&<div className="aruba-character-toolbar-actions">
     <button type="button" className="aruba-invite-disabled" disabled title="Inviti disponibili dopo il recupero delle sessioni">Hai un codice invito?</button>
     <button type="button" className="aruba-new-character" disabled={pending||!canCreate}
      title={!canCreate?'Seleziona una campagna High School Cthulhu nella barra sinistra':undefined}
      onClick={()=>{setError(null);setEditingId(null);setCreating(true);}}><Plus size={16}/>Nuovo personaggio</button>
    </div>}
   </div>
   {tab!=='characters'?
    <div className="aruba-library-unavailable">L'archivio {tab==='npcs'?'PNG':'Mostri'} originale sarà collegato ai dati Aruba nella fase dedicata. Nessun dato inventato.</div>:
    <>
     <EntityFilterToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Cerca personaggi..."
      sort={sort} onSortChange={setSort} viewMode={viewMode} onViewModeChange={setViewMode}
      filtersOpen={filtersOpen} onToggleFilters={()=>setFiltersOpen(open=>!open)}
      filtersPanel={<div className="aruba-character-filter-panel">
       <label>Campagna
        <select value={campaignFilter} onChange={e=>setCampaignFilter(e.target.value)}>
         <option value="">Tutte le campagne</option>
         {campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
       </label>
       <label>Stato scheda
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as typeof statusFilter)}>
         <option value="all">Tutte</option><option value="completed">Schede completate</option><option value="draft">Bozze</option>
        </select>
       </label>
       <span>Personaggi di tutte le campagne Aruba di tua proprietà. I personaggi non assegnati e quelli dei giocatori richiedono la migrazione dei permessi.</span>
      </div>}>
      <div className="aruba-character-filter-pills">
       <button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Tutti ({drafts.length})</button>
       <button type="button" aria-pressed={filter==='assigned'} onClick={()=>setFilter('assigned')}>In campagna ({drafts.length})</button>
       <button type="button" aria-pressed={filter==='unassigned'} onClick={()=>setFilter('unassigned')}>Non in campagna (0)</button>
       <button type="button" disabled title="Precompilati richiedibili disponibili dopo la migrazione dei permessi">I miei precompilati</button>
      </div>
     </EntityFilterToolbar>
     <h2 className="aruba-character-section-label"><Users size={17}/> I miei personaggi</h2>
     {error&&<p role="alert" className="error">{error}</p>}
     {loading?<div className="aruba-library-unavailable">Caricamento…</div>:filtered.length===0?
      <div className="aruba-library-unavailable">{drafts.length?'Nessun personaggio trovato con questi filtri.':'Non hai ancora creato personaggi nelle tue campagne Aruba.'}</div>:
      <div className={viewMode==='grid'?'aruba-character-cards':'aruba-character-cards list'}>
       {pageItems.map(d=><EntityCard key={d.id} variant={viewMode} name={d.name}
        subtitle={[d.sheetData.style,d.sheetData.viaggio].filter(Boolean).join(' · ')||'Personaggio'}
        secondaryText={campaignNameFor(d.campaignId)+' · '+(d.status==='active'?'Scheda completata':'Bozza')}
        badge={<span className="aruba-character-ruleset">High School Cthulhu</span>}
        onClick={()=>{setError(null);if(d.status==='active')onOpenDetail(d.id,d.campaignId);else if(rulesetFor(d.campaignId)==='hsc')setEditingId(d.id);}}
        cornerAction={<button className="aruba-character-edit" type="button"
         disabled={rulesetFor(d.campaignId)!=='hsc'}
         aria-label={'Modifica '+d.name} onClick={()=>{setError(null);setEditingId(d.id);}}>
          <Pencil size={17}/>
        </button>}
       />)}
      </div>}
     <EntityPagination page={safePage} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={setPageSize}
      totalPages={totalPages} startIndex={startIndex} endIndex={endIndex}
      totalItems={filtered.length} itemLabelPlural="personaggi"/>
    </>}
   {(editing||creating)&&(creating?canCreate:editing&&rulesetFor(editing.campaignId)==='hsc')&&
    <div className="aruba-original-wizard" key={editing?.id??'new-character'}>
     <CharacterCreationWizard
       existingCharacters={drafts.filter(d=>d.id!==editing?.id).map(d=>({id:d.id,name:d.name}))}
       initialCharacter={editing?.status==='active'?({
        ...editing.sheetData,id:editing.id,name:editing.name,
        player:'',notes:String(editing.sheetData.notes??''),
       } as HscCharacter):null}
       onAdd={character=>{void save(character);}}
       onClose={()=>{if(!savingRef.current){setEditingId(null);setCreating(false);}}}
     />
     {pending&&<p className="aruba-wizard-error" role="status">Salvataggio sul server Aruba…</p>}
     {error&&<p className="aruba-wizard-error" role="alert">{error}</p>}
   </div>}
 </section>;
}
