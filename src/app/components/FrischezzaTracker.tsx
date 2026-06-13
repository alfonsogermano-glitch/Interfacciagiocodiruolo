import { Heart, AlertCircle } from 'lucide-react';

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
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-[var(--dash-accent-2)]" />
          <h3 className="font-medium text-[var(--dash-text)]">Freschezza</h3>
        </div>

        <div className="text-sm text-[var(--dash-muted)]">
          {max - current} / {max}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
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
              className={`relative aspect-square rounded border-2 transition-all hover:scale-105 ${
                isBlacked
                  ? 'border-[var(--dash-accent-2)] bg-[var(--dash-bg)]'
                  : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)]'
              } ${isCrucial ? 'ring-2 ring-[var(--dash-accent-2)]' : ''}`}
              title={isCrucial ? 'Casella Cruciale' : `Casella ${box}`}
            >
              {isCrucial && (
                <AlertCircle className="absolute right-0.5 top-0.5 h-3 w-3 text-[var(--dash-accent-2)]" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-[var(--dash-muted)]">
        Clicca su una casella per annerirla/cancellarla
      </div>
    </div>
  );
}