import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {loadPilotSession,logoutPilot,createOwnedCampaign,updateOwnedCampaign,RULESETS} from './client.mjs';
import {loadCampaignCollections} from './campaign-collections.mjs';
import './styles.css';
import './legacy-wizard.css';
import IconStudy from './icon-study';
import {ArubaDiceToolsProvider,ArubaOriginalDicePanel,ArubaOriginalDiceFloating} from './ArubaDiceTools';
import {ArubaCharacterDrafts} from './ArubaCharacterDrafts';
import {ArubaCharacterDetailPanel} from './ArubaCharacterDetailPanel';
import {ArubaNotesRoute} from './ArubaNotesRoute';
import {ArubaCampaignsPage} from './ArubaCampaignsPage';
import {ArubaCampaignHome} from './ArubaCampaignHome';
import {ArubaCampaignBrandingDialog} from './ArubaCampaignBranding';
import {ArubaJoinInviteDialog,ArubaOwnerInviteDialog} from './ArubaCampaignInvites';
import {ArubaSessionRightRail} from './ArubaSessionRightRail';
import {ArubaSessionCombatPanel} from './ArubaSessionCombatPanel';
import {ArubaSessionEncounterPanel} from './ArubaSessionEncounterPanel';
import {ArubaSessionChatPanel} from './ArubaSessionChatPanel';
import {ArubaGmLiveScene} from './ArubaGmLiveScene';
import {ArubaSessionCharactersPanel} from './ArubaSessionCharactersPanel';
import {ArubaSheetBoundary} from './ArubaSheetBoundary';
import {ArubaCampaignCharacterCards,type SessionEntityOpenRequest} from './ArubaCampaignCharacterCards';
import {ArubaCampaignPlayerRows} from './ArubaCampaignPlayerRows';
import {ArubaAssignedCharacterPanel} from './ArubaAssignedCharacterPanel';
import {ArubaPlayerCharacterDetail} from './ArubaPlayerCharacterDetail';
import {ArubaGmSectionSidebar} from './ArubaGmSectionSidebar';
import {ArubaChapterSceneEditor} from './ArubaChapterSceneEditor';
import {ArubaNarrativeManager} from './ArubaNarrativeManager';
import {ArubaSceneEncounterManager} from './ArubaSceneEncounterManager';
import {ArubaEquipmentCatalog} from './ArubaEquipmentCatalog';
import {ArubaOriginalGameMap} from './ArubaOriginalGameMap';
import {ArubaOriginalSessionWorkspace} from './ArubaOriginalSessionWorkspace';
import {ArubaOriginalPlayerSessionWorkspace} from './ArubaOriginalPlayerSessionWorkspace';
import {ArubaOriginalGamePhases} from './ArubaOriginalGamePhases';
import {ArubaOriginalCombatTracker} from './ArubaOriginalCombatTracker';
import {ArubaOriginalVisualAssets} from './ArubaOriginalVisualAssets';
import {ArubaOriginalCatalog,catalogContractEnabled} from 'aruba-original-catalog-entry';
import {LeftSidebar} from '../../../src/app/layout/LeftSidebar';
import {TopBar} from '../../../src/app/layout/TopBar';
import {AppShell} from '../../../src/app/layout/AppShell';
import {CampaignBannerDisplay} from '../../../src/app/components/shared/CampaignBannerDisplay';
import {DiceAppearanceProvider} from './ArubaDiceAppearanceContext';
import {ArubaTopBarQaIdentity} from './ArubaOriginalTopBarAdapter';
import type {Campaign as OriginalCampaign} from '../../../src/app/campaigns/campaignTypes';
import {HouseIcon,UsersThreeIcon,ScrollIcon,GitBranchIcon,PlayIcon,FileTextIcon,IdentificationBadgeIcon,GhostIcon,LightbulbIcon,BookmarkSimpleIcon,MapTrifoldIcon,ImageIcon,SwordIcon,LightningIcon,UserCircleIcon,DoorOpenIcon} from '@phosphor-icons/react';

