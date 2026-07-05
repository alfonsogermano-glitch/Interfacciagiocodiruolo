import { AlertCircle } from 'lucide-react';

interface FrischezzaTrackerProps {
  current: number;
  max: number;
  crucialBoxes: number[];
  onUpdate: (value: number) => void;
}

export function FrischezzaTracker({
  current,
  max,
  crucialBoxes,
  onUpdate
}: FrischezzaTrackerProps) {
  const boxes = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] p-3">
      <div className="mb-2 flex items-center justify-end">
        <div className="text-xs text-[var(--dash-muted)]">
          {max - current} / {max}
        </div>
      </div>

      <div className="flex flex-row justify-center gap-1.5">
        {boxes.map(box => {
          const isBlacked = box <= max - current;
          const isCrucial = crucialBoxes.includes(box);

          return (
            <button
              key={box}
              type="button"
              onClick={() => {
                if (isBlacked) {
                  onUpdate(max - (box - 1));
                } else {
                  onUpdate(max - box);
                }
              }}
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded border-2 transition-all hover:scale-110 ${
                isBlacked
                  ? 'border-[var(--dash-accent-2)] bg-[var(--dash-bg)]'
                  : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)]'
              } ${isCrucial ? 'ring-2 ring-[var(--dash-accent-2)]' : ''}`}
              title={isCrucial ? 'Casella Cruciale' : `Casella ${box}`}
            >
              {isCrucial && (
                <AlertCircle className="h-full w-full text-red-500" strokeWidth={2.5} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
