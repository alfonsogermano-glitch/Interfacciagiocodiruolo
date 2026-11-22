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
export function ArubaSessionRightRail({campaignId,isGm,chatEnabled,notesEnabled,charactersEnabled,encountersEnabled,combatEnabled,activePanel,onToggleChat,onToggleNotes,onToggleCharacters,onToggleEncounters,onToggleCombat}:{
 campaignId:string;isGm:boolean;chatEnabled:boolean;notesEnabled:boolean;charactersEnabled:boolean;encountersEnabled:boolean;combatEnabled:boolean;
 activePanel:'chat'|'notes'|'characters'|'encounters'|'combat'|null;onToggleChat:()=>void;onToggleNotes:()=>void;onToggleCharacters:()=>void;onToggleEncounters:()=>void;onToggleCombat:()=>void;
}){
 return <aside className="session-right-rail gm-sidebar"
  aria-label="Strumenti sessione" data-aruba-session-rail="true">
  {[...shared,...(isGm?gm:[])].map(({id,label,Icon})=>{
     const enabled=(id==='chat'&&chatEnabled)||(id==='notes'&&notesEnabled)||(id==='characters'&&charactersEnabled)||(id==='encounters'&&encountersEnabled)||(id==='combat'&&combatEnabled)||id==='dice';
   return <button key={id} type="button" aria-label={label}
    className={'session-rail-link'+(activePanel===id?' active':'')}
    aria-pressed={enabled?activePanel===id:undefined}
    disabled={!enabled} title={enabled?label:label+' · non ancora migrato'}
      onClick={()=>{if(id==='chat'&&enabled)onToggleChat();
       if(id==='notes'&&enabled)onToggleNotes();
       if(id==='characters'&&enabled)onToggleCharacters();
       if(id==='encounters'&&enabled)onToggleEncounters();
      if(id==='combat'&&enabled)onToggleCombat();
      if(id==='dice')window.dispatchEvent(new CustomEvent('hollowgate:aruba-open-dice',{detail:{campaignId}}));}}>
    <Icon size={21} weight="duotone" aria-hidden="true"/><span>{label}</span>
   </button>;
  })}
 </aside>;
}
