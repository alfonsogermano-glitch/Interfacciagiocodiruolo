import {useEffect,useMemo,useState} from 'react';
import {Ghost,KeyRound,LayoutGrid,Loader2,Map as MapIcon,MoreVertical,Package,Pencil,Play,Settings2,Skull,Users} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '../../../src/app/components/ui/dropdown-menu';
import {CampaignBannerDisplay} from '../../../src/app/components/shared/CampaignBannerDisplay';
import {FolderSectionHeader} from '../../../src/app/components/shared/FolderSectionHeader';
import {EntityCard} from '../../../src/app/components/session/shared/EntityCard';
import {ImageSun} from '../../../src/app/components/IconeImmagine';
import {Tooltip,TooltipContent,TooltipTrigger} from '../../../src/app/components/ui/tooltip';
import type {RulesetId} from '../../../src/app/campaigns/campaignTypes';
import {ArubaPortraitEntityCard} from './ArubaPortraitEntityCard';
import {
 listArubaNarrativeContent,listCharacterAssignments,listCharacterAvailability,
 listAssignedPlayerCharacters,listCharacterDrafts,listOwnedCampaignRoster,
 listClaimableCharacters,claimAvailableCharacter,
} from './client.mjs';
import {validateOwnedCampaignPlayerSnapshot} from './campaign-player-rows.mjs';

// Presentation aligned with the ORIGINAL CampaignHome: CampaignBannerDisplay
// full, session action row + quick filters overlaid on the banner, compact GM
// card and the original two-column card grid. Every value comes from Aruba;
// cover and logo images are stored as campaign visual assets and served by
// the authenticated content endpoint. Live multiplayer remains a separate
// GM-only section.
type QuickFilter='all'|'pg'|'premades'|'npc'|'monster';
type Campaign={id:string;ownerId:string;name:string;description:string;ruleset:string;createdAt:string;updatedAt?:string;logoUrl?:string|null;coverImageUrl?:string|null};
type Member={userId:string;displayName:string;role:'gm'|'player'};
type Character={id:string;campaignId:string;ownerId:string;name:string;status:string;
 sheetData:Record<string,unknown>};
type NarrativeItem={id:string;name?:string;title?:string;description?:string;
 environmentId?:string|null;chapterId?:string|null;sceneId?:string|null};
type Row=Member&{characters:Character[]};

function pillClass(active:boolean){
 return `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
  active
   ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
   : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
 }`;
}

