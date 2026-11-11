import {useEffect,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {loadPilotSession,logoutPilot,listOwnedCampaigns,createOwnedCampaign,RULESETS} from './client.mjs';
import './styles.css';
import IconStudy from './icon-study';
import {HouseIcon,UsersThreeIcon,ScrollIcon,GitBranchIcon,PlayIcon,FileTextIcon,IdentificationBadgeIcon,GhostIcon,LightbulbIcon,BookmarkSimpleIcon,MapTrifoldIcon,ImageIcon,SwordIcon} from '@phosphor-icons/react';

type PilotUser={id:string;email:string;displayName:string;role:'admin'|'standard';campaignsEnabled:boolean};
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
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [campaignError,setCampaignError]=useState<string|null>(null);
 const [campaignLoading,setCampaignLoading]=useState(false);
 const [showCreate,setShowCreate]=useState(false);
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
 useEffect(()=>{
  if(!user?.campaignsEnabled)return;
  let alive=true;
  setCampaignLoading(true);
  void listOwnedCampaigns(fetcher,user.id).then(result=>{
    if(alive)setCampaigns(result);
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
   setShowCreate(false);
  }catch(error){setCampaignError(error instanceof Error?error.message:'Errore durante la creazione');}
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
      onClick={()=>setSection(id)}><Icon size={22} weight="duotone" aria-hidden="true"/><span>{label}</span></button>)}
   </nav>
   <div className="primary-campaigns" aria-label="Campagne">
    {campaigns.slice(0,4).map(c=><button key={c.id} type="button" title={c.name}
      onClick={()=>setSection('campaigns')}><span aria-hidden="true">✧</span><small>{c.name}</small></button>)}
   </div>
  </aside>
  <div className="main-area">
   <header className="topbar">
    <div><span className="crumb">HOLLOWGATE / </span>{menu.find(m=>m.id===section)?.label}</div>
    <div className="profile"><span className="avatar">{user.displayName.slice(0,1).toUpperCase()}</span>
     <span className="profile-name">{user.displayName}</span>
     <button type="button" className="logout" onClick={()=>void logout()} disabled={closing}>Esci</button></div>
   </header>
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
       <span>I personaggi saranno disponibili dopo la migrazione dei dati.</span></button>
      <button type="button" className="quick-card" onClick={()=>setSection('campaigns')}>
       <span className="quick-symbol">⌁</span><strong>Unisciti a una sessione</strong>
       <span>Inviti e partecipazioni verranno abilitati con i relativi permessi.</span></button>
     </div>
     <div className="section-heading"><h2>Campagne recenti</h2><button className="text-link" type="button" onClick={()=>setSection('campaigns')}>Vedi tutte</button></div>
     <CampaignList campaigns={campaigns.slice(0,3)} loading={campaignLoading} enabled={user.campaignsEnabled}/>
    </>}
    {section==='campaigns'&&<>
      <div className="overline">STORIE E AVVENTURE</div>
      <div className="section-title"><div><h1>Le tue campagne</h1><p className="muted">Gestisci le storie che hai creato come Game Master.</p></div>
       <button type="button" onClick={()=>setShowCreate(true)} disabled={!user.campaignsEnabled}>+ Nuova campagna</button></div>
      {campaignError&&<p className="error" role="alert">{campaignError}</p>}
      <CampaignList campaigns={campaigns} loading={campaignLoading} enabled={user.campaignsEnabled}/>
      {user.campaignsEnabled&&<p className="footnote">Le campagne Aruba sono nuove e separate dai dati storici Supabase. Le partecipazioni dei giocatori non sono ancora abilitate.</p>}
    </>}
    {!['home','campaigns'].includes(section)&&<>
      <div className="overline">STRUMENTI DI GIOCO</div>
      <h1>{menu.find(m=>m.id===section)?.label}</h1>
      <div className="placeholder">
       <span className="placeholder-mark">✧</span><h2>Un nuovo capitolo sta prendendo forma</h2>
       <p>Stiamo recuperando i componenti del VTT originale e collegandoli ai nuovi servizi Aruba.
        Questa sezione rimane disabilitata fino a quando dati e autorizzazioni non saranno pronti.</p>
      </div>
    </>}
   </main>
  </div>
  <aside className="gm-sidebar" aria-label="Strumenti Game Master">
   {gmMenu.map(({id,label,Icon},i)=><div key={id} className={i===7?'gm-group-break':''}>
    <button type="button" aria-label={label} aria-current={section===id?'page':undefined}
      className={'gm-link'+(section===id?' active':'')} onClick={()=>setSection(id)}>
      <Icon size={19} weight="duotone" aria-hidden="true"/><span>{label}</span>
    </button></div>)}
  </aside>
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
function CampaignList({campaigns,loading,enabled}:{campaigns:Campaign[];loading:boolean;enabled:boolean}){
 if(!enabled)return <div className="empty">La gestione delle campagne sarà disponibile dopo la migrazione PostgreSQL 008.</div>;
 if(loading)return <div className="empty">Caricamento campagne Aruba…</div>;
 if(campaigns.length===0)return <div className="empty">Non hai ancora creato campagne su Aruba.</div>;
 return <div className="campaign-grid">{campaigns.map(c=><article className="campaign-card" key={c.id}>
  <div className="campaign-image"><span>✧</span></div><div className="campaign-body">
   <div className="campaign-type">{RULESETS[c.ruleset as keyof typeof RULESETS]}</div>
   <h3>{c.name}</h3><p>{c.description||'Una nuova avventura ti attende.'}</p>
   <div className="campaign-bottom"><span>Game Master</span><span>Gestione capitoli in preparazione</span></div>
  </div>
 </article>)}</div>;
}
createRoot(document.getElementById('root')!).render(window.location.pathname==='/vtt/icon-study'?<IconStudy/>:<App/>);
