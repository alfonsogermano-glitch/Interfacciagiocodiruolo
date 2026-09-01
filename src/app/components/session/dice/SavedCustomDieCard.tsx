import { useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { Copy, MoreVertical, Pencil, Shapes, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../ui/dropdown-menu';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import { DiceLibraryIconPicker } from './DiceLibraryIconPicker';
import type { SavedCustomDie } from './diceTypes.ts';

export function SavedCustomDieCard({
  die, onRoll, onEdit, onDuplicate, onDelete, onIconChange, draggable, onDragStart, onDragEnd,
}: {
  die: SavedCustomDie; onRoll: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
  onIconChange: (name: string | null) => void; draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void; onDragEnd?: (event: DragEvent<HTMLElement>) => void;
}) {
  const [picker, setPicker] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const blockDragRef = useRef(false);
  const handlePointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    blockDragRef.current = Boolean(target?.closest('[data-no-dice-library-drag]'));
  };
  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    if (blockDragRef.current) { event.preventDefault(); return; }
    onDragStart?.(event);
  };
  return <>
    <article
      data-saved-custom-die
      data-dice-library-node="custom-die"
      draggable={draggable}
      onPointerDownCapture={handlePointerDownCapture}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className="flex items-stretch overflow-hidden caret-transparent rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)]"
    >
      <button type="button" onClick={onRoll} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-[var(--dash-surface-2)]">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">
          {die.iconName ? <NoteIconGlyph name={die.iconName} className="h-5 w-5" /> : <span className="text-lg font-black">?</span>}
        </span>
        <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[var(--dash-text-strong)]">{die.name}</span><span className="block text-xs text-[var(--dash-muted)]">Dado Custom d{die.sides}</span></span>
      </button>
      <div data-no-dice-library-drag className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button ref={anchor} aria-label="Menu dado Custom" className="m-1 rounded-md p-2 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"><MoreVertical className="h-4 w-4" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[1000] border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)]">
            <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Modifica</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}><Copy className="mr-2 h-4 w-4" />Duplica</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPicker(true)}><Shapes className="mr-2 h-4 w-4" />Icona</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-400"><Trash2 className="mr-2 h-4 w-4" />Elimina</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
    <DiceLibraryIconPicker open={picker} anchorRef={anchor} itemName={die.name} selectedName={die.iconName ?? null} onChoose={(name) => { onIconChange(name); setPicker(false); }} onRemove={die.iconName ? () => { onIconChange(null); setPicker(false); } : undefined} onClose={() => setPicker(false)} />
  </>;
}
