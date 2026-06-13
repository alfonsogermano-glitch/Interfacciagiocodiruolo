import { Film, Zap } from 'lucide-react';

interface DramaTrackerProps {
  drama: number;
  audacia: number;
  onDramaUpdate: (value: number) => void;
  onAudaciaUpdate: (value: number) => void;
}

const DRAMA_EFFECTS = [
  { level: 3, effect: 'Legame cambia' },
  { level: 6, effect: 'Legame cambia' },
  { level: 9, effect: 'Tutore appare' },
  { level: 12, effect: 'Litigio totale!' }
];

export function DramaTracker({ drama, audacia, onDramaUpdate, onAudaciaUpdate }: DramaTrackerProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Drama */}
      <div className="bg-[#1a0a1a] border border-[#4a0e0e] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-[#8b1e1e]" />
            <h3 className="text-[#e8d4b8] font-medium">Drama</h3>
          </div>
          <div className="text-[#e8d4b8] text-lg font-bold">
            {drama}/12
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {DRAMA_EFFECTS.map(({ level, effect }) => (
            <div
              key={level}
              className={`text-xs px-2 py-1 rounded ${
                drama >= level
                  ? 'bg-[#4a0e0e] text-[#e8d4b8]'
                  : 'bg-[#2a0a0a] text-[#8b7355]'
              }`}
            >
              <span className="font-bold">{level}:</span> {effect}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onDramaUpdate(Math.max(0, drama - 1))}
            disabled={drama === 0}
            className="flex-1 px-3 py-1.5 bg-[#2a0a0a] border border-[#4a0e0e] rounded text-[#e8d4b8] hover:bg-[#3a0e0e] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            -1
          </button>
          <button
            onClick={() => onDramaUpdate(Math.min(12, drama + 1))}
            disabled={drama === 12}
            className="flex-1 px-3 py-1.5 bg-[#4a0e0e] border border-[#6b1515] rounded text-[#e8d4b8] hover:bg-[#6b1515] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            +1
          </button>
        </div>
      </div>

      {/* Audacia */}
      <div className="bg-[#1a1a0a] border border-[#4a4a0e] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#d4a800]" />
            <h3 className="text-[#e8d4b8] font-medium">Audacia</h3>
          </div>
          <div className="text-[#e8d4b8] text-lg font-bold">
            {audacia}
          </div>
        </div>

        <div className="space-y-2 mb-4 text-xs text-[#a89855]">
          <div>• Interpreta il personaggio</div>
          <div>• OMG! (usa Legame)</div>
          <div>• Richiama equipaggiamento</div>
          <div>• Evita Turba alla casella cruciale</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onAudaciaUpdate(Math.max(0, audacia - 1))}
            disabled={audacia === 0}
            className="flex-1 px-3 py-1.5 bg-[#2a2a0a] border border-[#4a4a0e] rounded text-[#e8d4b8] hover:bg-[#3a3a0e] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            -1
          </button>
          <button
            onClick={() => onAudaciaUpdate(audacia + 1)}
            className="flex-1 px-3 py-1.5 bg-[#4a4a0e] border border-[#6b6b15] rounded text-[#e8d4b8] hover:bg-[#6b6b15] transition-colors"
          >
            +1
          </button>
        </div>
      </div>
    </div>
  );
}
