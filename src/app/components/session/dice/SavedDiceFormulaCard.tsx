import { useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { Copy, Dices, Eye, EyeOff, MoreVertical, Pencil, Shapes, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import { DiceLibraryIconPicker } from './DiceLibraryIconPicker';
import { formatDiceFormula } from './diceFormulaText.ts';
import type { SavedDiceFormula } from './diceTypes.ts';

interface SavedDiceFormulaCardProps {
  formula: SavedDiceFormula;
  onRoll: () => void;
  onToggleSecret: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onIconChange: (iconName: string | null) => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
}

const menuItemClass = 'focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]';

export function SavedDiceFormulaCard({
  formula,
  onRoll,
  onToggleSecret,
  onEdit,
  onDuplicate,
  onDelete,
  onIconChange,
  draggable = false,
  onDragStart,
  onDragEnd,
}: SavedDiceFormulaCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
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

  const openIconPicker = () => {
    setMenuOpen(false);
    setIconPickerOpen(true);
  };

  return (
    <>
      <article
        data-saved-dice-formula
        data-dice-library-node="formula"
        draggable={draggable}
        onPointerDownCapture={handlePointerDownCapture}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        className="flex items-stretch overflow-hidden caret-transparent rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] transition-colors hover:border-[var(--dash-border-soft)]"
      >
        <button
          type="button"
          onClick={onRoll}
          className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-[var(--dash-surface-2)]"
          aria-label={`Tira ${formula.name}`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">
            {formula.iconName ? <NoteIconGlyph name={formula.iconName} className="h-5 w-5" /> : <Dices className="h-5 w-5" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--dash-text-strong)]">{formula.name}</span>
            <span className="mt-0.5 block truncate font-mono text-xs text-[var(--dash-muted)]">{formatDiceFormula(formula.items)}</span>
          </span>
        </button>

        <div data-no-dice-library-drag className="flex shrink-0 items-center gap-0.5 border-l border-[var(--dash-border)] px-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-dice-visibility-toggle
                aria-label={formula.isSecret ? 'Tiro segreto: rendi pubblico' : 'Tiro pubblico: rendi segreto'}
                onClick={onToggleSecret}
                className={`rounded-md p-2 transition-colors hover:bg-[var(--dash-surface-2)] ${formula.isSecret ? 'text-[var(--dash-muted)]' : 'text-[var(--dash-accent)]'}`}
              >
                {formula.isSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{formula.isSecret ? 'Tiro segreto' : 'Tiro pubblico'}</TooltipContent>
          </Tooltip>

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="Menu formula"
                className="rounded-md p-2 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[1000] min-w-48 border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)]">
              <DropdownMenuItem data-dice-formula-edit onClick={onEdit} className={menuItemClass}>
                <Pencil className="mr-2 h-4 w-4" />Modifica
              </DropdownMenuItem>
              <DropdownMenuItem data-dice-formula-duplicate onClick={onDuplicate} className={menuItemClass}>
                <Copy className="mr-2 h-4 w-4" />Duplica
              </DropdownMenuItem>
              <DropdownMenuItem data-dice-formula-icon onSelect={openIconPicker} className={menuItemClass}>
                <Shapes className="mr-2 h-4 w-4" />Icona
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[var(--dash-border)]" />
              <DropdownMenuItem data-dice-formula-delete onClick={onDelete} className="text-red-400 focus:bg-[var(--dash-surface-2)] focus:text-red-400">
                <Trash2 className="mr-2 h-4 w-4" />Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>

      <DiceLibraryIconPicker
        open={iconPickerOpen}
        anchorRef={menuButtonRef}
        itemName={formula.name}
        selectedName={formula.iconName ?? null}
        onChoose={(iconName) => { onIconChange(iconName); setIconPickerOpen(false); }}
        onRemove={formula.iconName ? () => { onIconChange(null); setIconPickerOpen(false); } : undefined}
        onClose={() => setIconPickerOpen(false)}
      />
    </>
  );
}
