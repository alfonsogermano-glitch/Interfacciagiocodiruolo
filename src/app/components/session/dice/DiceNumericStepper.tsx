import { Minus, Plus } from 'lucide-react';

export function DiceNumericStepper({ value, onChange, min, max, integer = false, fullWidth = false, ariaLabel }: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  fullWidth?: boolean;
  ariaLabel: string;
}) {
  const normalize = (next: number) => {
    if (!Number.isFinite(next)) return;
    let result = integer ? Math.round(next) : next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    onChange(result);
  };

  return <div className={`flex h-9 items-stretch overflow-hidden rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] ${fullWidth ? 'w-full' : ''}`}>
    <button type="button" aria-label={`Diminuisci ${ariaLabel}`} onClick={() => normalize(value - 1)} className="flex w-9 items-center justify-center text-[var(--dash-muted)]"><Minus className="h-3.5 w-3.5" /></button>
    <input type="number" aria-label={ariaLabel} value={Number.isFinite(value) ? value : ''} min={min} max={max} step={integer ? 1 : 'any'} onChange={(event) => normalize(Number(event.target.value))} className={`${fullWidth ? 'min-w-0 flex-1' : 'w-16'} appearance-none border-x border-[var(--dash-border)] bg-transparent px-1 text-center text-sm text-[var(--dash-text)] outline-none [caret-color:auto] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none`} />
    <button type="button" aria-label={`Aumenta ${ariaLabel}`} onClick={() => normalize(value + 1)} className="flex w-9 items-center justify-center text-[var(--dash-muted)]"><Plus className="h-3.5 w-3.5" /></button>
  </div>;
}
