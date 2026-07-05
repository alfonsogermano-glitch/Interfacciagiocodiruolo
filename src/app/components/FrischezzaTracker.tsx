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
    <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] p-4">
      <div className="relative">
        <div className="flex flex-row justify-center gap-2">
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
                className={`relative h-8 w-8 rounded border-2 transition-all hover:scale-110 ${
                  isBlacked
                    ? 'border-[var(--dash-accent-2)] bg-[var(--dash-bg)]'
                    : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)]'
                } ${isCrucial ? 'ring-2 ring-[var(--dash-accent-2)]' : ''}`}
                title={isCrucial ? 'Casella Cruciale' : `Casella ${box}`}
              >
                {isCrucial && (
                  <AlertCircle className="absolute inset-0 m-auto h-4 w-4 text-red-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 text-xs text-[var(--dash-muted)]">
        Clicca su una casella per annerirla/cancellarla
      </div>
    </div>
  );
}
