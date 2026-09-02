import { useRef, type DragEvent, type PointerEvent } from 'react';
import { Copy, Dices, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../ui/dropdown-menu';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import { CustomDieTextFace } from './CustomDieTextFace';
import { getCustomDieLibraryIconFace } from './diceCustomDieLibraryIcon.ts';
import type { SavedCustomDie } from './diceTypes.ts';

function CustomDieLibraryIcon({ die }: { die: SavedCustomDie }) {
  const face = getCustomDieLibraryIconFace(die.faces);
  if (!face) {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">
        <Dices className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span
      data-custom-die-library-face-icon
      className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-[var(--dash-border)]"
      style={{ color: die.symbolColor, backgroundColor: die.bodyColor }}
    >
      {face.visual.kind === 'icon'
        ? <NoteIconGlyph name={face.visual.iconName} className="h-6 w-6" />
        : face.visual.kind === 'text'
          ? <CustomDieTextFace text={face.visual.text} color={die.symbolColor} />
          : <img draggable={false} src={face.visual.publicUrl} className="h-full w-full object-contain p-1" />}
    </span>
  );
}

export function SavedCustomDieCard(props: {
  die: SavedCustomDie;
  onRoll: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onIconChange: (name: string | null) => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
}) {
  const { die, onRoll, onEdit, onDuplicate, onDelete, draggable, onDragStart, onDragEnd } = props;
  const blockDragRef = useRef(false);

  const handlePointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    blockDragRef.current = Boolean(target?.closest('[data-no-dice-library-drag]'));
  };

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    if (blockDragRef.current) {
      event.preventDefault();
      return;
    }
    onDragStart?.(event);
  };

  return (
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
        <CustomDieLibraryIcon die={die} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[var(--dash-text-strong)]">{die.name}</span>
          <span className="block text-xs text-[var(--dash-muted)]">Dado Custom d{die.sides}</span>
        </span>
      </button>
      <div data-no-dice-library-drag className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="Menu dado Custom" className="m-1 rounded-md p-2 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"><MoreVertical className="h-4 w-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[1000] border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)]">
            <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Modifica</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}><Copy className="mr-2 h-4 w-4" />Duplica</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-400"><Trash2 className="mr-2 h-4 w-4" />Elimina</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
