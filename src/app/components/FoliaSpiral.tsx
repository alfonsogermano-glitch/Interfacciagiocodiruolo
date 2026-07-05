import { AlertCircle } from 'lucide-react';

interface FoliaSpiralProps {
  current: number;
  max: number;
  onUpdate: (value: number) => void;
}

export function FoliaSpiral({ current, max, onUpdate }: FoliaSpiralProps) {
  const boxes = Array.from({ length: max }, (_, i) => i + 1);
  const crucialBoxes = [3, 6, 9];

  return (
    <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
      <div className="mb-2 flex items-center justify-end">
        <div className="text-xs text-[var(--dash-muted)]">
          {current} / {max}
        </div>
      </div>

      <div className="flex flex-row justify-center gap-1.5">
        {boxes.map(box => {
          const isBlacked = box <= current;
          const isCrucial = crucialBoxes.includes(box);

          return (
            <button
              key={box}
              type="button"
              onClick={() => {
                if (isBlacked && box === current) {
                  onUpdate(current - 1);
                } else {
                  onUpdate(box);
                }
              }}
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all hover:scale-110 ${
                isBlacked
                  ? 'border-[var(--dash-accent)] bg-[var(--dash-bg)]'
                  : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent-2)]'
              } ${isCrucial ? 'ring-2 ring-[var(--dash-accent-2)]' : ''}`}
              title={
                isCrucial
                  ? `Casella Cruciale - Turba ${crucialBoxes.indexOf(box) + 1}`
                  : `Casella ${box}`
              }
            >
              {isCrucial && (
                <AlertCircle className="h-full w-full text-purple-400" strokeWidth={2.5} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