type PilotUser={id:string;email:string;displayName:string;role:'admin'|'standard';characterAvailabilityEnabled:boolean;characterAssignmentsEnabled:boolean;playerCharactersEnabled:boolean;characterClaimsEnabled:boolean;characterPortraitsEnabled:boolean;logicalCharactersEnabled:boolean;campaignsEnabled:boolean;campaignInvitesEnabled:boolean;charactersEnabled:boolean;chaptersEnabled:boolean;scenesEnabled:boolean;narrativeContentEnabled:boolean;narrativeEntityNotesEnabled:boolean;equipmentCatalogEnabled:boolean;visualAssetsEnabled:boolean;campaignDocumentsEnabled:boolean;campaignChatEnabled:boolean;diceFormulasEnabled:boolean;entityNotesEnabled:boolean;campaignNotesEnabled:boolean;campaignNoteFoldersEnabled:boolean;originalNotesPanelEnabled:boolean;campaignRosterEnabled:boolean;gameSessionEnabled:boolean;campaignMemberships:{userId:string;campaignId:string;role:'gm'|'player'}[]};
type Campaign={id:string;ownerId:string;name:string;description:string;ruleset:string;createdAt:string;updatedAt?:string;logoUrl?:string|null;coverImageUrl?:string|null};
type Status={state:'loading'}|{state:'unauthorized'}|{state:'error'}|{state:'ready';user:PilotUser};
type Section='home'|'campaigns'|'characters'|'session'|'chapters'|'preparation'|'sheets'|'npcs'|'monsters'|'clues'|'equipment'|'map'|'situations'|'phases'|'combat'|'assets';
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
 {id:'situations',label:'Eventi',Icon:ScrollIcon},
 {id:'phases',label:'Fasi di Gioco',Icon:PlayIcon},
 {id:'combat',label:'Combattimento',Icon:SwordIcon},
 {id:'assets',label:'Asset Grafici',Icon:ImageIcon},
] as const;
const menu=[...leftMenu,...gmMenu];
function App(){
 const [status,setStatus]=useState<Status>({state:'loading'});
  const [topbarNotice,setTopbarNotice]=useState<string|null>(null);
  const [socialLinkProviders,setSocialLinkProviders]=useState<string[]>([]);
 const [section,setSection]=useState<Section>('home');
 const [sessionPanel,setSessionPanel]=useState<'chat'|'notes'|'characters'|'dice'|'encounters'|'combat'|null>(null);
 const [sessionCharacterRequest,setSessionCharacterRequest]=useState<SessionEntityOpenRequest|null>(null);
 const [narrativeOpenRequest,setNarrativeOpenRequest]=useState<{kind:'npcs'|'monsters';id:string;requestId:number}|null>(null);
 const requestSequence=useRef(0);
 const sessionSheetsGuard=useRef<(()=>Promise<void>)|null>(null);
 const registerSessionSheetsGuard=useCallback((guard:(()=>Promise<void>)|null)=>{sessionSheetsGuard.current=guard;},[]);
 async function toggleSessionPanel(panel:'chat'|'notes'|'characters'|'dice'|'encounters'|'combat'){
  try{await sessionSheetsGuard.current?.();}
  catch{setTopbarNotice('Salvataggio scheda non confermato: correggi o riprova prima di chiudere il pannello.');return;}
  setSessionCharacterRequest(null);setNarrativeOpenRequest(null);
  setSessionPanel(current=>current===panel?null:panel);
 }
 function openSessionCharacter(id:string){
  if(!user||!activeCampaign||!(activeCampaignOwned?user.charactersEnabled:user.playerCharactersEnabled))return;
  setSessionPanel('characters');
  setSessionCharacterRequest({kind:'pg',id,requestId:++requestSequence.current});
 }
 function closeSessionCharacter(){
  setSessionCharacterRequest(null);
  setNarrativeOpenRequest(null);
  // The roster is hidden while the original Schede panel owns the surface.
  // Returning from a character detail must restore the campaign roster rather
  // than leave the panel selected with no visible assignment controls.
  setSessionPanel(value=>value==='characters'?null:value);
 }
 function openNarrativeEntity(kind:'npcs'|'monsters',id:string){
  if(!user||!activeCampaign||!activeCampaignOwned||!user.narrativeContentEnabled)return;
  setNarrativeOpenRequest({kind,id,requestId:++requestSequence.current});
  setSessionCharacterRequest(null);setSessionPanel('characters');
 }

 // Same architectural contract as original App.tsx/rightSidebarContext.
 // Detail selection belongs to App, not to the catalog or a legacy inline sheet.
 const [entityDetail,setEntityDetail]=useState<{kind:'characters-detail';entityType:'character';id:string;campaignId:string}|null>(null);
 const [characterCatalogRevision,setCharacterCatalogRevision]=useState(0);
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [joinedCampaigns,setJoinedCampaigns]=useState<Campaign[]>([]);
 const [activeCampaignId,setActiveCampaignId]=useState<string|null>(null);
 const [campaignError,setCampaignError]=useState<string|null>(null);
 const [campaignLoading,setCampaignLoading]=useState(false);
 const [showCreate,setShowCreate]=useState(false);
 const [showEdit,setShowEdit]=useState(false);
 const [branding,setBranding]=useState<{campaignId:string;kind:'logo'|'cover';campaignName:string;ownerId:string;existingImageUrl:string|null;otherImageUrl:string|null}|null>(null);
 const [ownerInviteCampaign,setOwnerInviteCampaign]=useState<Campaign|null>(null);
 const [showJoinInvite,setShowJoinInvite]=useState(false);
 const [liveCampaignId,setLiveCampaignId]=useState<string|null>(null);
 const [liveChannelReady,setLiveChannelReady]=useState(false);
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
 const availableCampaigns=[...campaigns,...joinedCampaigns.filter(joined=>!campaigns.some(owned=>owned.id===joined.id))];
 const activeCampaign=(user?.campaignsEnabled||user?.playerCharactersEnabled)?availableCampaigns.find(c=>c.id===activeCampaignId)??null:null;
 const activeCampaignOwned=!!(user&&activeCampaign&&activeCampaign.ownerId===user.id&&campaigns.some(c=>c.id===activeCampaign.id));
 const activeSessionMembership=user&&activeCampaign?user.campaignMemberships.find(member=>member.userId===user.id&&member.campaignId===activeCampaign.id):undefined;
 const activeSessionRole=activeCampaignOwned?'gm':'player';
 const activeSessionEnabled=!!(user?.gameSessionEnabled&&activeSessionMembership?.role===activeSessionRole);
 // The API session must advertise all dependencies, then an owned
 // campaign must be selected, before the original Notes panel can appear.
 const notesPanelReady=!!(user?.originalNotesPanelEnabled&&user.campaignNotesEnabled&&
  user.campaignNoteFoldersEnabled&&activeCampaign&&activeCampaign.ownerId===user.id);
 function openCampaign(id:string){
  if(!user||!availableCampaigns.some(c=>c.id===id))return;
  setActiveCampaignId(id);setSection('campaigns');setSessionPanel(null);closeSessionCharacter();setNarrativeOpenRequest(null);setEntityDetail(null);
   setLiveCampaignId(current=>current===id?current:null);
  setShowEdit(false);setCampaignError(null);
 }
 function applyCampaignBranding(updated:{id:string;ownerId:string;name:string;description:string;ruleset:string;createdAt:string;updatedAt?:string;logoUrl?:string|null;coverImageUrl?:string|null}){
  setCampaigns(list=>list.map(c=>c.id===updated.id?updated:c));
  setJoinedCampaigns(list=>list.map(c=>c.id===updated.id?updated:c));
 }
 function openBranding(campaignId:string,kind:'logo'|'cover'){
  const owned=campaigns.find(c=>c.id===campaignId)??null;
  const joined=owned?null:joinedCampaigns.find(c=>c.id===campaignId)??null;
  const c=owned??joined;
  if(!c||!user)return;
  setBranding({campaignId,kind,campaignName:c.name,ownerId:c.ownerId,
   existingImageUrl:kind==='logo'?c.logoUrl:c.coverImageUrl,
   otherImageUrl:kind==='logo'?c.coverImageUrl:c.logoUrl});
 }
 function openCampaignCharacter(id:string,campaignId:string){
  const campaign=availableCampaigns.find(item=>item.id===campaignId);
  if(!user||!campaign)return;
   if(campaign.ownerId===user.id&&campaigns.some(item=>item.id===campaignId)){
    setActiveCampaignId(campaignId);setSection('sheets');setSessionPanel(null);
    setEntityDetail({kind:'characters-detail',entityType:'character',id,campaignId});return;
  }
  if(!user.playerCharactersEnabled)return;
  setActiveCampaignId(campaignId);setSection('session');setSessionPanel('characters');
  setSessionCharacterRequest({kind:'pg',id,requestId:++requestSequence.current});
 }
 useEffect(()=>{
  // Identity/capability changes must never retain the previous account's data.
  setCampaigns([]);setJoinedCampaigns([]);setCampaignError(null);
  if(!user?.campaignsEnabled&&!user?.playerCharactersEnabled){setActiveCampaignId(null);setCampaignLoading(false);return;}
  let alive=true;
  setCampaignLoading(true);
  void loadCampaignCollections(fetcher,user).then(({owned,joined,errors})=>{
    if(alive){setCampaigns(owned);setJoinedCampaigns(joined);
     setCampaignError(errors.length?errors.join(' '):null);
     setActiveCampaignId(id=>[...owned,...joined].some(c=>c.id===id)?id:null);}
  }).catch(error=>{
    if(alive){setCampaigns([]);setJoinedCampaigns([]);setActiveCampaignId(null);setCampaignError(error instanceof Error?error.message:'Errore campagne');}
  }).finally(()=>{if(alive)setCampaignLoading(false);});
  return ()=>{alive=false;};
 },[user?.id,user?.campaignsEnabled,user?.playerCharactersEnabled]);
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
  if(!user?.campaignsEnabled||!activeCampaign||!activeCampaignOwned||submitting)return;
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
  async function refreshCatalogCampaigns(){
   if(!user)return;
   const result=await loadCampaignCollections(fetcher,user);
   if(result.errors.length)throw Error(result.errors.join(' '));
   setCampaigns(result.owned);setJoinedCampaigns(result.joined);
  }
  async function openAccountSettings(){
   setSocialLinkProviders([]);
   setTopbarNotice('Le impostazioni complete saranno disponibili dopo la migrazione dei servizi Aruba.');
   try{
    const response=await fetcher('/auth/oauth/providers',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)return;
    const data=await response.json();
    if(Array.isArray(data.providers))setSocialLinkProviders(
     data.providers.filter((provider:unknown)=>provider==='google'||provider==='discord'));
   }catch{/* Provider linking stays hidden when the API is unavailable. */}
  }
  async function linkSocialProvider(provider:string){
   if(!socialLinkProviders.includes(provider))return;
   try{
    const response=await fetcher('/auth/oauth/'+provider+'/start?link=1',{
     method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',
    });
    if(!response.ok)throw new Error('Linking unavailable');
    const {url}=await response.json();
    const target=new URL(url);
    if(target.protocol!=='https:'||
      target.hostname!==(provider==='google'?'accounts.google.com':'discord.com'))
      throw new Error('Unexpected provider');
    window.location.assign(target.href);
   }catch{setTopbarNotice('Collegamento non disponibile. Riprova più tardi.');}
  }
 if(status.state!=='ready')return <main className="entrance">
  <div className="identity"><span className="mark">✧</span><span className="wordmark">HOLLOWGATE</span></div>
  <section className="login-state">
   {status.state==='loading'?<p>Verifica della sessione Aruba…</p>:
    status.state==='unauthorized'?<><h1>Il varco è chiuso</h1><p>Accedi con il tuo account Aruba verificato.</p><a href="/login">Vai al login</a></>:
    <><h1>Connessione non disponibile</h1><p>Non è stato possibile verificare la tua sessione.</p><a href="/login">Riprova l'accesso</a></>}
  </section>
 </main>;
  const ownerSessionWorkspaceActive=section==='map'&&activeCampaignOwned&&user.campaignDocumentsEnabled;
  const liveSessionShellActive=(section==='session'||section==='map')&&!!activeCampaign&&liveCampaignId===activeCampaign.id&&activeSessionEnabled;
  const sessionRailActive=(section==='session'||section==='map')&&!!activeCampaign;
 return <>
  <AppShell className="workspace" settings={{language:'it',palette:'noir',saveMode:'cloud'}}
   mainAreaClassName="main-area" workspaceRowClassName="main-workspace-row"
   contentClassName={`content${section==='home'?' home-content':''}`}
    contentAsMain={!ownerSessionWorkspaceActive} stableContentNode
    leftSidebar={liveSessionShellActive?null:<LeftSidebar
    view={section==='home'?'home':section==='session'?'campaign-home':'dashboard'}
   activeSection={section}
    campaigns={availableCampaigns.map(c=>({...c,ruleset:c.ruleset as OriginalCampaign['ruleset'],updatedAt:c.createdAt??'',logoUrl:c.logoUrl??undefined,coverImageUrl:c.coverImageUrl??undefined}))}
   selectedCampaignId={activeCampaignId}
   onGoHome={()=>{setSection('home');setSessionPanel(null);closeSessionCharacter();setEntityDetail(null);}}
   onGoToHomeSection={id=>{setSection(id);setSessionPanel(null);closeSessionCharacter();setEntityDetail(null);}}
   onGoToCharacters={()=>{setSection('characters');setSessionPanel(null);closeSessionCharacter();setEntityDetail(null);}}
    onGoToCampaigns={()=>{setSection('campaigns');setSessionPanel(null);closeSessionCharacter();setEntityDetail(null);}}
     onSelectCampaign={campaign=>openCampaign(campaign.id)}/>}
   topbar={<><ArubaTopBarQaIdentity user={{id:user.id,email:user.email,displayName:user.displayName,role:user.role}}>
     <TopBar activeSection={section} sessionWorkspaceActive={ownerSessionWorkspaceActive}
     onLogout={()=>{if(!closing)void logout();}}
      onOpenSettings={()=>{void openAccountSettings();}}
     onReportBug={()=>setTopbarNotice('La segnalazione bug non è ancora collegata al servizio Aruba.')}/>
    </ArubaTopBarQaIdentity>
     {topbarNotice&&<div role="alert" className="aruba-topbar-notice">
      <span>{topbarNotice}</span>
      {socialLinkProviders.length>0&&<span>Collega esplicitamente un account social già tuo:
       {socialLinkProviders.map(provider=><button key={provider} type="button"
        onClick={()=>{void linkSocialProvider(provider);}}>Collega {provider==='google'?'Google':'Discord'}</button>)}
      </span>}
      <button type="button" onClick={()=>setTopbarNotice(null)}>Chiudi</button>
    </div>}</>}
     rightSidebar={sessionRailActive&&activeCampaign?
    <ArubaSessionRightRail campaignId={activeCampaign.id}
     isGm={activeCampaignOwned||user.campaignMemberships.some(m=>m.userId===user.id&&m.campaignId===activeCampaign.id&&m.role==='gm')}
       notesEnabled={notesPanelReady}
       chatEnabled={user.campaignChatEnabled}
       charactersEnabled={activeCampaignOwned?!!user.charactersEnabled:!!user.playerCharactersEnabled}
       encountersEnabled={activeCampaignOwned&&user.chaptersEnabled&&user.scenesEnabled&&user.narrativeContentEnabled&&user.campaignDocumentsEnabled}
       combatEnabled={activeCampaignOwned&&user.campaignDocumentsEnabled&&user.narrativeContentEnabled}
       activePanel={sessionPanel}
        onToggleChat={()=>{void toggleSessionPanel('chat');}}
        onToggleNotes={()=>{void toggleSessionPanel('notes');}}
        onToggleCharacters={()=>{void toggleSessionPanel('characters');}}
        onToggleDice={()=>{void toggleSessionPanel('dice');}}
        onToggleEncounters={()=>{void toggleSessionPanel('encounters');}}
        onToggleCombat={()=>{void toggleSessionPanel('combat');}}/>:
    activeCampaignOwned&&(gmMenu.some(item=>item.id===section)||section==='campaigns')?<ArubaGmSectionSidebar
     activeTab={section==='preparation'?'scene-encounter':section==='sheets'?'players':section==='equipment'?'equipment-catalog':section==='assets'?'visual-assets':section}
     onChangeTab={id=>{
      const target=id==='scene-encounter'?'preparation':id==='players'?'sheets':id==='equipment-catalog'?'equipment':id==='visual-assets'?'assets':id;
      setSection(target as Section);setSessionPanel(null);closeSessionCharacter();setEntityDetail(null);
     }}/>:undefined}>
      {activeCampaign&&user.gameSessionEnabled&&user.campaignMemberships.some(m=>m.userId===user.id&&m.campaignId===activeCampaign.id&&
       m.role===(activeCampaign.ownerId===user.id?'gm':'player'))&&
       <ArubaGmLiveScene key={`${activeCampaign.id}:live`} bootstrap={user} campaign={activeCampaign}
        active={liveCampaignId===activeCampaign.id} visible={section==='session'&&liveCampaignId===activeCampaign.id} onChannelReady={setLiveChannelReady}/>}
      {section==='home'&&<>
      <div className="home-hero"><span className="home-hero-icon" aria-hidden="true"><GhostIcon size={28} weight="duotone"/></span><div>
       <div className="home-eyebrow">HOLLOW GATE DASHBOARD</div>
       <h1>Bentornato, {user.displayName}</h1>
      </div></div>
      <section className="home-section" aria-labelledby="home-quick-title">
       <div className="home-section-heading"><LightningIcon size={20} weight="duotone" aria-hidden="true"/><h2 id="home-quick-title">Azioni rapide</h2></div>
       <div className="quick-grid">
        <button type="button" className="quick-card" onClick={()=>{setSection('campaigns');if(user.campaignsEnabled)setShowCreate(true);}}>
         <ScrollIcon className="quick-card-icon" size={36} weight="duotone" aria-hidden="true"/>
         <h3>Crea campagna</h3><p>Avvia una nuova storia e diventa il Game Master.</p></button>
        <button type="button" className="quick-card" onClick={()=>setSection('characters')}>
         <UserCircleIcon className="quick-card-icon" size={36} weight="duotone" aria-hidden="true"/>
         <h3>Crea personaggio</h3><p>Dai vita a un nuovo eroe pronto a entrare nella storia.</p></button>
         <button type="button" className="quick-card" disabled={!user.campaignInvitesEnabled} title={user.campaignInvitesEnabled?'Inserisci un codice invito':'Inviti campagna non disponibili'} onClick={()=>{if(user.campaignInvitesEnabled)setShowJoinInvite(true);}}>
         <DoorOpenIcon className="quick-card-icon" size={36} weight="duotone" aria-hidden="true"/>
         <h3>Unisciti a sessione</h3><p>Inserisci un codice invito per entrare in una campagna.</p></button>
       </div>
      </section>
      <section className="home-section" aria-labelledby="home-recent-title">
       <div className="home-section-heading"><ScrollIcon size={20} weight="duotone" aria-hidden="true"/><h2 id="home-recent-title">Campagne recenti</h2></div>
       <HomeRecentCampaign campaign={availableCampaigns[0]??null} loading={campaignLoading} enabled={user.campaignsEnabled||user.playerCharactersEnabled} onOpen={openCampaign}/>
       {campaignError&&<p className="error" role="alert">{campaignError}</p>}
      </section>
    </>}
    {section==='campaigns'&&<>
       <ArubaCampaignsPage campaigns={availableCampaigns} loading={campaignLoading} enabled={user.campaignsEnabled||user.playerCharactersEnabled}
        createEnabled={user.campaignsEnabled}
        ownerId={user.id} activeId={activeCampaignId}
        membersEnabled={user.campaignRosterEnabled} charactersEnabled={user.charactersEnabled} playerCharactersEnabled={user.playerCharactersEnabled}
       onCreate={()=>setShowCreate(true)} onOpen={openCampaign}
        onOpenCharacter={openCampaignCharacter}
        onBrandingOpen={(campaignId,kind)=>{void openBranding(campaignId,kind);}}
        brandingEnabled={user.visualAssetsEnabled&&user.campaignsEnabled}
        onBrandingUpdated={(updated)=>{void applyCampaignBranding(updated);}}/>
      {campaignError&&<p className="error" role="alert">{campaignError}</p>}
       {activeCampaign&&<section className="selected-campaign" aria-label="Campagna selezionata"><div className="overline">CAMPAGNA SELEZIONATA · {activeCampaignOwned?'GAME MASTER':'GIOCATORE'}</div><h2>{activeCampaign.name}</h2><p>{activeCampaign.description||'Nessuna descrizione'}</p><p>Regolamento: {RULESETS[activeCampaign.ruleset as keyof typeof RULESETS]}</p><p className="footnote">Campagna riletta dall’API Aruba con accesso {activeCampaignOwned?'proprietario':'giocatore in sola lettura'}.</p><button type="button" onClick={()=>{setSessionPanel(null);setSection('session');}}>Entra nella campagna</button>{activeCampaignOwned&&<button type="button" onClick={()=>setShowEdit(true)}>Modifica nome e descrizione</button>}<button type="button" onClick={()=>{setActiveCampaignId(null);setSessionPanel(null);setShowEdit(false);}}>Chiudi selezione</button></section>}
    </>}
    {section==='characters'&&!catalogContractEnabled&&<>
      {user.playerCharactersEnabled&&<ArubaAssignedCharacterPanel portraitsEnabled={user.characterPortraitsEnabled} visualAssetsEnabled={user.visualAssetsEnabled} claimsEnabled={user.characterClaimsEnabled} />}
      {user.charactersEnabled?
       <ArubaCharacterDrafts campaigns={campaigns} activeCampaignId={activeCampaignId} ownerId={user.id}
        catalogRevision={characterCatalogRevision} portraitsEnabled={user.characterPortraitsEnabled} onOpenDetail={(id,campaignId)=>setEntityDetail({kind:'characters-detail',entityType:'character',id,campaignId})}/>:
       <div className="empty">Servizio personaggi in preparazione.</div>}
    </>}
    {section==='session'&&activeCampaign&&<div className="aruba-session-content" key={activeCampaign.id}>
       <ArubaSheetBoundary key={activeCampaign.id} label="Campagna"><ArubaCampaignHome campaign={activeCampaign} revision={characterCatalogRevision}
       onOpenCharacter={openSessionCharacter}
        onOpenNarrative={openNarrativeEntity}
       onGoToManagement={()=>{setSessionPanel(null);closeSessionCharacter();setSection('campaigns');}}
        onEditCampaign={()=>{if(activeCampaignOwned)setShowEdit(true);}}
        brandingEnabled={user.visualAssetsEnabled}
         onBrandingOpen={(kind)=>{void openBranding(activeCampaign.id,kind);}}
        inviteEnabled={user.campaignInvitesEnabled&&activeCampaignOwned}
        onInvite={()=>{if(user.campaignInvitesEnabled&&activeCampaignOwned)setOwnerInviteCampaign(activeCampaign);}}
        sessionEnabled={activeSessionEnabled}
         sessionActive={liveCampaignId===activeCampaign.id}
         sessionReady={liveChannelReady}
         onToggleSession={()=>{if(activeSessionEnabled){setLiveChannelReady(false);setLiveCampaignId(current=>current===activeCampaign.id?null:activeCampaign.id);}}}
         onOpenMap={()=>{if(activeSessionEnabled&&liveCampaignId===activeCampaign.id&&liveChannelReady){setSessionPanel(null);setSection('map');}}}
       viewer={{id:user.id,displayName:user.displayName,
        campaignRosterEnabled:user.campaignRosterEnabled,charactersEnabled:user.charactersEnabled,
        characterAvailabilityEnabled:user.characterAvailabilityEnabled,
        characterAssignmentsEnabled:user.characterAssignmentsEnabled,
         narrativeContentEnabled:user.narrativeContentEnabled,
         characterPortraitsEnabled:user.characterPortraitsEnabled,
         playerCharactersEnabled:user.playerCharactersEnabled,
         characterClaimsEnabled:user.characterClaimsEnabled,
         logicalCharactersEnabled:user.logicalCharactersEnabled,
          campaignMemberships:user.campaignMemberships}}/></ArubaSheetBoundary>
       {sessionPanel==='combat'&&activeCampaignOwned&&user.campaignDocumentsEnabled&&user.narrativeContentEnabled&&
        <ArubaSessionCombatPanel campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.updatedAt??activeCampaign.createdAt}} onClose={()=>setSessionPanel(null)}/>}
       {sessionPanel==='encounters'&&activeCampaignOwned&&user.chaptersEnabled&&user.scenesEnabled&&user.narrativeContentEnabled&&user.campaignDocumentsEnabled&&
        <ArubaSessionEncounterPanel campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.updatedAt??activeCampaign.createdAt}} onClose={()=>setSessionPanel(null)}/>}
       {sessionPanel==='chat'&&user.campaignChatEnabled&&
        <ArubaSessionChatPanel campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.updatedAt??activeCampaign.createdAt}} user={{id:user.id,email:user.email,displayName:user.displayName,role:user.role}} onClose={()=>setSessionPanel(null)}/>}
      {sessionPanel==='notes'&&notesPanelReady&&
       <ArubaNotesRoute key={activeCampaign.id} campaignId={activeCampaign.id}
        userId={user.id} ownerId={activeCampaign.ownerId}
        onClose={()=>setSessionPanel(null)}/>}
       {sessionPanel==='characters'&&activeCampaignOwned&&user.charactersEnabled&&
        <ArubaSessionCharactersPanel key={activeCampaign.id} campaignId={activeCampaign.id}
         narrativeEnabled={user.narrativeContentEnabled}
         ruleset={activeCampaign.ruleset} notesEnabled={user.entityNotesEnabled}
         narrativeNotesEnabled={user.narrativeEntityNotesEnabled}
         portraitsEnabled={user.characterPortraitsEnabled} visualAssetsEnabled={user.visualAssetsEnabled}
         registerPanelGuard={registerSessionSheetsGuard}
         onChanged={()=>setCharacterCatalogRevision(n=>n+1)}
         ownerId={user.id} ownerDisplayName={user.displayName} initialSelection={narrativeOpenRequest??sessionCharacterRequest}
         onClose={()=>{setSessionPanel(null);closeSessionCharacter();}}
        />}
      {sessionPanel==='characters'&&!sessionCharacterRequest&&!activeCampaignOwned&&user.playerCharactersEnabled&&
       <ArubaAssignedCharacterPanel key={activeCampaign.id+':player-panel'} fixedCampaignId={activeCampaign.id}
        portraitsEnabled={user.characterPortraitsEnabled} visualAssetsEnabled={user.visualAssetsEnabled} claimsEnabled={user.characterClaimsEnabled}/>}
    </div>}
    {section==='chapters'&&activeCampaign&&
     <ArubaChapterSceneEditor key={activeCampaign.id} campaignId={activeCampaign.id}
      enabled={user.chaptersEnabled&&user.scenesEnabled} contentEnabled={user.narrativeContentEnabled}/>}
    {section==='chapters'&&!activeCampaign&&<div className="placeholder">
      <span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2>
      <p>Capitoli e Scene sono disponibili soltanto nel contesto di una campagna Aruba selezionata.</p>
     </div>}
    {section==='preparation'&&activeCampaign&&<ArubaSceneEncounterManager key={activeCampaign.id} campaignId={activeCampaign.id} enabled={user.chaptersEnabled&&user.scenesEnabled&&user.narrativeContentEnabled}/>}
    {section==='preparation'&&!activeCampaign&&<div className="placeholder"><span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2><p>La preparazione richiede una campagna Aruba selezionata.</p></div>}
    {section==='sheets'&&activeCampaign&&<section className="aruba-sheets-route" aria-label="Schede della campagna"><div className="overline">PERSONAGGI DELLA CAMPAGNA</div><h1>Schede</h1><p className="muted">Personaggi, disponibilità e assegnazioni verificati dal backend Aruba.</p>
     {user.charactersEnabled?(user.campaignRosterEnabled?<ArubaCampaignPlayerRows key={`${activeCampaign.id}:${characterCatalogRevision}`} campaignId={activeCampaign.id} ownerId={user.id} revision={characterCatalogRevision} availabilityEnabled={user.characterAvailabilityEnabled} assignmentsEnabled={user.characterAssignmentsEnabled} claimsEnabled={user.characterClaimsEnabled} portraitsEnabled={user.characterPortraitsEnabled} onOpenCharacter={id=>setEntityDetail({kind:'characters-detail',entityType:'character',id,campaignId:activeCampaign.id})}/>:<ArubaCampaignCharacterCards key={`${activeCampaign.id}:${characterCatalogRevision}`} campaignId={activeCampaign.id} ownerId={user.id} revision={characterCatalogRevision} portraitsEnabled={user.characterPortraitsEnabled} onOpenCharacter={id=>setEntityDetail({kind:'characters-detail',entityType:'character',id,campaignId:activeCampaign.id})}/>):<div className="placeholder"><h2>Servizio schede non disponibile</h2><p>La capability Aruba non è attiva.</p></div>}
    </section>}
    {section==='sheets'&&!activeCampaign&&<div className="placeholder"><span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2><p>Le Schede richiedono una campagna Aruba selezionata.</p></div>}
    {section==='situations'&&activeCampaign&&<ArubaNarrativeManager key={`${activeCampaign.id}:events`} campaignId={activeCampaign.id} kind="events" enabled={user.narrativeContentEnabled}/>}
    {section==='situations'&&!activeCampaign&&<div className="placeholder"><span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2><p>Gli Eventi richiedono una campagna Aruba selezionata.</p></div>}
    {section==='equipment'&&activeCampaign&&<ArubaEquipmentCatalog key={activeCampaign.id} campaignId={activeCampaign.id} enabled={user.equipmentCatalogEnabled} assetsEnabled={user.visualAssetsEnabled}/>}
    {section==='equipment'&&!activeCampaign&&<div className="placeholder"><span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2><p>L’Archivio Oggetti richiede una campagna Aruba selezionata.</p></div>}
    {section==='map'&&activeCampaign&&activeCampaignOwned&&user.campaignDocumentsEnabled&&
     <ArubaOriginalSessionWorkspace campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.createdAt}}
      userId={user.id} onClose={()=>setSection('campaigns')}/>}
    {section==='map'&&activeCampaign&&!activeCampaignOwned&&user.gameSessionEnabled&&liveCampaignId===activeCampaign.id&&liveChannelReady&&
      <ArubaOriginalPlayerSessionWorkspace campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.createdAt}}
       userId={user.id} onClose={()=>setSection('session')}/>}
    {section==='map'&&activeCampaign&&((activeCampaignOwned&&!user.campaignDocumentsEnabled)||(!activeCampaignOwned&&(!user.gameSessionEnabled||liveCampaignId!==activeCampaign.id||!liveChannelReady)))&&
      <ArubaOriginalGameMap campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.createdAt}} enabled={false}/>}
    {section==='map'&&sessionPanel==='notes'&&notesPanelReady&&activeCampaign&&
     <ArubaNotesRoute key={activeCampaign.id+':map-notes'} campaignId={activeCampaign.id}
      userId={user.id} ownerId={activeCampaign.ownerId} onClose={()=>setSessionPanel(null)}/>}
     {section==='map'&&sessionPanel==='characters'&&activeCampaign&&activeCampaignOwned&&user.charactersEnabled&&
      <ArubaSessionCharactersPanel key={activeCampaign.id+':map-characters'} campaignId={activeCampaign.id}
       narrativeEnabled={user.narrativeContentEnabled}
       ruleset={activeCampaign.ruleset} notesEnabled={user.entityNotesEnabled}
       narrativeNotesEnabled={user.narrativeEntityNotesEnabled}
       portraitsEnabled={user.characterPortraitsEnabled} visualAssetsEnabled={user.visualAssetsEnabled}
       registerPanelGuard={registerSessionSheetsGuard}
       onChanged={()=>setCharacterCatalogRevision(n=>n+1)}
       ownerId={user.id} ownerDisplayName={user.displayName} initialSelection={narrativeOpenRequest??sessionCharacterRequest} onClose={()=>{setSessionPanel(null);closeSessionCharacter();}}/>}
    {section==='map'&&sessionPanel==='characters'&&!sessionCharacterRequest&&activeCampaign&&!activeCampaignOwned&&user.playerCharactersEnabled&&
     <ArubaAssignedCharacterPanel key={activeCampaign.id+':map-player-panel'} fixedCampaignId={activeCampaign.id}
      portraitsEnabled={user.characterPortraitsEnabled} visualAssetsEnabled={user.visualAssetsEnabled} claimsEnabled={user.characterClaimsEnabled}/>}
    {section==='map'&&sessionPanel==='combat'&&activeCampaign&&activeCampaignOwned&&user.campaignDocumentsEnabled&&user.narrativeContentEnabled&&
     <ArubaSessionCombatPanel campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.updatedAt??activeCampaign.createdAt}} onClose={()=>setSessionPanel(null)}/>}
    {section==='map'&&sessionPanel==='encounters'&&activeCampaign&&activeCampaignOwned&&user.chaptersEnabled&&user.scenesEnabled&&user.narrativeContentEnabled&&user.campaignDocumentsEnabled&&
     <ArubaSessionEncounterPanel campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.updatedAt??activeCampaign.createdAt}} onClose={()=>setSessionPanel(null)}/>}
    {section==='map'&&sessionPanel==='chat'&&activeCampaign&&user.campaignChatEnabled&&
     <ArubaSessionChatPanel campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.updatedAt??activeCampaign.createdAt}} user={{id:user.id,email:user.email,displayName:user.displayName,role:user.role}} onClose={()=>setSessionPanel(null)}/>}
    {section==='map'&&!activeCampaign&&<div className="placeholder"><span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2><p>La Mappa richiede una campagna Aruba selezionata.</p></div>}
    {section==='phases'&&activeCampaign&&<ArubaOriginalGamePhases campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.createdAt}} enabled={user.campaignDocumentsEnabled}/>}
    {section==='phases'&&!activeCampaign&&<div className="placeholder"><span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2><p>Le Fasi di Gioco richiedono una campagna Aruba selezionata.</p></div>}
    {section==='combat'&&activeCampaign&&<ArubaOriginalCombatTracker campaign={{...activeCampaign,ruleset:activeCampaign.ruleset as OriginalCampaign['ruleset'],updatedAt:activeCampaign.createdAt}} enabled={user.campaignDocumentsEnabled&&user.narrativeContentEnabled}/>}
    {section==='combat'&&!activeCampaign&&<div className="placeholder"><span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2><p>Il Combattimento richiede una campagna Aruba selezionata.</p></div>}
    {section==='assets'&&activeCampaign&&<ArubaOriginalVisualAssets campaignId={activeCampaign.id} enabled={user.visualAssetsEnabled}/>}
    {section==='characters'&&catalogContractEnabled&&<ArubaOriginalCatalog user={user}
     campaigns={campaigns.map(c=>({...c,ruleset:c.ruleset as OriginalCampaign['ruleset'],updatedAt:c.updatedAt??c.createdAt}))}
     joinedCampaigns={joinedCampaigns.map(c=>({...c,ruleset:c.ruleset as OriginalCampaign['ruleset'],updatedAt:c.updatedAt??c.createdAt}))}
     refreshCampaigns={refreshCatalogCampaigns} refreshJoinedCampaigns={refreshCatalogCampaigns}/>}
    {section==='assets'&&!activeCampaign&&<div className="placeholder"><span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2><p>Gli Asset Grafici richiedono una campagna Aruba selezionata.</p></div>}
    {activeCampaign&&(['npcs','monsters','clues'] as const).includes(section as 'npcs'|'monsters'|'clues')&&
     <ArubaNarrativeManager key={`${activeCampaign.id}:${section}`} campaignId={activeCampaign.id} kind={section as 'npcs'|'monsters'|'clues'} enabled={user.narrativeContentEnabled}
      initialSelection={narrativeOpenRequest?.kind===section?narrativeOpenRequest:null}/>}
    {!activeCampaign&&(['npcs','monsters','clues'] as const).includes(section as 'npcs'|'monsters'|'clues')&&<div className="placeholder"><span className="placeholder-mark">✧</span><h2>Seleziona prima una campagna</h2><p>L’archivio narrativo richiede una campagna Aruba selezionata.</p></div>}
    {(section==='session'||section==='map')&&activeCampaign&&sessionCharacterRequest&&!activeCampaignOwned&&user.playerCharactersEnabled&&
    <ArubaPlayerCharacterDetail key={activeCampaign.id+':player:'+sessionCharacterRequest.requestId}
     campaignId={activeCampaign.id} characterId={sessionCharacterRequest.id}
     portraitsEnabled={user.characterPortraitsEnabled} visualAssetsEnabled={user.visualAssetsEnabled}
     onClose={closeSessionCharacter}/>}
   {(section==='characters'||section==='sheets')&&entityDetail&&user.charactersEnabled&&
   <ArubaCharacterDetailPanel key={entityDetail.campaignId+':'+entityDetail.id}
    characterId={entityDetail.id} campaignId={entityDetail.campaignId} ownerId={user.id} ownerDisplayName={user.displayName} notesEnabled={user.entityNotesEnabled} portraitsEnabled={user.characterPortraitsEnabled}
    visualAssetsEnabled={user.visualAssetsEnabled}
    onClose={()=>setEntityDetail(null)}
    onChanged={()=>setCharacterCatalogRevision(n=>n+1)}
    onArchived={()=>{setCharacterCatalogRevision(n=>n+1);setEntityDetail(null);}}
   />}
     {(section==='session'||section==='map')&&activeCampaign&&<ArubaDiceToolsProvider key={activeCampaign.id+':'+user.id}
      campaign={activeCampaign} user={user} chatEnabled={user.campaignChatEnabled}>
      <ArubaOriginalDiceFloating/>
      {sessionPanel==='dice'&&<ArubaOriginalDicePanel enabled={user.diceFormulasEnabled} onClose={()=>setSessionPanel(null)}/>}
     </ArubaDiceToolsProvider>}
   {showEdit&&activeCampaign&&activeCampaignOwned&&user.campaignsEnabled&&<div className="modal-backdrop" role="presentation" onClick={()=>setShowEdit(false)}>
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
    {ownerInviteCampaign&&user.campaignInvitesEnabled&&ownerInviteCampaign.ownerId===user.id&&<ArubaOwnerInviteDialog
     campaign={ownerInviteCampaign} userId={user.id} onClose={()=>setOwnerInviteCampaign(null)}/>}
    {showJoinInvite&&user.campaignInvitesEnabled&&<ArubaJoinInviteDialog userId={user.id} onClose={()=>setShowJoinInvite(false)}
     onJoined={joined=>{setJoinedCampaigns(list=>list.some(item=>item.id===joined.id)?list:[joined,...list]);setActiveCampaignId(joined.id);setShowJoinInvite(false);setSection('session');}}/>}
   {branding&&<ArubaCampaignBrandingDialog
    campaignId={branding.campaignId}
    campaignName={branding.campaignName}
    kind={branding.kind}
    ownerId={branding.ownerId}
    existingImageUrl={branding.existingImageUrl}
    otherImageUrl={branding.otherImageUrl}
    onUpdated={async(updated)=>{setBranding(null);await applyCampaignBranding(updated);}}
    onClose={()=>setBranding(null)}
   />}
  </AppShell>
  </>;
}
function HomeRecentCampaign({campaign,loading,enabled,onOpen}:{campaign:Campaign|null;loading:boolean;enabled:boolean;onOpen:(id:string)=>void}){
 if(!enabled)return <div className="home-campaign-empty"><ScrollIcon size={40} weight="duotone" aria-hidden="true"/><p>La gestione delle campagne sarà disponibile dopo la migrazione PostgreSQL 008.</p></div>;
 if(loading)return <div className="home-campaign-empty"><ScrollIcon size={40} weight="duotone" aria-hidden="true"/><p>Caricamento campagne Aruba…</p></div>;
 if(!campaign)return <div className="home-campaign-empty"><ScrollIcon size={40} weight="duotone" aria-hidden="true"/><p>Nessuna campagna creata.</p></div>;
 const recent:OriginalCampaign={id:campaign.id,name:campaign.name,description:campaign.description,
  ruleset:campaign.ruleset as OriginalCampaign['ruleset'],ownerId:campaign.ownerId,
  createdAt:campaign.createdAt,updatedAt:campaign.createdAt};
 return <button type="button" className="home-campaign-card group relative flex w-full flex-col overflow-hidden rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-left transition-all hover:-translate-y-0.5 hover:border-[var(--dash-accent)] hover:shadow-[0_8px_28px_var(--dash-card-shadow)]" onClick={()=>onOpen(campaign.id)}>
  <CampaignBannerDisplay campaign={recent} size="compact"/>
 </button>;
}
createRoot(document.getElementById('root')!).render(window.location.pathname==='/vtt/icon-study'?<IconStudy/>:<DiceAppearanceProvider><App/></DiceAppearanceProvider>);
