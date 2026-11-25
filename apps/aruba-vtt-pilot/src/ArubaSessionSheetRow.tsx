import {EyeOff} from 'lucide-react';
import type {ReactNode} from 'react';

/** Geometry copied from original SessionCharactersPanel.renderListItem. */
export function ArubaSessionSheetRow({name,subtitle,portrait,selected,disabled,onOpen,label,hiddenFromPlayers=false}:{
 name:string;subtitle:string;portrait:ReactNode;selected:boolean;disabled:boolean;
 onOpen:()=>void;label:string;hiddenFromPlayers?:boolean;
}){
 return <button type="button" disabled={disabled} aria-label={label}
  aria-current={selected?'true':undefined}
  onClick={onOpen}
  className={`aruba-session-entity-row relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
   selected?'bg-[var(--dash-surface-2)]':'hover:bg-[var(--dash-surface-2)]/50'}`}>
  <div className="relative h-9 w-9 shrink-0 overflow-visible rounded-md bg-[var(--dash-input)]">
   {portrait}
   {hiddenFromPlayers&&<div className="pointer-events-none absolute -bottom-1 -right-1 z-[3] flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-black/75">
    <EyeOff className="h-2.5 w-2.5 text-white"/>
   </div>}
  </div>
  <div className="min-w-0">
   <div className="truncate text-sm font-medium text-[var(--dash-text-strong)]">{name}</div>
   <div className="truncate text-xs text-[var(--dash-muted)]">{subtitle}</div>
  </div>
 </button>;
}
