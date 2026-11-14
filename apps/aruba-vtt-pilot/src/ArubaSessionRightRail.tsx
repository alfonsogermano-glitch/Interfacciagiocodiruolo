import {ChatCircleDotsIcon,FileTextIcon,NoteIcon,DiceFiveIcon,MapTrifoldIcon,SwordIcon} from '@phosphor-icons/react';
/** Source-aligned icon order of original SessionRightSidebar.
 * Unsupported capabilities are genuinely disabled except the Aruba character list, never fake actions. */
const shared=[
 {id:'chat',label:'Chat',Icon:ChatCircleDotsIcon},
 {id:'characters',label:'Schede',Icon:FileTextIcon},
 {id:'notes',label:'Note',Icon:NoteIcon},
 {id:'dice',label:'Dadi',Icon:DiceFiveIcon},
] as const;
const gm=[
 {id:'encounters',label:'Incontri',Icon:MapTrifoldIcon},
 {id:'combat',label:'Combatti',Icon:SwordIcon},
] as const;
export function ArubaSessionRightRail({campaignId,isGm,notesEnabled,charactersEnabled,activePanel,onToggleNotes,onToggleCharacters}:{
 campaignId:string;isGm:boolean;notesEnabled:boolean;charactersEnabled:boolean;
 activePanel:'notes'|'characters'|null;onToggleNotes:()=>void;onToggleCharacters:()=>void;
}){
 return <aside className="session-right-rail gm-sidebar"
  aria-label="Strumenti sessione" data-aruba-session-rail="true">
  {[...shared,...(isGm?gm:[])].map(({id,label,Icon})=>{
   const enabled=(id==='notes'&&notesEnabled)||(id==='characters'&&charactersEnabled)||id==='dice';
   return <button key={id} type="button" aria-label={label}
    className={'session-rail-link'+(activePanel===id?' active':'')}
    aria-pressed={enabled?activePanel===id:undefined}
    disabled={!enabled} title={enabled?label:label+' · non ancora migrato'}
    onClick={()=>{if(id==='notes'&&enabled)onToggleNotes();
     if(id==='characters'&&enabled)onToggleCharacters();
     if(id==='dice')window.dispatchEvent(new CustomEvent('hollowgate:aruba-open-dice',{detail:{campaignId}}));}}>
    <Icon size={21} weight="duotone" aria-hidden="true"/><span>{label}</span>
   </button>;
  })}
 </aside>;
}
