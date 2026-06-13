import { User, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { FrischezzaTracker } from './FrischezzaTracker';
import { FoliaSpiral } from './FoliaSpiral';
import { ConditionsPanel } from './ConditionsPanel';
import { TurbePanel } from './TurbePanel';
import { EquipmentPanel } from './EquipmentPanel';
import type { Character } from '../../types/character';

interface CompleteCharacterSheetProps {
  character: Character;
  onUpdate: (character: Character) => void;
  onDelete: (id: string) => void;
  audacia: number;
  onAudaciaUpdate: (value: number) => void;
}

export function CompleteCharacterSheet({
  character,
  onUpdate,
  onDelete,
  audacia,
  onAudaciaUpdate
}: CompleteCharacterSheetProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'conditions' | 'equipment'>('stats');

  const updateFrischezza = (value: number) => {
    onUpdate({ ...character, freschezza: value });
  };

  const updateFollia = (value: number) => {
    onUpdate({ ...character, follia: value });
  };

  const updateConditions = (conditions: typeof character.conditions) => {
    onUpdate({ ...character, conditions });
  };

  const updateTurbe = (turbe: typeof character.turbe) => {
    onUpdate({ ...character, turbe });
  };

  const updateEquipment = (equipment: typeof character.equipment) => {
    onUpdate({ ...character, equipment });
  };

  return (
    <div className="bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#2a0a0a] to-[#1a1a1a] p-4 border-b-2 border-[#4a0e0e]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#2a0a0a] border-2 border-[#6b1515] rounded-full flex items-center justify-center">
              <User className="w-7 h-7 text-[#8b1e1e]" />
            </div>
            <div>
              <h3 className="text-[#e8d4b8] text-xl font-bold mb-1">{character.name}</h3>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-[#8b7355]">{character.style} - {character.viaggio}</span>
                <span className="text-[#6b5544]">•</span>
                <span className="text-[#8b7355]">Audacia: {audacia}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-4 py-2 bg-[#2a1a1a] border border-[#4a0e0e] rounded text-[#8b7355] hover:bg-[#3a1a1a] transition-colors flex items-center gap-2"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Chiudi
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Espandi
                </>
              )}
            </button>
            <button
              onClick={() => {
                if (confirm('Sei sicuro di voler eliminare questo personaggio?')) {
                  onDelete(character.id);
                }
              }}
              className="p-2 bg-[#4a0e0e] border border-[#6b1515] rounded text-[#e8d4b8] hover:bg-[#6b1515] transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {Object.entries(character.ambiti).map(([ambito, value]) => (
            <div key={ambito} className="bg-[#1a0a0a] border border-[#4a0e0e] rounded px-3 py-2">
              <div className="text-xs text-[#8b7355] mb-1">{ambito}</div>
              <div className="text-lg font-bold text-[#e8d4b8]">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Tabs */}
          <div className="flex gap-2 mb-4 border-b border-[#4a0e0e]">
            {[
              { id: 'stats' as const, label: 'Stato' },
              { id: 'conditions' as const, label: 'Condizioni & Follia' },
              { id: 'equipment' as const, label: 'Equipaggiamento' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-[#e8d4b8] border-[#8b1e1e]'
                    : 'text-[#8b7355] border-transparent hover:text-[#e8d4b8]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="space-y-4">
            {activeTab === 'stats' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <FrischezzaTracker
                  current={character.freschezza}
                  max={character.maxFreschezza}
                  crucialBoxes={character.caselleFrischezzaCruciali}
                  onUpdate={updateFrischezza}
                />

                <div className="space-y-4">
                  {/* Legame e Tutore */}
                  <div className="bg-[#2a0a0a] border border-[#4a0e0e] rounded-lg p-4">
                    <div className="space-y-2">
                      <div>
                        <div className="text-xs text-[#8b7355] mb-1">Legame</div>
                        <div className="text-[#e8d4b8]">{character.legame || 'Nessuno'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#8b7355] mb-1">Tutore</div>
                        <div className="text-[#e8d4b8]">{character.tutore || 'Nessuno'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#8b7355] mb-1">Prodigio</div>
                        <div className="text-[#e8d4b8] text-sm">{character.prodigio || 'Nessuno'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Tratti */}
                  {character.tratti.length > 0 && (
                    <div className="bg-[#2a0a0a] border border-[#4a0e0e] rounded-lg p-4">
                      <div className="text-xs text-[#8b7355] mb-2 font-medium">Tratti</div>
                      <div className="space-y-2">
                        {character.tratti.map((trait, idx) => (
                          <div key={idx} className="text-sm">
                            <div className="text-[#e8d4b8] font-medium">{trait.name}</div>
                            <div className="text-xs text-[#8b7355]">{trait.benefit}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'conditions' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <ConditionsPanel
                    conditions={character.conditions}
                    onUpdate={updateConditions}
                  />
                </div>

                <div className="space-y-4">
                  <FoliaSpiral
                    current={character.follia}
                    max={character.maxFollia}
                    onUpdate={updateFollia}
                  />

                  <TurbePanel
                    turbe={character.turbe}
                    onUpdate={updateTurbe}
                  />
                </div>
              </div>
            )}

            {activeTab === 'equipment' && (
              <EquipmentPanel
                equipment={character.equipment}
                onUpdate={updateEquipment}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
