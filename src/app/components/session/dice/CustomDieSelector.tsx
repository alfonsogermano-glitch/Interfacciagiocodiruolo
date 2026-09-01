import { X } from 'lucide-react';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import type { SavedCustomDie } from './diceTypes.ts';
export function CustomDieSelector({ dice, onChoose, onClose, onCreate }: { dice: SavedCustomDie[]; onChoose:(die:SavedCustomDie)=>void; onClose:()=>void; onCreate?:()=>void }) {
  return <div data-custom-die-selector className="absolute bottom-full left-0 z-[1100] mb-2 w-72 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-2 shadow-2xl">
    <div className="mb-2 flex items-center justify-between px-1"><span className="text-xs font-semibold text-[var(--dash-text-strong)]">Dadi Custom</span><button onClick={onClose} className="rounded p-1 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"><X className="h-3.5 w-3.5"/></button></div>
    <div className="max-h-64 space-y-1 overflow-y-auto">
      {dice.map(die=><button key={die.id} type="button" onClick={()=>onChoose(die)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--dash-surface-2)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">{die.iconName?<NoteIconGlyph name={die.iconName} className="h-4 w-4"/>:<span className="font-bold">?</span>}</span>
        <span className="min-w-0"><span className="block truncate text-sm text-[var(--dash-text)]">{die.name}</span><span className="block text-[10px] text-[var(--dash-muted)]">d{die.sides}</span></span>
      </button>)}
      {dice.length===0&&<div className="px-2 py-4 text-center text-xs text-[var(--dash-muted)]">Nessun dado Custom salvato.</div>}
    </div>
    {onCreate&&<button type="button" onClick={onCreate} className="mt-2 w-full rounded-lg border border-[var(--dash-border)] px-2 py-2 text-xs font-medium text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]">Crea nuovo dado Custom</button>}
  </div>;
}