export function ArubaCampaignHome({campaign,viewer,revision,onOpenCharacter,onOpenNarrative,onGoToManagement,onEditCampaign,brandingEnabled,onBrandingOpen,inviteEnabled,onInvite,sessionEnabled,sessionActive,sessionReady,onToggleSession,onOpenMap}:{
 campaign:Campaign;
 viewer:{id:string;displayName:string;campaignRosterEnabled:boolean;charactersEnabled:boolean;
  characterAvailabilityEnabled:boolean;characterAssignmentsEnabled:boolean;
  narrativeContentEnabled:boolean;characterPortraitsEnabled:boolean;
  playerCharactersEnabled:boolean;characterClaimsEnabled:boolean;
  campaignMemberships:{userId:string;campaignId:string;role:'gm'|'player'}[]};
 revision:number;
 onOpenCharacter:(id:string)=>void;
 onOpenNarrative:(kind:'npcs'|'monsters',id:string)=>void;
 onGoToManagement:()=>void;
 onEditCampaign:()=>void;
 brandingEnabled:boolean;
 onBrandingOpen:(kind:'logo'|'cover')=>void;
 inviteEnabled:boolean;
 onInvite:()=>void;
 sessionEnabled:boolean;
 sessionActive:boolean;
 sessionReady:boolean;
 onToggleSession:()=>void;
 onOpenMap:()=>void;
}){
 const isOwner=campaign.ownerId===viewer.id;
 const isGm=isOwner||viewer.campaignMemberships.some(member=>
  member.userId===viewer.id&&member.campaignId===campaign.id&&member.role==='gm');
 const [activeQuickFilter,setActiveQuickFilter]=useState<QuickFilter>('all');
 const [rows,setRows]=useState<Row[]>([]);
 const [availability,setAvailability]=useState<Map<string,boolean>>(new Map());
 const [npcs,setNpcs]=useState<NarrativeItem[]>([]);
 const [monsters,setMonsters]=useState<NarrativeItem[]>([]);
 const [claimable,setClaimable]=useState<Character[]>([]);
 const [claiming,setClaiming]=useState<string|null>(null);
 const [claimRevision,setClaimRevision]=useState(0);
 const [loading,setLoading]=useState(true);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState<string|null>(null);

 useEffect(()=>{
  let active=true;
  setLoading(true);setLoaded(false);setError(null);setRows([]);
  setAvailability(new Map());setNpcs([]);setMonsters([]);setClaimable([]);
  void Promise.all([
   isOwner&&viewer.campaignRosterEnabled?listOwnedCampaignRoster(fetch,campaign.id):Promise.resolve([] as Member[]),
   isOwner&&viewer.charactersEnabled?listCharacterDrafts(fetch,campaign.id,campaign.ownerId):
    !isOwner&&viewer.playerCharactersEnabled?listAssignedPlayerCharacters(fetch,campaign.id):Promise.resolve([] as Character[]),
   isOwner&&viewer.characterAvailabilityEnabled?listCharacterAvailability(fetch,campaign.id):Promise.resolve(new Map<string,boolean>()),
   isOwner&&viewer.characterAvailabilityEnabled&&viewer.characterAssignmentsEnabled?listCharacterAssignments(fetch,campaign.id):Promise.resolve(new Map<string,string>()),
    viewer.narrativeContentEnabled&&isOwner?listArubaNarrativeContent(fetch,campaign.id,'npcs'):Promise.resolve([] as NarrativeItem[]),
     viewer.narrativeContentEnabled&&isOwner?listArubaNarrativeContent(fetch,campaign.id,'monsters'):Promise.resolve([] as NarrativeItem[]),
    !isOwner&&viewer.characterClaimsEnabled?listClaimableCharacters(fetch,campaign.id):Promise.resolve([] as Character[]),
  ]).then(([roster,characters,flags,links,npcItems,monsterItems,claimableItems])=>{
   if(!active)return;
   try{
    if(isOwner){
     const verified=validateOwnedCampaignPlayerSnapshot(roster,characters,campaign.ownerId,
      flags,links,viewer.characterAvailabilityEnabled,
      viewer.characterAvailabilityEnabled&&viewer.characterAssignmentsEnabled);
     setRows(verified);
    }else{
     setRows([{userId:viewer.id,displayName:viewer.displayName,role:'player',characters}]);
    }
    setAvailability(flags);
   }catch(reason){
    setRows([]);
    setError(reason instanceof Error?reason.message:'Partecipanti non verificati');
   }
    setNpcs(npcItems);setMonsters(monsterItems);setClaimable(claimableItems);
  }).catch(reason=>{
   if(active)setError(reason instanceof Error?reason.message:'Home campagna non disponibile');
  }).finally(()=>{
   if(active){setLoading(false);setLoaded(true);}
  });
  return()=>{active=false;};
 },[campaign.id,campaign.ownerId,revision,viewer.campaignRosterEnabled,viewer.charactersEnabled,viewer.playerCharactersEnabled,
  viewer.characterAvailabilityEnabled,viewer.characterAssignmentsEnabled,
  viewer.narrativeContentEnabled,viewer.characterPortraitsEnabled,viewer.characterClaimsEnabled,isGm,claimRevision]);

 const gmRow=useMemo(()=>rows.find(row=>row.userId===campaign.ownerId&&row.role==='gm')??null,[rows,campaign.ownerId]);
 const playerRows=useMemo(()=>rows.filter(row=>row.role==='player'),[rows]);
 const premades=useMemo(()=>gmRow?gmRow.characters.filter(character=>availability.get(character.id)===true):[],[gmRow,availability]);
 const gmDisplayName=gmRow?.displayName??(isOwner?viewer.displayName:'Game Master');
 const gmInitial=(gmDisplayName||'G').trim().charAt(0).toUpperCase()||'G';

 const bannerCampaign=useMemo(()=>({
  ...campaign,ruleset:campaign.ruleset as RulesetId,
  updatedAt:campaign.updatedAt??campaign.createdAt,
  coverImageUrl:campaign.coverImageUrl??null,logoUrl:campaign.logoUrl??null,
 }),[campaign]);

 function characterCard(character:Character){
  return <div key={character.id} data-campaign-character-id={character.id}>
   <ArubaPortraitEntityCard campaignId={campaign.id} characterId={character.id}
    enabled={viewer.characterPortraitsEnabled} name={character.name}
    subtitle={[character.sheetData.style,character.sheetData.viaggio].filter(Boolean).join(' · ')}
    secondaryText={typeof character.sheetData.description==='string'?character.sheetData.description:undefined}
    onClick={()=>onOpenCharacter(character.id)}/>
  </div>;
 }

 function narrativeCard(item:NarrativeItem,kind:'npc'|'monster'){
  return <EntityCard key={item.id} variant="grid"
   name={item.name??item.title??'Senza nome'}
   subtitle={typeof item.description==='string'?item.description:undefined}
   badge={<span className="inline-flex items-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--dash-muted)]">
    {kind==='npc'?'PNG':'Mostro'}
    </span>} onClick={()=>onOpenNarrative(kind==='npc'?'npcs':'monsters',item.id)}/>;
 }
 async function claim(characterId:string){
  if(!viewer.characterClaimsEnabled||claiming)return;setClaiming(characterId);setError(null);
  try{await claimAvailableCharacter(fetch,characterId);setClaimRevision(value=>value+1);}
  catch(reason){setError(reason instanceof Error?reason.message:'Richiesta personaggio non riuscita');}
  finally{setClaiming(null);}
 }

 return <div className="aruba-campaign-home flex h-full flex-col overflow-y-auto text-left select-none"
  data-aruba-campaign-home="true" aria-label="Home della campagna">
  <div className="aruba-campaign-banner-shell relative">
   <CampaignBannerDisplay campaign={bannerCampaign} size="full"/>
   {isOwner&&<Tooltip>
    <TooltipTrigger asChild>
     <button type="button" disabled={!brandingEnabled}
      aria-label="Modifica immagine di copertina"
      onClick={()=>onBrandingOpen('cover')}
      className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-55">
      <ImageSun className="h-[22px] w-[22px]"/>
     </button>
    </TooltipTrigger>
    <TooltipContent>{brandingEnabled?(campaign.coverImageUrl?'Modifica immagine di copertina':'Aggiungi immagine di copertina'):'Branding campagna non disponibile'}</TooltipContent>
   </Tooltip>}
   {loaded&&<div className="aruba-campaign-session-controls group absolute inset-x-0 bottom-2 z-40 grid grid-cols-1 gap-6 px-8 md:grid-cols-[320px_1fr]">
    <div className="flex flex-col gap-3">
      {isOwner&&<div className="flex gap-2">
       <button type="button" disabled={!sessionEnabled} title={sessionEnabled?'Connessione sessione autorizzata':'Sessione multiplayer non autorizzata'} onClick={onToggleSession}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)]">
        <Play className="h-3.5 w-3.5"/> {sessionActive?'Termina':'Avvia sessione'}
      </button>
       <button type="button" disabled={!inviteEnabled} title={inviteEnabled?'Genera o ruota il codice invito':'Inviti campagna non disponibili'} onClick={onInvite}
       className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)]">
       <KeyRound className="h-3.5 w-3.5"/> Invita giocatori
      </button>
      <DropdownMenu>
       <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Menu campagna" className="inline-flex shrink-0 items-center justify-center rounded-xl px-2.5 text-[var(--dash-muted)]">
         <MoreVertical className="h-4 w-4"/>
        </button>
       </DropdownMenuTrigger>
       <DropdownMenuContent align="end" className="border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-text)]">
        <DropdownMenuItem onSelect={onEditCampaign}><Pencil className="h-4 w-4"/> Impostazioni Campagna</DropdownMenuItem>
        <DropdownMenuItem onSelect={onGoToManagement}><Settings2 className="h-4 w-4"/> Gestione campagna</DropdownMenuItem>
       </DropdownMenuContent>
      </DropdownMenu>
     </div>}
    </div>
    <div className="aruba-campaign-quick-filters flex flex-wrap justify-end gap-2">
     <button type="button" onClick={()=>setActiveQuickFilter('all')} className={pillClass(activeQuickFilter==='all')}>
      <LayoutGrid className="h-3.5 w-3.5"/> Tutti
     </button>
     <button type="button" disabled={isOwner?(!viewer.charactersEnabled||!viewer.campaignRosterEnabled):!viewer.playerCharactersEnabled} onClick={()=>setActiveQuickFilter('pg')} className={pillClass(activeQuickFilter==='pg')}>
      <Users className="h-3.5 w-3.5"/> Personaggi
     </button>
     <button type="button" disabled={isOwner?(!viewer.charactersEnabled||!viewer.characterAvailabilityEnabled):!viewer.characterClaimsEnabled} onClick={()=>setActiveQuickFilter('premades')} className={pillClass(activeQuickFilter==='premades')}>
      <Package className="h-3.5 w-3.5"/> Precompilati
     </button>
     <button type="button" disabled={!viewer.narrativeContentEnabled||!isOwner} onClick={()=>setActiveQuickFilter('npc')} className={pillClass(activeQuickFilter==='npc')}>
      <Ghost className="h-3.5 w-3.5"/> PNG
     </button>
     <button type="button" disabled={!viewer.narrativeContentEnabled||!isOwner} onClick={()=>setActiveQuickFilter('monster')} className={pillClass(activeQuickFilter==='monster')}>
      <Skull className="h-3.5 w-3.5"/> Mostri
     </button>
    </div>
   </div>}
  </div>

  <div className="aruba-campaign-body flex flex-1 flex-col gap-6 p-8 pt-1">
   {loading&&!loaded?<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" aria-label="Caricamento home campagna"/></div>:
     <div className="aruba-campaign-body-grid grid w-full grid-cols-1 gap-6 md:grid-cols-[320px_1fr]">
     <div className="flex flex-col gap-3">
      <div className="h-8"/>
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-3">
       <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--dash-accent)] text-sm font-semibold text-[var(--dash-text-strong)]">
        {gmInitial}
       </span>
       <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="break-words text-sm font-medium text-[var(--dash-text-strong)]">{gmDisplayName}</span>
        <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--dash-accent-2)]">
         GM
        </span>
       </div>
      </div>
     </div>

     <div className="flex flex-col gap-3">
      {error&&<p role="alert" className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-4 py-3 text-xs text-[var(--dash-muted)]">
       {error}
      </p>}
      {!error&&<div className="aruba-campaign-entity-grid grid grid-cols-[repeat(2,minmax(200px,1fr))] content-start gap-4">
       {(activeQuickFilter==='all'||activeQuickFilter==='pg')&&<>
        <FolderSectionHeader icon={Users} label="Personaggi" isOwner={isOwner}/>
        {playerRows.map(row=>row.characters.length>0?
         row.characters.map(characterCard):
         <EntityCard key={row.userId} variant="grid" name={row.displayName}
          badge={<span className="inline-flex items-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--dash-muted)]">
           Nessun personaggio
          </span>}/>)}
       </>}

       {activeQuickFilter==='premades'&&<>
        <FolderSectionHeader icon={Package} label="Precompilati" isOwner={isOwner}/>
        {(isOwner?premades:claimable).map(character=>isOwner?characterCard(character):
         <EntityCard key={character.id} variant="grid" name={character.name}
          subtitle={typeof character.sheetData.style==='string'?character.sheetData.style:'Personaggio precompilato'}
          secondaryText={typeof character.sheetData.description==='string'?character.sheetData.description:undefined}
          cornerAction={<button type="button" disabled={claiming!==null} onClick={event=>{event.stopPropagation();void claim(character.id);}}
           className="rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-2 py-1 text-xs font-semibold text-[var(--dash-text-strong)]">
           {claiming===character.id?'Richiesta…':'Richiedi'}</button>}/>) }
        {(isOwner?premades:claimable).length===0&&<div className="col-span-2 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center">
         <Package className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]"/>
         <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">Nessun personaggio precompilato disponibile</div>
         <p className="mt-2 text-xs text-[var(--dash-muted)]">
           {isOwner?'Marca un PG come "Disponibile per i giocatori" dal menu ⋮ in Personaggi per farlo comparire qui.':'Il Game Master non ha pubblicato altri personaggi richiedibili.'}
         </p>
        </div>}
       </>}

       {(activeQuickFilter==='all'||activeQuickFilter==='npc')&&npcs.length>0&&<>
        <FolderSectionHeader icon={Ghost} label="PNG" isOwner={isOwner}/>
        {npcs.map(item=>narrativeCard(item,'npc'))}
       </>}

       {(activeQuickFilter==='all'||activeQuickFilter==='monster')&&monsters.length>0&&<>
        <FolderSectionHeader icon={Skull} label="Mostri" isOwner={isOwner}/>
        {monsters.map(item=>narrativeCard(item,'monster'))}
       </>}
      </div>}
       {sessionActive&&<button type="button" disabled={!sessionReady} onClick={onOpenMap}
        title={sessionReady?'Apri la mappa multiplayer':'Connessione mappa in corso'}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)]">
        <MapIcon className="h-3.5 w-3.5"/> Apri mappa
       </button>}
       {!isOwner&&<button type="button" disabled={!sessionEnabled} onClick={onToggleSession}
       title={sessionEnabled?'Connessione sessione autorizzata':'Sessione multiplayer non autorizzata'}
       className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)]">
       <Play className="h-3.5 w-3.5"/> {sessionActive?'Esci dalla sessione':'Entra nella sessione'}
      </button>}
     </div>
    </div>}
  </div>
 </div>;
}
