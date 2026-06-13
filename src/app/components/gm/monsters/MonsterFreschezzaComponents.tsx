import { useEffect, useRef } from 'react';
import type { Monster } from './monstersTypes';

export function FreschezzaMaxEditor({
  monster,
  onUpdate
}: {
  monster: Monster;
  onUpdate: (monster: Monster) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const nextMax = Math.max(0, (monster.maxFreschezza ?? 0) - 1);

            onUpdate({
              ...monster,
              maxFreschezza: nextMax,
              freschezza: Math.min(monster.freschezza ?? nextMax, nextMax),
              caselleFreschezzaCritiche: monster.caselleFreschezzaCritiche.filter(
                box => box <= nextMax
              )
            });
          }}
          className="h-10 w-10 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
        >
          −
        </button>

        <div className="flex h-10 w-16 items-center justify-center rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-text)]">
          {monster.maxFreschezza ?? 0}
        </div>

        <button
          type="button"
          onClick={() => {
            const nextMax = (monster.maxFreschezza ?? 0) + 1;

            onUpdate({
              ...monster,
              maxFreschezza: nextMax,
              freschezza: nextMax
            });
          }}
          className="h-10 w-10 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function FreschezzaBoxesEditor({
  current,
  max,
  criticalBoxes,
  hasCriticalBoxes,
  allowCriticalEditing = false,
  allowFreshnessEditing = true,
  onUpdate
}: {
  current: number;
  max: number;
  criticalBoxes: number[];
  hasCriticalBoxes: boolean;
  allowCriticalEditing?: boolean;
  allowFreshnessEditing?: boolean;
  onUpdate: (payload: {
    current: number;
    criticalBoxes: number[];
    audaciaGain: number;
  }) => void;
}) {
  const clickTimerRef = useRef<number | null>(null);
  const boxes = Array.from({ length: max }, (_, index) => index + 1);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const applyFreshnessBox = (box: number) => {
    if (!allowFreshnessEditing) {
      return;
    }

    const isCurrentlySelected = box <= current;
    const nextCurrent = isCurrentlySelected ? Math.max(0, box - 1) : box;

    onUpdate({
      current: nextCurrent,
      criticalBoxes,
      audaciaGain: 0
    });
  };

  const handleSingleClick = (box: number) => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = window.setTimeout(() => {
      applyFreshnessBox(box);
      clickTimerRef.current = null;
    }, 220);
  };

  const handleDoubleClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    box: number
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    if (!allowCriticalEditing) {
      return;
    }

    const nextCriticalBoxes = criticalBoxes.includes(box)
      ? criticalBoxes.filter(item => item !== box)
      : [...criticalBoxes, box].sort((a, b) => a - b);

    onUpdate({
      current,
      criticalBoxes: nextCriticalBoxes,
      audaciaGain: 0
    });
  };

  return (
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3">
        <h3 className="text-[var(--dash-text)]">
          Freschezza {Math.max(0, max - current)} / {max}
        </h3>
        <p className="mt-1 text-xs text-[var(--dash-muted)]">
          {allowFreshnessEditing
            ? 'Ogni casella selezionata rappresenta 1 danno subito.'
            : 'In modifica puoi impostare solo quali caselle sono Critiche.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {boxes.map(box => {
          const isFilled = box <= current;
          const isCritical = hasCriticalBoxes && criticalBoxes.includes(box);

          return (
            <button
              key={box}
              type="button"
              onClick={() => handleSingleClick(box)}
              onDoubleClick={(event) => handleDoubleClick(event, box)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg border text-xs transition-colors ${
                isFilled
                  ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                  : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
              } ${isCritical ? 'ring-2 ring-[var(--dash-danger-border)]' : ''}`}
              title={
                isCritical
                  ? 'Casella Critica: raggiungerla genera 1 Audacia'
                  : hasCriticalBoxes && allowCriticalEditing
                    ? 'Doppio click per impostare come Casella Critica'
                    : 'Freschezza'
              }
            >
              {box}

              {isCritical && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] text-[9px] font-bold text-[var(--dash-danger-text)] shadow-md">
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>

      {hasCriticalBoxes && allowCriticalEditing ? (
        <p className="mt-3 text-xs text-[var(--dash-muted)]">
          Doppio click su una casella per marcarla o rimuoverla come Casella Critica.
        </p>
      ) : hasCriticalBoxes ? (
        <p className="mt-3 text-xs text-[var(--dash-muted)]">
          Le Caselle Critiche sono evidenziate. Se raggiunte, forniscono Audacia.
        </p>
      ) : (
        <p className="mt-3 text-xs text-[var(--dash-muted)]">
          Questo mostro non ha ancora Caselle Critiche configurate.
        </p>
      )}
    </div>
  );
}


