import { useEffect, useRef } from 'react';
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!historyOpen) return;

    const frame = requestAnimationFrame(() => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    });

    return () => cancelAnimationFrame(frame);
  }, [historyOpen, rolls.length]);

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
      className="fixed bottom-5 left-28 z-[940] flex max-h-[58vh] w-[min(22rem,calc(100vw-8rem))] flex-col overflow-hidden rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 shadow-2xl backdrop-blur-md"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--dash-border)] px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dash-text-strong)]">
          <Dices className="h-3.5 w-3.5 text-[var(--dash-accent)]" />
          Tiri
          {rolls.length > 0 && (
            <span className="rounded-full bg-[var(--dash-surface-2)] px-1.5 py-0.5 text-[9px] text-[var(--dash-muted)]">
              {rolls.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            data-dice-3d-toggle
            aria-pressed={animationsEnabled}
            onClick={() => setAnimationsEnabled(!animationsEnabled)}
            title="Animazione dadi 3D"
            className={`rounded-md px-1.5 py-1 text-[10px] font-semibold transition-colors ${
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
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(false)}
            aria-label="Nascondi storico tiri"
            className="rounded-md p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        data-dice-history-scroll
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
      >
        {rolls.length === 0 ? (
          <div className="flex min-h-20 flex-col items-center justify-center text-center text-[11px] text-[var(--dash-muted)]">
            <Dices className="mb-1.5 h-5 w-5 opacity-50" />
            Nessun tiro effettuato in questa sessione.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
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
