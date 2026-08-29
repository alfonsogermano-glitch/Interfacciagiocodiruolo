import { Copy, Dices, Eye, EyeOff, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { formatDiceFormula } from './diceFormulaText.ts';
import type { SavedDiceFormula } from './diceTypes.ts';

interface SavedDiceFormulaCardProps {
  formula: SavedDiceFormula;
  onRoll: () => void;
  onToggleSecret: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function SavedDiceFormulaCard({
  formula,
  onRoll,
  onToggleSecret,
  onEdit,
  onDuplicate,
  onDelete,
}: SavedDiceFormulaCardProps) {
  return (
    <article
      data-saved-dice-formula
      className="flex items-stretch overflow-hidden rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] transition-colors hover:border-[var(--dash-border-soft)]"
    >
      <button
        type="button"
        onClick={onRoll}
        className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-[var(--dash-surface-2)]"
        aria-label={`Tira ${formula.name}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">
          <Dices className="h-5 w-5" />
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Menu formula"
              className="rounded-md p-2 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem data-dice-formula-edit onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifica formula
            </DropdownMenuItem>
            <DropdownMenuItem data-dice-formula-duplicate onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" />
              Duplica formula
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-dice-formula-delete onClick={onDelete} className="text-red-400 focus:text-red-400">
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina formula
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
