import { Dices } from 'lucide-react';
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
          <button
            key={sides}
            type="button"
            data-dice-quick-side={sides}
            onClick={() => onAddDie(sides)}
            className="group relative flex h-16 min-w-16 flex-col items-center justify-center gap-1 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 text-[var(--dash-text)] transition-colors hover:border-[var(--dash-accent)] hover:bg-[var(--dash-surface-2)]"
            aria-label={`Aggiungi d${sides}`}
          >
            {quantity > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--dash-accent)] px-1 text-[10px] font-bold text-[var(--dash-text-strong)] shadow">
                {quantity}
              </span>
            )}
            <Dices className="h-5 w-5 transition-transform group-hover:-rotate-6" />
            <span className="text-xs font-semibold">d{sides}</span>
          </button>
        );
      })}
    </div>
  );
}
