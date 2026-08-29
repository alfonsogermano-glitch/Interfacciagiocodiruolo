import { Dices, EyeOff, RotateCcw } from 'lucide-react';
import type { RollComparisonResult, RollResult } from './diceTypes.ts';
import { formatPrimaryRollResult } from './diceResultSummary.ts';

function CompareOutcome({ result }: { result: RollComparisonResult }) {
  if (result.success !== undefined) {
    return (
      <span
        className={`text-[11px] font-semibold ${
          result.success ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {result.success ? 'Successo' : 'Fallimento'}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
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
      className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-2 shadow-md"
    >
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
          {result.rollerAvatarUrl ? (
            <img src={result.rollerAvatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-semibold text-[var(--dash-text)]">
              {result.rollerName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold leading-tight text-[var(--dash-text-strong)]">
                {result.rollerName}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <div className="truncate text-[10px] leading-tight text-[var(--dash-muted)]">{result.formulaName}</div>
                {result.visibility === 'secret' && (
                  <span
                    data-dice-roll-secret
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--dash-border)] bg-[var(--dash-input)] px-1 py-0.5 text-[9px] font-medium leading-none text-[var(--dash-muted)]"
                    title="Tiro segreto"
                  >
                    <EyeOff className="h-2.5 w-2.5" />
                    Segreto
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-1.5">
              <div className="text-right">
                <div className="text-[9px] uppercase leading-none tracking-wide text-[var(--dash-muted)]">Totale</div>
                <div className="mt-0.5 text-lg font-bold leading-none text-[var(--dash-text-strong)]">
                  {formatPrimaryRollResult(result)}
                </div>
              </div>
              <button
                type="button"
                onClick={onReroll}
                aria-label="Ritira"
                title="Ritira"
                className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="mt-1 rounded bg-[var(--dash-input)] px-1.5 py-0.5 font-mono text-[10px] leading-tight text-[var(--dash-text)]">
            {result.formulaText}
          </div>

          <div className="mt-1 flex flex-wrap gap-1">
            {result.diceGroups.flatMap((group) =>
              group.rolls.map((die) => (
                <span
                  key={die.id}
                  title={`${die.source === 'explosion' ? 'Rilancio esplosivo' : `d${die.sides}`}${die.active ? '' : ' - escluso'}`}
                  className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] leading-none ${
                    die.active
                      ? 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-text)]'
                      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] line-through opacity-60'
                  }`}
                >
                  <Dices className="h-2.5 w-2.5" />
                  d{die.sides}: {die.face}
                  {die.contribution !== die.face && (
                    <span className="text-[9px]">({die.contribution})</span>
                  )}
                </span>
              )),
            )}
          </div>

          {result.comparisons.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              {result.comparisons.map((comparison) => (
                <CompareOutcome key={comparison.itemId} result={comparison} />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
