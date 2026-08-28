import { Dices, RotateCcw } from 'lucide-react';
import type { RollComparisonResult, RollResult } from './diceTypes.ts';

function CompareOutcome({ result }: { result: RollComparisonResult }) {
  if (result.success !== undefined) {
    return (
      <span
        className={`text-xs font-semibold ${
          result.success ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {result.success ? 'Successo' : 'Fallimento'}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap gap-2 text-xs font-semibold">
      {(result.successes ?? 0) > 0 && (
        <span className="text-emerald-400">{result.successes} Successi</span>
      )}
      {(result.failures ?? 0) > 0 && (
        <span className="text-red-400">{result.failures} Fallimenti</span>
      )}
    </span>
  );
}

interface DiceRollHistoryCardProps {
  result: RollResult;
  onReroll: () => void;
}

export function DiceRollHistoryCard({ result, onReroll }: DiceRollHistoryCardProps) {
  return (
    <article
      data-dice-roll-history-card
      className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-3 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
          {result.rollerAvatarUrl ? (
            <img src={result.rollerAvatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-[var(--dash-text)]">
              {result.rollerName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--dash-text-strong)]">
                {result.rollerName}
              </div>
              <div className="truncate text-xs text-[var(--dash-muted)]">{result.formulaName}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-[var(--dash-muted)]">Totale</div>
              <div className="text-2xl font-bold leading-none text-[var(--dash-text-strong)]">{result.total}</div>
            </div>
          </div>

          <div className="mt-2 rounded-md bg-[var(--dash-input)] px-2 py-1 font-mono text-xs text-[var(--dash-text)]">
            {result.formulaText}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.diceGroups.flatMap((group) =>
              group.rolls.map((die) => (
                <span
                  key={die.id}
                  title={`${die.source === 'explosion' ? 'Rilancio esplosivo' : `d${die.sides}`}${die.active ? '' : ' - escluso'}`}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                    die.active
                      ? 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-text)]'
                      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] line-through opacity-60'
                  }`}
                >
                  <Dices className="h-3 w-3" />
                  d{die.sides}: {die.face}
                  {die.contribution !== die.face && (
                    <span className="text-[10px]">({die.contribution})</span>
                  )}
                </span>
              )),
            )}
          </div>

          {result.comparisons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {result.comparisons.map((comparison) => (
                <CompareOutcome key={comparison.itemId} result={comparison} />
              ))}
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onReroll}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-2.5 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reroll
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
