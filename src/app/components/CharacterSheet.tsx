import { User, Heart, Brain, BookOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Character {
  id: string;
  name: string;
  role: string;
  health: number;
  maxHealth: number;
  sanity: number;
  maxSanity: number;
  skills: { name: string; value: number }[];
}

interface CharacterSheetProps {
  character: Character;
  onUpdate: (character: Character) => void;
  onDelete: (id: string) => void;
}

export function CharacterSheet({ character, onUpdate, onDelete }: CharacterSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateStat = (stat: 'health' | 'sanity', delta: number) => {
    const newValue = Math.max(0, Math.min(character[stat] + delta, character[stat === 'health' ? 'maxHealth' : 'maxSanity']));
    onUpdate({ ...character, [stat]: newValue });
  };

  const healthPercentage = (character.health / character.maxHealth) * 100;
  const sanityPercentage = (character.sanity / character.maxSanity) * 100;

  return (
    <div className="bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg p-4 hover:border-[#6b1515] transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#2a0a0a] border border-[#4a0e0e] rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-[#8b1e1e]" />
          </div>
          <div>
            <h3 className="text-[#e8d4b8] mb-1">{character.name}</h3>
            <p className="text-[#8b7355] text-sm">{character.role}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1 bg-[#2a1a1a] border border-[#4a0e0e] rounded text-[#8b7355] hover:bg-[#3a1a1a] transition-colors"
          >
            {isExpanded ? 'Chiudi' : 'Espandi'}
          </button>
          <button
            onClick={() => onDelete(character.id)}
            className="p-2 bg-[#4a0e0e] border border-[#6b1515] rounded text-[#e8d4b8] hover:bg-[#6b1515] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-[#8b1e1e]" />
              <span className="text-[#8b7355] text-sm">Salute</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => updateStat('health', -1)}
                className="w-6 h-6 bg-[#2a0a0a] border border-[#4a0e0e] rounded text-[#8b1e1e] hover:bg-[#4a0e0e] transition-colors"
              >
                -
              </button>
              <span className="text-[#e8d4b8] text-sm min-w-[3rem] text-center">
                {character.health}/{character.maxHealth}
              </span>
              <button
                onClick={() => updateStat('health', 1)}
                className="w-6 h-6 bg-[#2a0a0a] border border-[#4a0e0e] rounded text-[#8b1e1e] hover:bg-[#4a0e0e] transition-colors"
              >
                +
              </button>
            </div>
          </div>
          <div className="h-2 bg-[#2a0a0a] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#8b1e1e] to-[#6b1515] transition-all"
              style={{ width: `${healthPercentage}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-[#4a4a8b]" />
              <span className="text-[#8b7355] text-sm">Sanità Mentale</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => updateStat('sanity', -1)}
                className="w-6 h-6 bg-[#2a0a0a] border border-[#4a0e0e] rounded text-[#4a4a8b] hover:bg-[#4a0e0e] transition-colors"
              >
                -
              </button>
              <span className="text-[#e8d4b8] text-sm min-w-[3rem] text-center">
                {character.sanity}/{character.maxSanity}
              </span>
              <button
                onClick={() => updateStat('sanity', 1)}
                className="w-6 h-6 bg-[#2a0a0a] border border-[#4a0e0e] rounded text-[#4a4a8b] hover:bg-[#4a0e0e] transition-colors"
              >
                +
              </button>
            </div>
          </div>
          <div className="h-2 bg-[#2a0a0a] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#4a4a8b] to-[#2a2a6b] transition-all"
              style={{ width: `${sanityPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-[#4a0e0e]">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-[#8b7355]" />
            <h4 className="text-[#e8d4b8]">Abilità</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {character.skills.map((skill, index) => (
              <div key={index} className="bg-[#2a0a0a] border border-[#4a0e0e] rounded p-2">
                <div className="text-[#8b7355] text-sm mb-1">{skill.name}</div>
                <div className="text-[#e8d4b8]">{skill.value}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
