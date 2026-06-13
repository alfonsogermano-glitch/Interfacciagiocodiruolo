import { useState } from 'react';
import { Play, Pause, RotateCcw, CheckCircle } from 'lucide-react';

interface Phase {
  id: string;
  name: string;
  description: string;
  completed: boolean;
}

export function GamePhases() {
  const [phases, setPhases] = useState<Phase[]>([
    { id: '1', name: 'Introduzione', description: 'Presentazione dell\'ambientazione e dei personaggi', completed: false },
    { id: '2', name: 'Investigazione', description: 'I personaggi raccolgono indizi e esplorano', completed: false },
    { id: '3', name: 'Rivelazione', description: 'Gli indizi iniziano a formare un quadro', completed: false },
    { id: '4', name: 'Confronto', description: 'I personaggi affrontano la minaccia', completed: false },
    { id: '5', name: 'Epilogo', description: 'Conseguenze delle azioni dei personaggi', completed: false }
  ]);

  const [currentPhase, setCurrentPhase] = useState(0);
  const [sessionNotes, setSessionNotes] = useState('');

  const togglePhaseComplete = (id: string) => {
    setPhases(prev => prev.map(phase =>
      phase.id === id ? { ...phase, completed: !phase.completed } : phase
    ));
  };

  return (
    <div className="space-y-6">
      {/* Current Phase Indicator */}
      <div className="bg-[#1a1a1a] border-2 border-[#6b1515] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#e8d4b8]">Fase Corrente</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPhase(Math.max(0, currentPhase - 1))}
              className="bg-[#4a0e0e] border border-[#6b1515] rounded px-3 py-1 text-[#e8d4b8] hover:bg-[#6b1515] transition-colors"
            >
              Precedente
            </button>
            <button
              onClick={() => setCurrentPhase(Math.min(phases.length - 1, currentPhase + 1))}
              className="bg-[#4a0e0e] border border-[#6b1515] rounded px-3 py-1 text-[#e8d4b8] hover:bg-[#6b1515] transition-colors"
            >
              Successiva
            </button>
          </div>
        </div>
        <div className="bg-[#2a0e0e] rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <Play className="w-6 h-6 text-[#8b1e1e]" />
            <h3 className="text-[#e8d4b8]">{phases[currentPhase]?.name}</h3>
          </div>
          <p className="text-[#8b7355]">{phases[currentPhase]?.description}</p>
        </div>
      </div>

      {/* All Phases */}
      <div className="bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg p-6">
        <h2 className="text-[#e8d4b8] mb-4">Tutte le Fasi</h2>
        <div className="space-y-3">
          {phases.map((phase, index) => (
            <div
              key={phase.id}
              className={`bg-[#2a0e0e] rounded-lg p-4 border-2 ${
                index === currentPhase ? 'border-[#6b1515]' : 'border-transparent'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#8b7355]">#{index + 1}</span>
                    <h4 className="text-[#e8d4b8]">{phase.name}</h4>
                    {phase.completed && <CheckCircle className="w-5 h-5 text-green-600" />}
                  </div>
                  <p className="text-[#8b7355] text-sm">{phase.description}</p>
                </div>
                <button
                  onClick={() => togglePhaseComplete(phase.id)}
                  className={`px-3 py-1 rounded text-sm ${
                    phase.completed
                      ? 'bg-green-900 text-green-200 border border-green-700'
                      : 'bg-[#4a0e0e] text-[#8b7355] border border-[#6b1515]'
                  }`}
                >
                  {phase.completed ? 'Completata' : 'In corso'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Session Notes */}
      <div className="bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg p-6">
        <h2 className="text-[#e8d4b8] mb-4">Note di Sessione</h2>
        <textarea
          value={sessionNotes}
          onChange={(e) => setSessionNotes(e.target.value)}
          placeholder="Annotazioni sulla sessione di gioco..."
          className="w-full h-48 bg-[#2a0e0e] text-[#e8d4b8] border-2 border-[#4a0e0e] rounded-lg p-4 resize-none focus:border-[#6b1515] outline-none"
        />
      </div>
    </div>
  );
}