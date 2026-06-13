import { Dices, RotateCcw } from 'lucide-react';
import { useState } from 'react';

interface DiceResult {
  dice: string;
  result: number;
  success: boolean | null;
  timestamp: number;
}

export function DiceRoller() {
  const [results, setResults] = useState<DiceResult[]>([]);
  const [target, setTarget] = useState<number>(50);

  const rollDice = (sides: number) => {
    const result = Math.floor(Math.random() * sides) + 1;
    const success = sides === 100 ? result <= target : null;

    setResults(prev => [{
      dice: `D${sides}`,
      result,
      success,
      timestamp: Date.now()
    }, ...prev.slice(0, 9)]);
  };

  const rollPercentile = () => {
    rollDice(100);
  };

  return (
    <div className="bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Dices className="w-5 h-5 text-[#8b1e1e]" />
        <h2 className="text-[#e8d4b8]">Tiro Dadi</h2>
      </div>

      <div className="mb-4">
        <label className="text-[#8b7355] text-sm block mb-2">
          Soglia di Successo (D100)
        </label>
        <input
          type="number"
          value={target}
          onChange={(e) => setTarget(Math.max(1, Math.min(100, parseInt(e.target.value) || 50)))}
          className="w-full bg-[#2a0a0a] border border-[#4a0e0e] rounded px-3 py-2 text-[#e8d4b8] focus:outline-none focus:border-[#6b1515]"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          onClick={() => rollDice(4)}
          className="bg-[#2a1a1a] border-2 border-[#4a0e0e] rounded-lg p-3 text-[#e8d4b8] hover:bg-[#3a1a1a] hover:border-[#6b1515] transition-all"
        >
          D4
        </button>
        <button
          onClick={() => rollDice(6)}
          className="bg-[#2a1a1a] border-2 border-[#4a0e0e] rounded-lg p-3 text-[#e8d4b8] hover:bg-[#3a1a1a] hover:border-[#6b1515] transition-all"
        >
          D6
        </button>
        <button
          onClick={() => rollDice(8)}
          className="bg-[#2a1a1a] border-2 border-[#4a0e0e] rounded-lg p-3 text-[#e8d4b8] hover:bg-[#3a1a1a] hover:border-[#6b1515] transition-all"
        >
          D8
        </button>
        <button
          onClick={() => rollDice(10)}
          className="bg-[#2a1a1a] border-2 border-[#4a0e0e] rounded-lg p-3 text-[#e8d4b8] hover:bg-[#3a1a1a] hover:border-[#6b1515] transition-all"
        >
          D10
        </button>
        <button
          onClick={() => rollDice(20)}
          className="bg-[#2a1a1a] border-2 border-[#4a0e0e] rounded-lg p-3 text-[#e8d4b8] hover:bg-[#3a1a1a] hover:border-[#6b1515] transition-all"
        >
          D20
        </button>
        <button
          onClick={rollPercentile}
          className="bg-[#4a0e0e] border-2 border-[#6b1515] rounded-lg p-3 text-[#e8d4b8] hover:bg-[#6b1515] transition-all"
        >
          D100
        </button>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {results.length === 0 ? (
          <div className="text-center text-[#8b7355] py-8">
            <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nessun tiro effettuato</p>
          </div>
        ) : (
          results.map((result, index) => (
            <div
              key={result.timestamp}
              className={`bg-[#2a0a0a] border rounded p-3 flex items-center justify-between ${
                result.success === true
                  ? 'border-[#2a6b2a] bg-[#0a2a0a]'
                  : result.success === false
                  ? 'border-[#6b1515] bg-[#2a0a0a]'
                  : 'border-[#4a0e0e]'
              }`}
              style={{ opacity: 1 - (index * 0.08) }}
            >
              <div className="flex items-center gap-3">
                <span className="text-[#8b7355] text-sm">{result.dice}</span>
                <span className="text-[#e8d4b8] font-mono">{result.result}</span>
              </div>
              {result.success !== null && (
                <span className={`text-sm ${result.success ? 'text-[#4a8b4a]' : 'text-[#8b1e1e]'}`}>
                  {result.success ? 'SUCCESSO' : 'FALLIMENTO'}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
