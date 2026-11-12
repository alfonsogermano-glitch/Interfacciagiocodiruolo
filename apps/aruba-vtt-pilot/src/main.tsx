import {useEffect,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {loadPilotSession,logoutPilot,listOwnedCampaigns,createOwnedCampaign,updateOwnedCampaign,RULESETS} from './client.mjs';
import './styles.css';
import './legacy-wizard.css';
import IconStudy from './icon-study';
import {ArubaQuickDice} from './ArubaQuickDice';
import {ArubaCharacterDrafts} from './ArubaCharacterDrafts';
import {ArubaCharacterDetailPanel} from './ArubaCharacterDetailPanel';
import {HouseIcon,UsersThreeIcon,ScrollIcon,GitBranchIcon,PlayIcon,FileTextIcon,IdentificationBadgeIcon,GhostIcon,LightbulbIcon,BookmarkSimpleIcon,MapTrifoldIcon,ImageIcon,SwordIcon} from '@phosphor-icons/react';

type PilotUser={id:string;email:string;displayName:string;role:'admin'|'standard';campaignsEnabled:boolean;charactersEnabled:boolean;entityNotesEnabled:boolean};
type Campaign={id:string;ownerId:string;name:string;description:string;ruleset:string;createdAt:string};
type Status={state:'loading'}|{state:'unauthorized'}|{state:'error'}|{state:'ready';user:PilotUser};
type Section='home'|'campaigns'|'characters'|'chapters'|'preparation'|'sheets'|'npcs'|'monsters'|'clues'|'equipment'|'map'|'situations'|'phases'|'combat'|'assets';
const fetcher=fetch.bind(window);
// Keep the independently tested original Hollowgate left/right navigation contract.
const leftMenu=[
 {id:'home',label:'Panoramica',Icon:HouseIcon},
 {id:'characters',label:'Personaggi',Icon:UsersThreeIcon},
 {id:'campaigns',label:'Campagne',Icon:ScrollIcon},
] as const;
const gmMenu=[
 {id:'chapters',label:'Capitoli e Scene',Icon:GitBranchIcon},
 {id:'preparation',label:'Preparazione',Icon:PlayIcon},
 {id:'sheets',label:'Schede',Icon:FileTextIcon},
 {id:'npcs',label:'PNG',Icon:IdentificationBadgeIcon},
 {id:'monsters',label:'Mostri',Icon:GhostIcon},
 {id:'clues',label:'Indizi',Icon:LightbulbIcon},
 {id:'equipment',label:'Archivio Oggetti',Icon:BookmarkSimpleIcon},
 {id:'map',label:'Mappa legacy',Icon:MapTrifoldIcon},
 {id:'situations',label:'Eventi legacy',Icon:ScrollIcon},
 {id:'phases',label:'Fasi di Gioco',Icon:PlayIcon},
 {id:'combat',label:'Combattimento',Icon:SwordIcon},
 {id:'assets',label:'Asset Grafici',Icon:ImageIcon},
] as const;
const menu=[...leftMenu,...gmMenu];
function App(){
 const [status,setStatus]=useState<Status>({state:'loading'});
 const [section,setSection]=useState<Section>('home');
 // Same architectural contract as original App.tsx/rightSidebarContext.
 // Detail selection belongs to App, not to the catalog or a legacy inline sheet.
 const [entityDetail,setEntityDetail]=useState<{kind:'characters-detail';entityType:'character';id:string;campaignId:string}|null>(null);
 const [characterCatalogRevision,setCharacterCatalogRevision]=useState(0);
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [activeCampaignId,setActiveCampaignId]=useState<string|null>(null);
 const [campaignError,setCampaignError]=useState<string|null>(null);
 const [campaignLoading,setCampaignLoading]=useState(false);
 const [showCreate,setShowCreate]=useState(false);
 const [showEdit,setShowEdit]=useState(false);
 const [submitting,setSubmitting]=useState(false);
 const [closing,setClosing]=useState(false);
 useEffect(()=>{
  let alive=true;
  void loadPilotSession(fetcher).then(user=>{
    if(alive)setStatus(user?{state:'ready',user:user as PilotUser}:{state:'unauthorized'});
  }).catch(()=>{if(alive)setStatus({state:'error'});});
  return ()=>{alive=false;};
 },[]);
 const user=status.state==='ready'?status.user:null;
 const activeCampaign=user?.campaignsEnabled?campaigns.find(c=>c.id===activeCampaignId&&c.ownerId===user.id)??null:null;
 function openCampaign(id:string){
  if(!user?.campaignsEnabled||!campaigns.some(c=>c.id===id&&c.ownerId===user.id))return;
  setActiveCampaignId(id);setSection('campaigns');setEntityDetail(null);
 }
 useEffect(()=>{
  if(!user?.campaignsEnabled)return;
  let alive=true;
  setCampaignLoading(true);
  void listOwnedCampaigns(fetcher,user.id).then(result=>{
    if(alive){setCampaigns(result);setActiveCampaignId(id=>result.some(c=>c.id===id)?id:null);}
  }).catch(error=>{
    if(alive)setCampaignError(error instanceof Error?error.message:'Errore campagne');
  }).finally(()=>{if(alive)setCampaignLoading(false);});
  return ()=>{alive=false;};
 },[user?.id,user?.campaignsEnabled]);
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!user?.campaignsEnabled||submitting)return;
  const form=event.currentTarget;
  const fields=new FormData(form);
  const data={name:String(fields.get('name')||''),description:String(fields.get('description')||''),
   ruleset:String(fields.get('ruleset')||'hsc')};
  setSubmitting(true);setCampaignError(null);
  try{
   const campaign=await createOwnedCampaign(fetcher,data,user.id);
   setCampaigns(current=>[campaign,...current]);
   setActiveCampaignId(campaign.id);
   setShowCreate(false);
  }catch(error){setCampaignError(error instanceof Error?error.message:'Errore durante la creazione');}
  finally{setSubmitting(false);}
 }
 async function editCampaign(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!user?.campaignsEnabled||!activeCampaign||submitting)return;
  const current=activeCampaign;
  const data=new FormData(event.currentTarget);
  setSubmitting(true);setCampaignError(null);
  try{
   const updated=await updateOwnedCampaign(fetcher,current.id,{
    name:String(data.get('name')??''),description:String(data.get('description')??''),
   },user.id);
   setCampaigns(list=>list.map(c=>c.id===updated.id?updated:c));
   setShowEdit(false);
  }catch(error){setCampaignError(error instanceof Error?error.message:'Errore durante la modifica');}
  finally{setSubmitting(false);}
 }
 async function logout(){
  setClosing(true);
  try{await logoutPilot(fetcher);window.location.assign('/login');}
  catch{setStatus({state:'error'});setClosing(false);}
 }
 if(status.state!=='ready')return <main className="entrance">
  <div className="identity"><span className="mark">✧</span><span className="wordmark">HOLLOWGATE</span></div>
  <section className="login-state">
   {status.state==='loading'?<p>Verifica della sessione Aruba…</p>:
    status.state==='unauthorized'?<><h1>Il varco è chiuso</h1><p>Accedi con il tuo account Aruba verificato.</p><a href="/login">Vai al login</a></>:
    <><h1>Connessione non disponibile</h1><p>Non è stato possibile verificare la tua sessione.</p><a href="/login">Riprova l'accesso</a></>}
  </section>
 </main>;
 return <div className="workspace">
  <aside className="primary-sidebar" aria-label="Navigazione principale">
   <div className="primary-identity" aria-label="Hollowgate"><span className="mark">✧</span><span>HOLLOWGATE</span></div>
   <nav className="primary-nav">
    {leftMenu.map(({id,label,Icon})=><button key={id} type="button" aria-label={label}
      aria-current={section===id?'page':undefined}
      className={'primary-link'+(section===id?' active':'')}
      onClick={()=>{setSection(id);setEntityDetail(null);}}><Icon size={22} weight="duotone" aria-hidden="true"/><span>{label}</span></button>)}
   </nav>
   <div className="primary-campaigns" aria-label="Campagne">
    {campaigns.slice(0,4).map(c=><button key={c.id} type="button" title={c.name}
      aria-pressed={activeCampaignId===c.id}
      onClick={()=>openCampaign(c.id)}><span aria-hidden="true">✧</span><small>{c.name}</small></button>)}
   </div>
  </aside>
  <div className="main-area">
   <header className="topbar">
    <div><span className="crumb">HOLLOWGATE / </span>{menu.find(m=>m.id===section)?.label}{activeCampaign&&section!=='home'&&<span className="campaign-context"> / {activeCampaign.name}</span>}</div>
    <div className="profile"><span className="avatar">{user.displayName.slice(0,1).toUpperCase()}</span>
     <span className="profile-name">{user.displayName}</span>
     <button type="button" className="logout" onClick={()=>void logout()} disabled={closing}>Esci</button></div>
   </header>
   <div className="main-workspace-row">
   <main className="content">
    {section==='home'&&<>
     <div className="overline">IL VARCO TI ATTENDE</div>
     <h1>Bentornato, {user.displayName}</h1>
     <p className="muted">La tua nuova casa per le storie che aspettano di essere raccontate.</p>
     <div className="section-heading"><h2>Azioni rapide</h2></div>
     <div className="quick-grid">
      <button type="button" className="quick-card" onClick={()=>{setSection('campaigns');if(user.campaignsEnabled)setShowCreate(true);}}>
       <span className="quick-symbol">▤</span><strong>Crea campagna</strong>
       <span>Avvia una nuova storia e diventa Game Master.</span></button>
      <button type="button" className="quick-card" onClick={()=>setSection('characters')}>
       <span className="quick-symbol">♙</span><strong>Crea personaggio</strong>
       <span>Apri le schede del regolamento HSC recuperate su Aruba.</span></button>
      <button type="button" className="quick-card" onClick={()=>setSection('campaigns')}>
       <span className="quick-symbol">⌁</span><strong>Unisciti a una sessione</strong>
       <span>Inviti e partecipazioni verranno abilitati con i relativi permessi.</span></button>
     </div>
     <div className="section-heading"><h2>Campagne recenti</h2><button className="text-link" type="button" onClick={()=>setSection('campaigns')}>Vedi tutte</button></div>
     <CampaignList campaigns={campaigns.slice(0,3)} loading={campaignLoading} enabled={user.campaignsEnabled} activeId={activeCampaignId} onOpen={openCampaign}/>
    </>}
    {section==='campaigns'&&<>
      <div className="overline">STORIE E AVVENTURE</div>
      <div className="section-title"><div><h1>Le tue campagne</h1><p className="muted">Gestisci le storie che hai creato come Game Master.</p></div>
       <button type="button" onClick={()=>setShowCreate(true)} disabled={!user.campaignsEnabled}>+ Nuova campagna</button></div>
      {campaignError&&<p className="error" role="alert">{campaignError}</p>}
      <CampaignList campaigns={campaigns} loading={campaignLoading} enabled={user.campaignsEnabled} activeId={activeCampaignId} onOpen={openCampaign}/>
      {activeCampaign&&<section className="selected-campaign" aria-label="Campagna selezionata"><div className="overline">CAMPAGNA SELEZIONATA · GAME MASTER</div><h2>{activeCampaign.name}</h2><p>{activeCampaign.description||'Nessuna descrizione'}</p><p>Regolamento: {RULESETS[activeCampaign.ruleset as keyof typeof RULESETS]}</p><p className="footnote">La campagna è stata riletta dall’API Aruba. L'editor originale HSC è ora collegato ad Aruba nella sezione Personaggi. Note, mappe e sessioni restano da migrare.</p><button type="button" onClick={()=>setShowEdit(true)}>Modifica nome e descrizione</button><button type="button" onClick={()=>{setActiveCampaignId(null);setShowEdit(false);}}>Chiudi selezione</button></section>}
      {user.campaignsEnabled&&<p className="footnote">Le campagne Aruba sono nuove e separate dai dati storici Supabase. Le partecipazioni dei giocatori non sono ancora abilitate.</p>}
    </>}
    {section==='characters'&&<>
      {user.charactersEnabled?
       <ArubaCharacterDrafts campaigns={campaigns} activeCampaignId={activeCampaignId} ownerId={user.id}
        catalogRevision={characterCatalogRevision} onOpenDetail={(id,campaignId)=>setEntityDetail({kind:'characters-detail',entityType:'character',id,campaignId})}/>:
       <div className="empty">Servizio personaggi in preparazione.</div>}
    </>}
    {!['home','campaigns','characters'].includes(section)&&<>
      <div className="overline">STRUMENTI DI GIOCO</div>
      <h1>{menu.find(m=>m.id===section)?.label}</h1>
      <div className="placeholder">
       <span className="placeholder-mark">✧</span><h2>{activeCampaign?`Campagna: ${activeCampaign.name}`:'Seleziona prima una campagna'}</h2>
       <p>Stiamo recuperando i componenti del VTT originale e collegandoli ai nuovi servizi Aruba.
        Questa sezione rimane disabilitata fino a quando dati e autorizzazioni non saranno pronti.</p>
      </div>
    </>}
   </main>
  {section!=='characters'&&<aside className="gm-sidebar" aria-label="Strumenti Game Master">
   {gmMenu.map(({id,label,Icon},i)=><div key={id} className={i===7?'gm-group-break':''}>
    <button type="button" aria-label={label} aria-current={section===id?'page':undefined}
      className={'gm-link'+(section===id?' active':'')} onClick={()=>{setSection(id);setEntityDetail(null);}}>
      <Icon size={19} weight="duotone" aria-hidden="true"/><span>{label}</span>
    </button></div>)}
  </aside>}
   </div>
  </div>
  {section==='characters'&&entityDetail&&user.charactersEnabled&&
   <ArubaCharacterDetailPanel key={entityDetail.campaignId+':'+entityDetail.id}
    characterId={entityDetail.id} campaignId={entityDetail.campaignId} ownerId={user.id} notesEnabled={user.entityNotesEnabled}
    onClose={()=>setEntityDetail(null)}
    onChanged={()=>setCharacterCatalogRevision(n=>n+1)}
    onArchived={()=>{setCharacterCatalogRevision(n=>n+1);setEntityDetail(null);}}
   />}
  {activeCampaign&&<ArubaQuickDice campaignId={activeCampaign.id} userId={user.id} rollerName={user.displayName}/>}
  {showEdit&&activeCampaign&&user.campaignsEnabled&&<div className="modal-backdrop" role="presentation" onClick={()=>setShowEdit(false)}>
    <form onSubmit={event=>void editCampaign(event)} className="modal" aria-label="Modifica campagna" onClick={event=>event.stopPropagation()} key={activeCampaign.id}>
      <div className="overline">MODIFICA CAMPAGNA</div><h2>Modifica {activeCampaign.name}</h2>
      <label>Nome<input name="name" required maxLength={100} defaultValue={activeCampaign.name}/></label>
      <label>Descrizione<textarea name="description" maxLength={4000} rows={4} defaultValue={activeCampaign.description}/></label>
      {campaignError&&<p className="error" role="alert">{campaignError}</p>}
      <p className="footnote">Il regolamento non viene modificato per evitare di alterare personaggi e dati esistenti.</p>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowEdit(false)}>Annulla</button>
       <button type="submit" disabled={submitting}>{submitting?'Salvataggio…':'Salva modifiche'}</button></div>
    </form>
   </div>}
  {showCreate&&user.campaignsEnabled&&<div className="modal-backdrop" role="presentation" onClick={()=>setShowCreate(false)}>
    <form onSubmit={event=>void create(event)} className="modal" aria-label="Nuova campagna" onClick={event=>event.stopPropagation()}>
     <div className="overline">NUOVA STORIA</div><h2>Crea una campagna</h2>
     <label>Nome della campagna<input name="name" required minLength={1} maxLength={100} autoFocus/></label>
     <label>Regolamento<select name="ruleset" defaultValue="hsc">
       {Object.entries(RULESETS).filter(([id])=>!['dnd5e','pathfinder'].includes(id)).map(([id,label])=><option key={id} value={id}>{label}</option>)}
     </select></label>
     <label>Descrizione<textarea name="description" rows={4} maxLength={4000}/></label>
     <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowCreate(false)}>Annulla</button>
       <button type="submit" disabled={submitting}>{submitting?'Creazione…':'Crea campagna'}</button></div>
    </form>
   </div>}
 </div>;
}
function CampaignList({campaigns,loading,enabled,activeId,onOpen}:{campaigns:Campaign[];loading:boolean;enabled:boolean;activeId:string|null;onOpen:(id:string)=>void}){
 if(!enabled)return <div className="empty">La gestione delle campagne sarà disponibile dopo la migrazione PostgreSQL 008.</div>;
 if(loading)return <div className="empty">Caricamento campagne Aruba…</div>;
 if(campaigns.length===0)return <div className="empty">Non hai ancora creato campagne su Aruba.</div>;
 return <div className="campaign-grid">{campaigns.map(c=><article className={'campaign-card'+(activeId===c.id?' selected':'')} key={c.id}>
  <div className="campaign-image"><span>✧</span></div><div className="campaign-body">
   <div className="campaign-type">{RULESETS[c.ruleset as keyof typeof RULESETS]}</div>
   <h3>{c.name}</h3><p>{c.description||'Una nuova avventura ti attende.'}</p>
   <div className="campaign-bottom"><span>Game Master</span><button type="button" onClick={()=>onOpen(c.id)} aria-pressed={activeId===c.id}>{activeId===c.id?'Selezionata':'Apri campagna'}</button></div>
  </div>
 </article>)}</div>;
}
createRoot(document.getElementById('root')!).render(window.location.pathname==='/vtt/icon-study'?<IconStudy/>:<App/>);
