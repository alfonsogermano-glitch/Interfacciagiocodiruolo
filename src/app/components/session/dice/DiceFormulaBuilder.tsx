import { Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { DiceFormulaRow } from './DiceFormulaRow';
import type { DiceFormulaItem } from './diceTypes.ts';

function createItem(kind: DiceFormulaItem['kind']): DiceFormulaItem {
  const id = globalThis.crypto.randomUUID();
  switch (kind) {
    case 'compare': return { id, kind, operator: 'gte', target: 1, total: false };
    case 'dice': return { id, kind, sides: 20, quantity: 1 };
    case 'drop': return { id, kind, which: 'highest', count: 1 };
    case 'exploding': return { id, kind, mode: 'explode' };
    case 'keep': return { id, kind, which: 'highest', count: 1 };
    case 'modifier': return { id, kind, operation: 'add', value: 1 };
  }
}

interface DiceFormulaBuilderProps {
  items: DiceFormulaItem[];
  itemErrors: Record<string, string[]>;
  onChange: (items: DiceFormulaItem[]) => void;
}

export function DiceFormulaBuilder({ items, itemErrors, onChange }: DiceFormulaBuilderProps) {
  const replaceItem = (next: DiceFormulaItem) => {
    onChange(items.map((item) => item.id === next.id ? next : item));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const moveBy = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const moveDraggedBefore = (draggedId: string, targetId: string) => {
    const from = items.findIndex((item) => item.id === draggedId);
    const target = items.findIndex((item) => item.id === targetId);
    if (from < 0 || target < 0 || from === target) return;
    const next = [...items];
    const [dragged] = next.splice(from, 1);
    const insertionIndex = next.findIndex((item) => item.id === targetId);
    next.splice(insertionIndex, 0, dragged);
    onChange(next);
  };

  const append = (kind: DiceFormulaItem['kind']) => {
    onChange([...items, createItem(kind)]);
  };

  return (
    <div className="space-y-2.5">
      {items.map((item, index) => (
        <DiceFormulaRow
          key={item.id}
          item={item}
          errors={itemErrors[item.id]}
          canMoveUp={index > 0}
          canMoveDown={index < items.length - 1}
          onChange={replaceItem}
          onRemove={() => removeItem(item.id)}
          onMoveUp={() => moveBy(index, -1)}
          onMoveDown={() => moveBy(index, 1)}
          onDropItem={moveDraggedBefore}
        />
      ))}

      <div className="flex justify-center py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-dice-modifier-add
              aria-label="Aggiungi elemento alla formula"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] text-[var(--dash-muted)] transition-colors hover:border-[var(--dash-accent)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="z-[1000] min-w-48">
            <DropdownMenuItem onClick={() => append('compare')}>Confronto</DropdownMenuItem>
            <DropdownMenuItem onClick={() => append('dice')}>Dado</DropdownMenuItem>
            <DropdownMenuItem onClick={() => append('drop')}>Scarta</DropdownMenuItem>
            <DropdownMenuItem onClick={() => append('exploding')}>Esplosione</DropdownMenuItem>
            <DropdownMenuItem onClick={() => append('keep')}>Mantieni</DropdownMenuItem>
            <DropdownMenuItem onClick={() => append('modifier')}>Modificatore</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
