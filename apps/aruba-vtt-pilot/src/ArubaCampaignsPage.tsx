import {useEffect,useMemo,useState} from 'react';
import {Camera,Loader2,Plus,Search,User,Users} from 'lucide-react';
import {listAssignedPlayerCharacters,listCharacterDrafts,listOwnedCampaignRoster} from './client.mjs';
import {RulesetTag} from '../../../src/app/components/shared/RulesetTag';
import {Tooltip,TooltipContent,TooltipTrigger} from '../../../src/app/components/ui/tooltip';
import {RULESETS,VISIBLE_RULESETS,type RulesetId} from '../../../src/app/campaigns/campaignTypes';

// Presentation aligned with the ORIGINAL CampaignsPage: same heading,
// filters, horizontal 156px cards, RulesetTag, member tooltip, character
// links and footer. Data and branding come exclusively from Aruba.

export type ArubaCampaignSummary={id:string;ownerId:string;name:string;description:string;ruleset:string;createdAt:string;updatedAt?:string;logoUrl?:string|null;coverImageUrl?:string|null};
type CardCampaign=ArubaCampaignSummary & {
 memberNames:string[];memberCount:number;
 characters:{id:string;name:string}[];
};
type SortOption='name-asc'|'name-desc'|'date-asc'|'date-desc';

function formatMemberNames(memberNames:string[],memberCount:number):string{
 if(memberNames.length===0)return `${memberCount} ${memberCount===1?'giocatore':'giocatori'}`;
 const shown=memberNames.slice(0,2);
 const remaining=memberNames.length-shown.length;
 return remaining>0?`${shown.join(', ')}, +${remaining} ${remaining===1?'altro':'altri'}`:shown.join(', ');
}

const inputStyle:React.CSSProperties={
 backgroundColor:'var(--dash-surface)',border:'1px solid var(--dash-border)',borderRadius:10,
 padding:'0.55rem 0.85rem',color:'var(--dash-text)',fontSize:'0.85rem',outline:'none',
};

