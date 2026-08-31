import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Dices, Eye, EyeOff, MoreVertical, Pencil, Shapes, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { usePortalContainer } from '../../ui/portal-container';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { NoteIconGlyph, NoteIconGrid } from '../shared/NoteIconGrid';
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
}

const menuItemClass = 'focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]';
const PICKER_WIDTH = 320;
const PICKER_MARGIN = 12;
const PICKER_GAP = 8;
const PICKER_ESTIMATED_HEIGHT = 360;

export function SavedDiceFormulaCard({
  formula,
  onRoll,
  onToggleSecret,
  onEdit,
  onDuplicate,
  onDelete,
  onIconChange,
}: SavedDiceFormulaCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ top: PICKER_MARGIN, left: PICKER_MARGIN });
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const portalContainer = usePortalContainer();

  const updatePickerPosition = useCallback(() => {
    const trigger = menuButtonRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const maxLeft = Math.max(PICKER_MARGIN, window.innerWidth - PICKER_WIDTH - PICKER_MARGIN);
    const preferredLeft = rect.left - PICKER_WIDTH - PICKER_GAP;
    const fallbackRight = rect.right + PICKER_GAP;
    const left = preferredLeft >= PICKER_MARGIN
      ? preferredLeft
      : Math.min(maxLeft, fallbackRight);
    const maxTop = Math.max(PICKER_MARGIN, window.innerHeight - PICKER_ESTIMATED_HEIGHT - PICKER_MARGIN);
    const top = Math.min(Math.max(PICKER_MARGIN, rect.top), maxTop);

    setPickerPosition({ top, left });
  }, []);

  const openIconPicker = () => {
    setMenuOpen(false);
    updatePickerPosition();
    setIconPickerOpen(true);
  };

  useEffect(() => {
    if (!iconPickerOpen) return;

    updatePickerPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (pickerRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      setIconPickerOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIconPickerOpen(false);
    };

    const handleReposition = () => updatePickerPosition();

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [iconPickerOpen, updatePickerPosition]);

  const chooseIcon = (iconName: string) => {
    onIconChange(iconName);
    setIconPickerOpen(false);
  };

  const removeIcon = () => {
    onIconChange(null);
    setIconPickerOpen(false);
  };

  const iconPicker = iconPickerOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={pickerRef}
          data-dice-icon-picker
          role="dialog"
          aria-label={`Scegli icona per ${formula.name}`}
          style={{ top: pickerPosition.top, left: pickerPosition.left }}
          className="fixed z-[1100] w-80 max-w-[calc(100vw-1.5rem)] rounded-md border border-[var(--dash-border)] bg-[var(--dash-panel)] p-3 text-[var(--dash-text)] shadow-md"
        >
          <NoteIconGrid
            selectedName={formula.iconName ?? null}
            onChoose={chooseIcon}
            onRemove={formula.iconName ? removeIcon : undefined}
          />
        </div>,
        portalContainer ?? document.body,
      )
    : null;

  return (
    <>
      <article
        data-saved-dice-formula
        className="flex items-stretch overflow-hidden caret-transparent rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] transition-colors hover:border-[var(--dash-border-soft)]"
      >
        <button
          type="button"
          onClick={onRoll}
          className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-[var(--dash-surface-2)]"
          aria-label={`Tira ${formula.name}`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">
            {formula.iconName ? (
              <NoteIconGlyph name={formula.iconName} className="h-5 w-5" />
            ) : (
              <Dices className="h-5 w-5" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--dash-text-strong)]">{formula.name}</span>
            <span className="mt-0.5 block truncate font-mono text-xs text-[var(--dash-muted)]">
              {formatDiceFormula(formula.items)}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5 border-l border-[var(--dash-border)] px-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-dice-visibility-toggle
                aria-label={formula.isSecret ? 'Tiro segreto: rendi pubblico' : 'Tiro pubblico: rendi segreto'}
                onClick={onToggleSecret}
                className={`rounded-md p-2 transition-colors hover:bg-[var(--dash-surface-2)] ${
                  formula.isSecret ? 'text-[var(--dash-muted)]' : 'text-[var(--dash-accent)]'
                }`}
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
            <DropdownMenuContent
              align="end"
              className="z-[1000] min-w-48 border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)]"
            >
              <DropdownMenuItem data-dice-formula-edit onClick={onEdit} className={menuItemClass}>
                <Pencil className="mr-2 h-4 w-4" />
                Modifica
              </DropdownMenuItem>
              <DropdownMenuItem data-dice-formula-duplicate onClick={onDuplicate} className={menuItemClass}>
                <Copy className="mr-2 h-4 w-4" />
                Duplica
              </DropdownMenuItem>
              <DropdownMenuItem data-dice-formula-icon onSelect={openIconPicker} className={menuItemClass}>
                <Shapes className="mr-2 h-4 w-4" />
                Icona
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[var(--dash-border)]" />
              <DropdownMenuItem
                data-dice-formula-delete
                onClick={onDelete}
                className="text-red-400 focus:bg-[var(--dash-surface-2)] focus:text-red-400"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>
      {iconPicker}
    </>
  );
}
