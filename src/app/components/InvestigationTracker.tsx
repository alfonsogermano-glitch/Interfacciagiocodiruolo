import { Search, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { generateUUID } from '../../lib/uuid';

interface Clue {
  id: string;
  text: string;
  found: boolean;
}

export function InvestigationTracker() {
  const [clues, setClues] = useState<Clue[]>([
    { id: '1', text: 'Strani simboli nel cortile', found: false },
    { id: '2', text: 'Libro antico nella biblioteca', found: false },
    { id: '3', text: 'Sussurri nel corridoio', found: false }
  ]);
  const [newClue, setNewClue] = useState('');

  const toggleClue = (id: string) => {
    setClues(prev => prev.map(clue =>
      clue.id === id ? { ...clue, found: !clue.found } : clue
    ));
  };

  const addClue = () => {
    if (!newClue.trim()) return;
    setClues(prev => [...prev, {
      id: generateUUID(),
      text: newClue,
      found: false
    }]);
    setNewClue('');
  };

  const deleteClue = (id: string) => {
    setClues(prev => prev.filter(clue => clue.id !== id));
  };

  const foundCount = clues.filter(c => c.found).length;
  const progress = clues.length > 0 ? (foundCount / clues.length) * 100 : 0;

  return (
    <div className="bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Search className="w-5 h-5 text-[#8b1e1e]" />
        <h2 className="text-[#e8d4b8]">Investigazione</h2>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[#8b7355] text-sm">Indizi Trovati</span>
          <span className="text-[#e8d4b8] text-sm">{foundCount}/{clues.length}</span>
        </div>
        <div className="h-2 bg-[#2a0a0a] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#4a4a8b] to-[#6a6aab] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Nuovo indizio..."
          value={newClue}
          onChange={(e) => setNewClue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addClue()}
          className="flex-1 bg-[#2a0a0a] border border-[#4a0e0e] rounded px-3 py-2 text-[#e8d4b8] placeholder-[#6b5544] focus:outline-none focus:border-[#6b1515]"
        />
        <button
          onClick={addClue}
          className="bg-[#4a0e0e] border border-[#6b1515] rounded px-4 py-2 text-[#e8d4b8] hover:bg-[#6b1515] transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {clues.map(clue => (
          <div
            key={clue.id}
            className={`bg-[#2a0a0a] border rounded p-3 flex items-center justify-between cursor-pointer transition-colors ${
              clue.found ? 'border-[#4a4a8b] bg-[#1a1a3a]' : 'border-[#4a0e0e] hover:border-[#6b1515]'
            }`}
            onClick={() => toggleClue(clue.id)}
          >
            <div className="flex items-center gap-3 flex-1">
              {clue.found ? (
                <CheckCircle2 className="w-5 h-5 text-[#6a6aab] flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-[#8b7355] flex-shrink-0" />
              )}
              <span className={`${clue.found ? 'text-[#8b7355] line-through' : 'text-[#e8d4b8]'}`}>
                {clue.text}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteClue(clue.id);
              }}
              className="text-[#8b1e1e] hover:text-[#b82e2e] ml-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
