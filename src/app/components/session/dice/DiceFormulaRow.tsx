import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import type { DiceFormulaItem } from './diceTypes.ts';

const fieldClass =
  'h-9 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]';
const INTERACTIVE_DRAG_SELECTOR = 'input, select, button, a, textarea, [contenteditable="true"], [role="button"], label';
type DropPosition = 'before' | 'after';

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
  onDropItem: (draggedId: string, targetId: string, position: DropPosition) => void;
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
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragGhostRef = useRef<HTMLElement | null>(null);

  const update = <T extends DiceFormulaItem>(patch: Partial<T>) => {
    onChange({ ...item, ...patch } as DiceFormulaItem);
  };

  const clearDragGhost = () => {
    dragGhostRef.current?.remove();
    dragGhostRef.current = null;
  };

  const getDropPosition = (clientY: number, element: HTMLElement): DropPosition => {
    const rect = element.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };

  return (
    <div
      data-dice-formula-row
      data-dice-formula-kind={item.kind}
      data-dice-drop-position={dropPosition ?? undefined}
      draggable
      aria-grabbed={isDragging}
      onDragStart={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest(INTERACTIVE_DRAG_SELECTOR)) {
          event.preventDefault();
          return;
        }

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.id);

        clearDragGhost();
        const sourceRect = event.currentTarget.getBoundingClientRect();
        const sourceStyle = window.getComputedStyle(event.currentTarget);
        const ghost = event.currentTarget.cloneNode(true) as HTMLElement;
        ghost.setAttribute('data-dice-drag-ghost', 'true');
        ghost.removeAttribute('data-dice-drop-position');
        ghost.style.position = 'fixed';
        ghost.style.left = '-10000px';
        ghost.style.top = '-10000px';
        ghost.style.width = `${sourceRect.width}px`;
        for (const property of ['--dash-surface', '--dash-input', '--dash-text', '--dash-muted', '--dash-border', '--dash-border-soft', '--dash-surface-2', '--dash-accent']) {
          const value = sourceStyle.getPropertyValue(property);
          if (value) ghost.style.setProperty(property, value);
        }
        ghost.style.backgroundColor = sourceStyle.backgroundColor;
        ghost.style.color = sourceStyle.color;
        ghost.style.borderColor = sourceStyle.borderColor;
        ghost.style.opacity = '0.95';
        ghost.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.28)';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        document.body.appendChild(ghost);
        dragGhostRef.current = ghost;

        const offsetX = Math.min(Math.max(event.clientX - sourceRect.left, 0), sourceRect.width);
        const offsetY = Math.min(Math.max(event.clientY - sourceRect.top, 0), sourceRect.height);
        event.dataTransfer.setDragImage(ghost, offsetX, offsetY);
        setIsDragging(true);
      }}
      onDragEnd={() => {
        setIsDragging(false);
        setDropPosition(null);
        clearDragGhost();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropPosition(getDropPosition(event.clientY, event.currentTarget));
      }}
      onDragLeave={(event) => {
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
        setDropPosition(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData('text/plain');
        const position = getDropPosition(event.clientY, event.currentTarget);
        setDropPosition(null);
        if (draggedId && draggedId !== item.id) onDropItem(draggedId, item.id, position);
      }}
      className={`relative cursor-grab rounded-lg border bg-[var(--dash-surface)] p-2.5 transition-opacity active:cursor-grabbing ${
        isDragging ? 'opacity-65' : 'opacity-100'
      } ${errors.length > 0 ? 'border-red-500/70' : 'border-[var(--dash-border)]'}`}
    >
      {dropPosition && (
        <div
          data-dice-drop-indicator={dropPosition}
          className={`pointer-events-none absolute left-2 right-2 z-20 h-0.5 rounded-full bg-[var(--dash-accent)] shadow-[0_0_8px_var(--dash-accent)] ${
            dropPosition === 'before' ? '-top-[6px]' : '-bottom-[6px]'
          }`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Tipo elemento formula"
          value={item.kind}
          onChange={(event) => onChange(defaultItemForKind(item.id, event.target.value as DiceFormulaItem['kind']))}
          className={`${fieldClass} min-w-28`}
        >
          <option value="compare">Confronto</option>
          <option value="dice">Dado</option>
          <option value="drop">Scarta</option>
          <option value="exploding">Esplosione</option>
          <option value="keep">Mantieni</option>
          <option value="modifier">Modificatore</option>
        </select>

        {item.kind === 'dice' && (
          <>
            <NumericStepper
              value={item.quantity}
              min={1}
              integer
              ariaLabel="Quantità dadi"
              onChange={(quantity) => update({ quantity })}
            />
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
              <option value="highest">Maggiore o uguale</option>
              <option value="lowest">Minore o uguale</option>
              <option value="equal">Uguale</option>
            </select>
            <NumericStepper
              value={item.count}
              min={1}
              integer
              ariaLabel="Soglia Mantieni"
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
              <option value="highest">Più alti</option>
              <option value="lowest">Più bassi</option>
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
            aria-label="Modalità esplosione"
            value={item.mode}
            onChange={(event) => update({ mode: event.target.value as 'explode' | 'compound' | 'penetrate' })}
            className={`${fieldClass} min-w-56`}
          >
            <option value="explode">Esplodi sul valore massimo</option>
            <option value="compound">Somma i rilanci aggiuntivi</option>
            <option value="penetrate">Rilanci penetranti</option>
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
              <option value="gte">Maggiore o uguale a</option>
              <option value="lte">Minore o uguale a</option>
              <option value="eq">Uguale a</option>
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
              <option value="add">Somma</option>
              <option value="divide">Dividi</option>
              <option value="exponent">Potenza</option>
              <option value="multiply">Moltiplica</option>
              <option value="subtract">Sottrai</option>
            </select>
            <NumericStepper
              value={item.value}
              ariaLabel="Valore modificatore"
              onChange={(value) => update({ value })}
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                aria-label="Sposta su"
                className="rounded p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:opacity-25"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Sposta su</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                aria-label="Sposta giù"
                className="rounded p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:opacity-25"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Sposta giù</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onRemove}
                aria-label="Rimuovi elemento"
                className="rounded p-1.5 text-[var(--dash-muted)] hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Rimuovi elemento</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-2 text-xs text-red-400">{errors.join(' ')}</div>
      )}
    </div>
  );
}