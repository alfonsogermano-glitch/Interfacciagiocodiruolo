import { Skull } from 'lucide-react';

interface FoliaSpiralProps {
  current: number;
  max: number;
  onUpdate: (value: number) => void;
}

export function FoliaSpiral({ current, max, onUpdate }: FoliaSpiralProps) {
  const boxes = Array.from({ length: max }, (_, i) => i + 1);
  const crucialBoxes = [3, 6, 9];

  return (
    <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="relative">
        <div className="flex flex-row justify-center gap-2">
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
                className={`relative h-8 w-8 rounded-full border-2 transition-all hover:scale-125 ${
                  isBlacked
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-bg)]'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent-2)]'
                } ${isCrucial ? 'ring-2 ring-[var(--dash-accent-2)]' : ''}`}
                title={
                  isCrucial
                    ? `Casella Cruciale - Turba ${
                        crucialBoxes.indexOf(box) + 1
                      }`
                    : `Casella ${box}`
                }
              >
                {isCrucial && (
                  <Skull className="absolute inset-0 m-auto h-4 w-4 text-[var(--dash-accent-2)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <div className="text-xs text-[var(--dash-muted)]">
          Caselle cruciali: 3 (Turba Lieve), 6 (Turba Moderata), 9 (Turba Grave)
        </div>
        <div className="text-xs text-[var(--dash-muted)]">
          Pool dadi follia = caselle NON annerite
        </div>
      </div>
    </div>
  );
}
