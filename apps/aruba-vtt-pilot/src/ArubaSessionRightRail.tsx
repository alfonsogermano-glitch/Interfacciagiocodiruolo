import {MessageSquare,FileText,StickyNote,Dices,MapPinned,Swords} from 'lucide-react';
/** Source-aligned icon order of original SessionRightSidebar.
 * Unsupported capabilities are genuinely disabled except the Aruba character list, never fake actions. */
const shared=[
 {id:'chat',label:'Chat',Icon:MessageSquare},
 {id:'characters',label:'Schede',Icon:FileText},
 {id:'notes',label:'Note',Icon:StickyNote},
 {id:'dice',label:'Dadi',Icon:Dices},
] as const;
const gm=[
 {id:'encounters',label:'Incontri',Icon:MapPinned},
 {id:'combat',label:'Combatti',Icon:Swords},
] as const;
export function ArubaSessionRightRail({notesEnabled,charactersEnabled,activePanel,onToggleNotes,onToggleCharacters}:{
 notesEnabled:boolean;charactersEnabled:boolean;
 activePanel:'notes'|'characters'|null;onToggleNotes:()=>void;onToggleCharacters:()=>void;
}){
 return <aside className="session-right-rail gm-sidebar"
  aria-label="Strumenti sessione" data-aruba-session-rail="true">
  {[...shared,...gm].map(({id,label,Icon})=>{
   const enabled=(id==='notes'&&notesEnabled)||(id==='characters'&&charactersEnabled);
   return <button key={id} type="button" aria-label={label}
    className={'session-rail-link'+(activePanel===id?' active':'')}
    aria-pressed={enabled?activePanel===id:undefined}
    disabled={!enabled} title={enabled?label:label+' · non ancora migrato'}
    onClick={()=>{if(id==='notes'&&enabled)onToggleNotes();
     if(id==='characters'&&enabled)onToggleCharacters();}}>
    <Icon size={18} aria-hidden="true"/><span>{label}</span>
   </button>;
  })}
 </aside>;
}
