import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical, Save, X } from 'lucide-react';
import { DiceNumericStepper } from '../dice/DiceNumericStepper';
import { placeFloatingNoteUI, type NoteRect } from './noteFloatingPosition';
import { ARCHIVIO_CHECKBOX_SYMBOLS, normalizeArchivioCheckbox, type ArchivioCheckboxConfig } from './archivioCheckbox';
import { ArchivioCheckboxSymbolView } from './ArchivioCheckboxSymbol';

export function ArchivioCheckboxEditPanel({ anchor, initial, onSave, onCancel }: {
  anchor: NoteRect;
  initial: ArchivioCheckboxConfig;
  onSave: (config: ArchivioCheckboxConfig) => void;
  onCancel: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [position, setPosition] = useState({ top: anchor.bottom + 6, left: anchor.left });
  const [count, setCount] = useState(initial.checkboxCount);
  const [symbol, setSymbol] = useState(initial.checkboxSymbol);
  const [half, setHalf] = useState(initial.checkboxHalf);
  useLayoutEffect(() => {
    const panel = root.current;
    if (!panel) return;
    const place = () => setPosition(placeFloatingNoteUI(anchor, panel.offsetWidth, panel.offsetHeight, 6));
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      onCancel();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape);
    };
  }, [onCancel]);
  return (
    <div ref={root} data-note-contextual-ui="true" data-archivio-checkbox-menu="true" contentEditable={false}
      role="dialog" aria-label="Modifica Checkbox" style={{ position: 'fixed', ...position, zIndex: 9999 }}
      className="max-h-[calc(100vh-16px)] w-[280px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onCancel(); } event.stopPropagation(); }}
      onPointerMove={event => {
        if (!drag.current || !root.current) return;
        setPosition({ left: Math.max(8, Math.min(event.clientX - drag.current.dx, window.innerWidth - root.current.offsetWidth - 8)),
          top: Math.max(8, Math.min(event.clientY - drag.current.dy, window.innerHeight - root.current.offsetHeight - 8)) });
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div data-edit-drag-handle="true" className="mb-1 flex cursor-grab touch-none items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] active:cursor-grabbing"
        onPointerDown={event => {
          if (event.button !== 0 || !root.current) return;
          event.preventDefault();
          const rect = root.current.getBoundingClientRect();
          drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}>
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />Modifica Checkbox
      </div>
      <div className="space-y-3 p-2 text-xs text-[var(--dash-text)]">
        
        <fieldset className="space-y-1.5">
          <legend className="mb-1">Simbolo</legend>
          <div className="grid grid-cols-4 gap-1" role="group" aria-label="Simboli checkbox">
            {ARCHIVIO_CHECKBOX_SYMBOLS.map(option => <button key={option.id} type="button" aria-label={`Simbolo ${option.label}`} aria-pressed={symbol === option.id}
              onClick={() => setSymbol(option.id)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-md border px-1 py-1.5 transition-colors duration-[var(--note-ui-duration)] ${symbol === option.id ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-text)] hover:border-[var(--dash-accent)]'}`}>
              <ArchivioCheckboxSymbolView symbol={option.id} state={2} className="h-5 w-5" />
              <span className="text-[10px]">{option.label}</span>
            </button>)}
          </div>
        </fieldset>
        <div className="flex items-center justify-center gap-2 rounded-md bg-[var(--dash-surface)] px-2 py-1.5" aria-label="Anteprima ciclo checkbox">
          <span data-checkbox-state="0" className="tiptap-archivio-checkbox h-5 w-5 p-0" />
          <span aria-hidden="true">→</span>
          {half && <><span data-checkbox-state="1" className="tiptap-archivio-checkbox h-5 w-5 p-0"><ArchivioCheckboxSymbolView symbol={symbol} state={1} className="h-full w-full" /></span><span aria-hidden="true">→</span></>}
          <span data-checkbox-state="2" className="tiptap-archivio-checkbox h-5 w-5 p-0"><ArchivioCheckboxSymbolView symbol={symbol} state={2} className="h-full w-full" /></span>
          <span aria-hidden="true">→</span><span data-checkbox-state="0" className="tiptap-archivio-checkbox h-5 w-5 p-0" />
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={half} onChange={event => setHalf(event.target.checked)} aria-label="Mezzo valore" className="tiptap-archivio-checkbox h-4 w-4 shrink-0 cursor-pointer" />
          <span>Mezzo valore</span>
        </label>
        <p className="text-[10px] text-[var(--dash-muted)]">{half ? 'Vuoto → mezzo → pieno → vuoto.' : 'Vuoto → pieno → vuoto.'} Disattivando Mezzo valore, i mezzi diventano pieni.</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => onSave(normalizeArchivioCheckbox({ ...initial, checkboxCount: count, checkboxSymbol: symbol, checkboxHalf: half }))}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--dash-accent)] px-2 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)] hover:brightness-110">
            <Save className="h-3.5 w-3.5" aria-hidden="true" />Salva
          </button>
          <button type="button" onClick={onCancel} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1.5 text-xs text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]">
            <X className="h-3.5 w-3.5" aria-hidden="true" />Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