export function ArubaCampaignsPage({campaigns,loading,enabled,createEnabled,ownerId,activeId,membersEnabled,charactersEnabled,playerCharactersEnabled,onCreate,onOpen,onOpenCharacter,onBrandingOpen,brandingEnabled,onBrandingUpdated}:{
 campaigns:ArubaCampaignSummary[];loading:boolean;enabled:boolean;createEnabled:boolean;ownerId:string;activeId:string|null;
 membersEnabled:boolean;charactersEnabled:boolean;
 playerCharactersEnabled:boolean;
 onCreate:()=>void;onOpen:(id:string)=>void;onOpenCharacter:(id:string,campaignId:string)=>void;
 onBrandingOpen:(campaignId:string,kind:'logo'|'cover')=>void;
 brandingEnabled:boolean;
 onBrandingUpdated:(campaign:{id:string;ownerId:string;name:string;description:string;ruleset:string;createdAt:string;updatedAt?:string;logoUrl?:string|null;coverImageUrl?:string|null})=>void;
}){
 const [sortOption,setSortOption]=useState<SortOption>('date-desc');
 const [characterFilter,setCharacterFilter]=useState('');
 const [rulesetFilter,setRulesetFilter]=useState('');
 const [textSearch,setTextSearch]=useState('');
 const [enriched,setEnriched]=useState<CardCampaign[]>([]);

 useEffect(()=>{
  let alive=true;
  const base=campaigns.map(c=>({...c,memberNames:[] as string[],memberCount:0,characters:[] as {id:string;name:string}[]}));
  setEnriched(base);
  if(!enabled||campaigns.length===0)return;
  // Member names and active characters are read from the authoritative
  // Aruba endpoints. A failed/unavailable capability falls back to the
  // neutral count instead of inventing participants.
  void Promise.all(campaigns.map(async campaign=>{
   let memberNames:string[]=[];
   let characters:{id:string;name:string}[]=[];
   const owned=campaign.ownerId===ownerId;
   if(owned&&membersEnabled){
    try{
     const members=await listOwnedCampaignRoster(fetch.bind(window),campaign.id);
     memberNames=members.filter(member=>member.role!=='gm').map(member=>member.displayName);
    }catch{}
   }
   if(owned&&charactersEnabled){
    try{
     const drafts=await listCharacterDrafts(fetch.bind(window),campaign.id,ownerId);
     characters=drafts.filter(draft=>draft.status==='active').map(draft=>({id:draft.id,name:draft.name}));
    }catch{}
   }else if(!owned&&playerCharactersEnabled){
    try{
     const assigned=await listAssignedPlayerCharacters(fetch.bind(window),campaign.id);
     characters=assigned.map(draft=>({id:draft.id,name:draft.name}));
    }catch{}
   }
   return {...campaign,memberNames,memberCount:memberNames.length,characters};
  })).then(result=>{if(alive)setEnriched(result);});
  return()=>{alive=false;};
 },[campaigns,enabled,ownerId,membersEnabled,charactersEnabled,playerCharactersEnabled]);

 const allCharacterNames=useMemo(()=>{
  const names=new Set<string>();
  enriched.forEach(campaign=>campaign.characters.forEach(character=>names.add(character.name)));
  return Array.from(names).sort((a,b)=>a.localeCompare(b));
 },[enriched]);

 const filteredSorted=useMemo(()=>{
  let list=[...enriched];
  if(characterFilter)list=list.filter(campaign=>campaign.characters.some(character=>character.name===characterFilter));
  if(rulesetFilter)list=list.filter(campaign=>campaign.ruleset===rulesetFilter);
  if(textSearch.trim()){
   const query=textSearch.trim().toLowerCase();
   list=list.filter(campaign=>campaign.name.toLowerCase().includes(query)||(campaign.description??'').toLowerCase().includes(query));
  }
  list.sort((a,b)=>{
   switch(sortOption){
    case 'name-asc':return a.name.localeCompare(b.name);
    case 'name-desc':return b.name.localeCompare(a.name);
    case 'date-asc':return new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime();
    case 'date-desc':return new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime();
    default:return 0;
   }
  });
  return list;
 },[enriched,characterFilter,rulesetFilter,textSearch,sortOption]);

 return <div className="aruba-campaigns-page space-y-6 select-none">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <h2 className="text-xl font-semibold tracking-wide text-[var(--dash-text-strong)]">Campagne</h2>
   <button type="button" onClick={onCreate} disabled={!createEnabled}
    className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-lg shadow-black/20 transition-colors hover:bg-[var(--dash-panel)] disabled:cursor-not-allowed disabled:opacity-60">
    <Plus className="h-4 w-4 group-hover:animate-[plusPulse_0.75s_ease-in-out_infinite]"/>
    Nuova Campagna
   </button>
  </div>

  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <select value={sortOption} onChange={event=>setSortOption(event.target.value as SortOption)} style={inputStyle} aria-label="Ordina campagne">
    <option value="date-desc">Più recenti prima</option>
    <option value="date-asc">Più vecchie prima</option>
    <option value="name-asc">Nome A → Z</option>
    <option value="name-desc">Nome Z → A</option>
   </select>
   <select value={characterFilter} onChange={event=>setCharacterFilter(event.target.value)} style={inputStyle} aria-label="Filtra per personaggio">
    <option value="">Tutti i personaggi</option>
    {allCharacterNames.map(name=><option key={name} value={name}>{name}</option>)}
   </select>
   <select value={rulesetFilter} onChange={event=>setRulesetFilter(event.target.value)} style={inputStyle} aria-label="Filtra per regolamento">
    <option value="">Tutti i regolamenti</option>
    {VISIBLE_RULESETS.map(ruleset=><option key={ruleset.id} value={ruleset.id}>{ruleset.name}</option>)}
   </select>
   <div style={{position:'relative'}}>
    <Search size={14} style={{position:'absolute',left:'0.7rem',top:'50%',transform:'translateY(-50%)',color:'var(--dash-muted)'}}/>
    <input type="text" value={textSearch} onChange={event=>setTextSearch(event.target.value)}
     placeholder="Cerca per nome o descrizione..." aria-label="Cerca campagne"
     style={{...inputStyle,width:'100%',paddingLeft:'2rem',boxSizing:'border-box'}}/>
   </div>
  </div>

  {!enabled?<div className="rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
    <p className="text-sm text-[var(--dash-muted)]">La gestione delle campagne sarà disponibile dopo la migrazione PostgreSQL 008.</p>
   </div>:
   loading?<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]"/></div>:
   enriched.length===0?<div className="rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
    <p className="text-sm text-[var(--dash-muted)]">Non hai ancora nessuna campagna. Creane una, oppure entra in una campagna esistente con un codice invito.</p>
   </div>:
   filteredSorted.length===0?<div className="rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
    <p className="text-sm text-[var(--dash-muted)]">Nessuna campagna corrisponde ai filtri.</p>
   </div>:
   <div className="flex flex-col gap-4">
     {filteredSorted.map(campaign=><div key={campaign.id} role="button" tabIndex={0}
      aria-label="Apri campagna"
     aria-pressed={activeId===campaign.id}
     onClick={()=>onOpen(campaign.id)}
     onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen(campaign.id);}}}
     className="flex h-[156px] cursor-pointer overflow-hidden rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-xl transition-colors hover:border-[var(--dash-accent)]">
     <div className="relative h-full w-[154px] shrink-0 overflow-hidden bg-black/30">
      <div className="flex h-full w-full items-center justify-center p-7">
        {campaign.logoUrl?
         <img src={campaign.logoUrl} alt={'Logo di '+campaign.name} className="h-full w-full object-contain"/>:
         <img src="/vtt/icon-source-1024.png" alt="Hollow Gate" className="h-full w-full object-contain opacity-80" style={{filter:'invert(1)'}}/>}
      </div>
      <Tooltip>
       <TooltipTrigger asChild>
        <button type="button" aria-label={'Modifica il logo di '+campaign.name} disabled={!brandingEnabled}
         onClick={event=>{event.stopPropagation();onBrandingOpen(campaign.id,'logo');}}
         style={{position:'absolute',bottom:6,right:6,width:26,height:26,borderRadius:'50%',
          backgroundColor:'var(--dash-accent)',display:'flex',alignItems:'center',justifyContent:'center',
          border:'2px solid var(--dash-bg)',cursor:brandingEnabled?'pointer':'not-allowed',opacity:brandingEnabled?1:.55}}>
         <Camera size={13} color="var(--dash-bg)"/>
        </button>
       </TooltipTrigger>
       <TooltipContent side="right">{brandingEnabled?'Modifica il logo della Campagna':'Logo campagna non ancora migrato su Aruba'}</TooltipContent>
      </Tooltip>
     </div>
     <div className="flex min-w-0 flex-1 flex-col px-5 py-4">
      <div className="flex items-start justify-between gap-2">
       <div className="flex items-center gap-2 min-w-0">
        <h3 className="truncate text-lg font-semibold text-[var(--dash-text-strong)]">{campaign.name}</h3>
       </div>
       <RulesetTag rulesetId={campaign.ruleset as RulesetId}/>
      </div>
      {campaign.description&&<p className="mt-1 truncate text-sm text-[var(--dash-muted)]">{campaign.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--dash-text)]">
       <Tooltip>
        <TooltipTrigger asChild>
         <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 shrink-0"/> {formatMemberNames(campaign.memberNames,campaign.memberCount)}
         </span>
        </TooltipTrigger>
        <TooltipContent side="top">{campaign.memberNames.join(', ')}</TooltipContent>
       </Tooltip>
       {campaign.characters.length>0&&<span className="flex flex-wrap items-center gap-1 text-[var(--dash-muted)]">
        <User className="h-3.5 w-3.5 shrink-0"/>
        {campaign.characters.map((character,index)=><span key={character.id} className="flex items-center">
         <button type="button" onClick={event=>{event.stopPropagation();onOpenCharacter(character.id,campaign.id);}}
          className="inline-flex items-center gap-1 underline-offset-2 hover:text-[var(--dash-accent-2)] hover:underline">
          {character.name}
         </button>
         {index<campaign.characters.length-1&&<span className="ml-1">,</span>}
        </span>)}
       </span>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
       <div className="flex items-center gap-2"/>
       <div className="flex shrink-0 flex-col items-end text-xs text-[var(--dash-muted)]">
        <span>Creata il {new Date(campaign.createdAt).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})}</span>
        {campaign.updatedAt&&new Date(campaign.updatedAt).getTime()!==new Date(campaign.createdAt).getTime()&&
         <span>Ultima modifica il {new Date(campaign.updatedAt).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})}</span>}
       </div>
      </div>
     </div>
    </div>)}
   </div>}
 </div>;
}
