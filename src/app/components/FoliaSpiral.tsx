import { Skull } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface FoliaSpiralProps {
  current: number;
  max: number;
  onUpdate: (value: number) => void;
}

export function FoliaSpiral({ current, max, onUpdate }: FoliaSpiralProps) {
  const boxes = Array.from({ length: max }, (_, i) => i + 1);
  const crucialBoxes = [3, 6, 9];

  return (
    <div>
      <div className="relative">
        <div className="flex flex-row items-center justify-center">
          {boxes.map((box, idx) => {
            const isBlacked = box <= current;
            const isCrucial = crucialBoxes.includes(box);

            return (
              <div key={box} className="flex items-center">
                {idx > 0 && <div className="h-px w-2 bg-purple-900/50" />}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        if (isBlacked) {
                          onUpdate(box - 1);
                        } else {
                          onUpdate(box);
                        }
                      }}
                      className={`relative h-8 w-8 shrink-0 rounded-full border-2 transition-all hover:scale-125 ${
                        isBlacked
                          ? 'border-purple-400 bg-purple-600 shadow-[0_0_8px_rgba(192,132,252,0.6)]'
                          : 'border-purple-900/60 bg-purple-950/30 hover:border-purple-600'
                      } ${isCrucial && isBlacked ? 'ring-2 ring-purple-300' : isCrucial ? 'ring-2 ring-purple-500' : ''}`}
                    >
                      {isCrucial && (
                        <Skull className={`absolute inset-0 m-auto h-4 w-4 ${isBlacked ? 'text-white' : 'text-purple-400'}`} />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isCrucial
                      ? `Casella Cruciale - Turba ${crucialBoxes.indexOf(box) + 1}`
                      : `Casella ${box}`}
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <div className="text-xs text-purple-200/60">
          Caselle cruciali: 3 (Turba Lieve), 6 (Turba Moderata), 9 (Turba Grave)
        </div>
        <div className="text-xs text-purple-200/60">
          Pool dadi follia = caselle NON annerite
        </div>
      </div>
    </div>
  );
}
