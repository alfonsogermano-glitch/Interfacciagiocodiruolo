import { ArrowDown, ArrowUp, GripVertical, Minus, Plus, Trash2 } from 'lucide-react';
import type { DiceFormulaItem } from './diceTypes.ts';

const fieldClass =
  'h-9 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]';

function defaultItemForKind(id: string, kind: DiceFormulaItem['kind']): DiceFormulaItem {
  switch (kind) {
    case 'dice': return { id, kind, sides: 20, quantity: 1 };
    case 'keep': return { id, kind, which: 'highest', count: 1 };
    case 'drop': return { id, kind, which: 'highest', count: 1 };
    case 'exploding': return { id, kind, mode: 'explode' };
    case 'compare': return { id, kind, operator: 'gte', target: 1, total: false };
    case 'modifier': return { id, kind, operation: 'add', value: 1 };
  }
}

function NumericStepper({
  value,
  onChange,
  min,
  integer = false,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  integer?: boolean;
  ariaLabel: string;
}) {
  const normalize = (next: number) => {
    if (!Number.isFinite(next)) return;
    let result = integer ? Math.round(next) : next;
    if (min !== undefined) result = Math.max(min, result);
    onChange(result);
  };

  return (
    <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)]">
      <button
        type="button"
        aria-label={`Diminuisci ${ariaLabel}`}
        onClick={() => normalize(value - 1)}
        className="flex w-9 items-center justify-center text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        aria-label={ariaLabel}
        value={Number.isFinite(value) ? value : ''}
        min={min}
        step={integer ? 1 : 'any'}
        onChange={(event) => normalize(Number(event.target.value))}
        className="w-16 border-x border-[var(--dash-border)] bg-transparent px-1 text-center text-sm text-[var(--dash-text)] outline-none"
      />
      <button
        type="button"
        aria-label={`Aumenta ${ariaLabel}`}
        onClick={() => normalize(value + 1)}
        className="flex w-9 items-center justify-center text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface DiceFormulaRowProps {
  item: DiceFormulaItem;
  errors?: string[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (item: DiceFormulaItem) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDropItem: (draggedId: string, targetId: string) => void;
}

export function DiceFormulaRow({
  item,
  errors = [],
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDropItem,
}: DiceFormulaRowProps) {
  const update = <T extends DiceFormulaItem>(patch: Partial<T>) => {
    onChange({ ...item, ...patch } as DiceFormulaItem);
  };

  return (
    <div
      data-dice-formula-row
      data-dice-formula-kind={item.kind}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== item.id) onDropItem(draggedId, item.id);
      }}
      className={`rounded-lg border bg-[var(--dash-surface)] p-2.5 ${
        errors.length > 0 ? 'border-red-500/70' : 'border-[var(--dash-border)]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', item.id);
          }}
          aria-label="Trascina per riordinare"
          title="Trascina per riordinare"
          className="cursor-grab rounded p-1 text-[var(--dash-muted)] active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </span>

        <select
          aria-label="Tipo elemento formula"
          value={item.kind}
          onChange={(event) => onChange(defaultItemForKind(item.id, event.target.value as DiceFormulaItem['kind']))}
          className={`${fieldClass} min-w-28`}
        >
          <option value="compare">Compare</option>
          <option value="dice">Dice</option>
          <option value="drop">Drop</option>
          <option value="exploding">Exploding</option>
          <option value="keep">Keep</option>
          <option value="modifier">Modifier</option>
        </select>

        {item.kind === 'dice' && (
          <>
            <label className="flex h-9 items-center overflow-hidden rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] text-sm text-[var(--dash-text)]">
              <span className="border-r border-[var(--dash-border)] px-2 font-semibold">D</span>
              <input
                type="number"
                min={2}
                step={1}
                aria-label="Facce del dado"
                value={item.sides}
                onChange={(event) => update({ sides: Math.max(2, Math.round(Number(event.target.value) || 2)) })}
                className="h-full w-20 bg-transparent px-2 outline-none"
              />
            </label>
            <NumericStepper
              value={item.quantity}
              min={1}
              integer
              ariaLabel="Quantita dadi"
              onChange={(quantity) => update({ quantity })}
            />
          </>
        )}

        {item.kind === 'keep' && (
          <>
            <select
              aria-label="Risultati da mantenere"
              value={item.which}
              onChange={(event) => update({ which: event.target.value as 'highest' | 'lowest' | 'equal' })}
              className={`${fieldClass} min-w-28`}
            >
              <option value="highest">Highest</option>
              <option value="lowest">Lowest</option>
              <option value="equal">Equal</option>
            </select>
            <NumericStepper
              value={item.count}
              min={1}
              integer
              ariaLabel="Valore soglia Keep"
              onChange={(count) => update({ count })}
            />
          </>
        )}

        {item.kind === 'drop' && (
          <>
            <select
              aria-label="Risultati da scartare"
              value={item.which}
              onChange={(event) => update({ which: event.target.value as 'highest' | 'lowest' })}
              className={`${fieldClass} min-w-28`}
            >
              <option value="highest">Highest</option>
              <option value="lowest">Lowest</option>
            </select>
            <NumericStepper
              value={item.count}
              min={1}
              integer
              ariaLabel="Numero risultati"
              onChange={(count) => update({ count })}
            />
          </>
        )}

        {item.kind === 'exploding' && (
          <select
            aria-label="Modalita exploding"
            value={item.mode}
            onChange={(event) => update({ mode: event.target.value as 'explode' | 'compound' | 'penetrate' })}
            className={`${fieldClass} min-w-56`}
          >
            <option value="explode">Explode highest value</option>
            <option value="compound">Compound additional rolls</option>
            <option value="penetrate">Penetrate additional rolls</option>
          </select>
        )}

        {item.kind === 'compare' && (
          <>
            <select
              aria-label="Operatore di confronto"
              value={item.operator}
              onChange={(event) => update({ operator: event.target.value as 'gte' | 'lte' | 'eq' })}
              className={`${fieldClass} min-w-48`}
            >
              <option value="gte">Greater than or equal to</option>
              <option value="lte">Less than or equal to</option>
              <option value="eq">Equals</option>
            </select>
            <NumericStepper
              value={item.target}
              ariaLabel="Soglia confronto"
              onChange={(target) => update({ target })}
            />
            <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 text-sm text-[var(--dash-text)]">
              <input
                type="checkbox"
                checked={item.total}
                onChange={(event) => update({ total: event.target.checked })}
                className="accent-[var(--dash-accent)]"
              />
              Totale
            </label>
          </>
        )}

        {item.kind === 'modifier' && (
          <>
            <select
              aria-label="Operazione matematica"
              value={item.operation}
              onChange={(event) => update({ operation: event.target.value as typeof item.operation })}
              className={`${fieldClass} min-w-28`}
            >
              <option value="add">Add</option>
              <option value="divide">Divide</option>
              <option value="exponent">Exponent</option>
              <option value="multiply">Multiply</option>
              <option value="subtract">Subtract</option>
            </select>
            <NumericStepper
              value={item.value}
              ariaLabel="Valore modificatore"
              onChange={(value) => update({ value })}
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label="Sposta su"
            title="Sposta su"
            className="rounded p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:opacity-25"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label="Sposta giu"
            title="Sposta giu"
            className="rounded p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:opacity-25"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Rimuovi elemento"
            title="Rimuovi elemento"
            className="rounded p-1.5 text-[var(--dash-muted)] hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-2 text-xs text-red-400">{errors.join(' ')}</div>
      )}
    </div>
  );
}
