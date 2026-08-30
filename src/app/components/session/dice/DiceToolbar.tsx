import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { DiceTypeIcon } from './DiceTypeIcon';
import type { DiceFormulaItem } from './diceTypes.ts';

export const QUICK_DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

interface DiceToolbarProps {
  items: DiceFormulaItem[];
  onAddDie: (sides: number) => void;
}

export function DiceToolbar({ items, onAddDie }: DiceToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2" data-dice-quick-toolbar>
      {QUICK_DICE_SIDES.map((sides) => {
        const quantity = items
          .filter((item): item is Extract<DiceFormulaItem, { kind: 'dice' }> => item.kind === 'dice' && item.sides === sides)
          .reduce((sum, item) => sum + item.quantity, 0);

        return (
          <Tooltip key={sides}>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-dice-quick-side={sides}
                onClick={() => onAddDie(sides)}
                className="group relative flex h-16 min-w-16 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-2 text-[var(--dash-text)] transition-colors hover:border-[var(--dash-accent)] hover:bg-[var(--dash-surface-2)]"
                aria-label={`Aggiungi d${sides}`}
              >
                {quantity > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--dash-accent)] px-1 text-[10px] font-bold text-[var(--dash-text-strong)] shadow">
                    {quantity}
                  </span>
                )}
                <DiceTypeIcon sides={sides}
                  className={
                    sides === 100
                      ? 'h-11 w-16 transition-transform group-hover:scale-110'
                      : 'h-12 w-12 transition-transform group-hover:scale-110'
                  }
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>{`d${sides}`}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
