import { Dices, Trash2, X } from 'lucide-react';
import { useDiceSession } from './DiceSessionContext';
import { DiceRollHistoryCard } from './DiceRollHistoryCard';
import { Dice3DOverlay } from './Dice3DOverlay';

export function DiceRollHistoryDrawer() {
  const {
    rolls,
    reroll,
    clearLocalHistory,
    historyOpen,
    setHistoryOpen,
    animationsEnabled,
    setAnimationsEnabled,
  } = useDiceSession();

  const drawer = !historyOpen ? (
    <button
      type="button"
      data-dice-history-toggle
      onClick={() => setHistoryOpen(true)}
      aria-label="Mostra storico tiri"
      className="fixed bottom-5 left-28 z-[940] flex h-11 w-11 items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] shadow-xl transition-transform hover:scale-105"
    >
      <Dices className="h-5 w-5" />
    </button>
  ) : (
    <section
      data-dice-history-drawer
      className="fixed bottom-5 left-28 z-[940] flex max-h-[65vh] w-[min(26rem,calc(100vw-8rem))] flex-col overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 shadow-2xl backdrop-blur-md"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--dash-border)] px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--dash-text-strong)]">
          <Dices className="h-4 w-4 text-[var(--dash-accent)]" />
          Tiri
          {rolls.length > 0 && (
            <span className="rounded-full bg-[var(--dash-surface-2)] px-2 py-0.5 text-[10px] text-[var(--dash-muted)]">
              {rolls.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-dice-3d-toggle
            aria-pressed={animationsEnabled}
            onClick={() => setAnimationsEnabled(!animationsEnabled)}
            title="Animazione dadi 3D"
            className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
              animationsEnabled
                ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : 'bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
            }`}
          >
            3D {animationsEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            data-dice-history-clear
            onClick={clearLocalHistory}
            disabled={rolls.length === 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(false)}
            aria-label="Nascondi storico tiri"
            className="rounded-md p-1.5 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {rolls.length === 0 ? (
          <div className="flex min-h-28 flex-col items-center justify-center text-center text-xs text-[var(--dash-muted)]">
            <Dices className="mb-2 h-6 w-6 opacity-50" />
            Nessun tiro effettuato in questa sessione.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rolls.map((result) => (
              <DiceRollHistoryCard
                key={result.id}
                result={result}
                onReroll={() => { reroll(result.id); }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <>
      <Dice3DOverlay />
      {drawer}
    </>
  );
}
