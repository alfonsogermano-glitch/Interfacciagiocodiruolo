import { AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

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
    <div>
      <div className="relative">
        <div className="flex flex-row items-center justify-center">
          {boxes.map((box, idx) => {
            const isBlacked = box <= max - current;
            const isCrucial = crucialBoxes.includes(box);

            return (
              <div key={box} className="flex items-center">
                {idx > 0 && <div className="h-px w-2 bg-red-900/50" />}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        if (isBlacked) {
                          onUpdate(max - (box - 1));
                        } else {
                          onUpdate(max - box);
                        }
                      }}
                      className={`relative h-8 w-8 shrink-0 rounded border-2 transition-all hover:scale-110 ${
                        isBlacked
                          ? 'border-red-400 bg-red-600 shadow-[0_0_8px_rgba(248,113,113,0.6)]'
                          : 'border-red-900/60 bg-red-950/30 hover:border-red-600'
                      } ${isCrucial && isBlacked ? 'ring-2 ring-red-300' : isCrucial ? 'ring-2 ring-red-500' : ''}`}
                    >
                      {isCrucial && (
                        <AlertCircle className={`absolute inset-0 m-auto h-4 w-4 ${isBlacked ? 'text-white' : 'text-red-400'}`} />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{isCrucial ? 'Casella Cruciale' : `Casella ${box}`}</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 text-xs text-red-200/60">
        Clicca su una casella per annerirla/cancellarla
      </div>
    </div>
  );
}
