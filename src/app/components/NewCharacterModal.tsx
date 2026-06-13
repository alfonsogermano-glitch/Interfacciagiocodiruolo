import { X } from 'lucide-react';
import { useState } from 'react';

interface NewCharacterModalProps {
  onClose: () => void;
  onAdd: (character: {
    name: string;
    role: string;
    health: number;
    maxHealth: number;
    sanity: number;
    maxSanity: number;
    skills: { name: string; value: number }[];
  }) => void;
}

export function NewCharacterModal({ onClose, onAdd }: NewCharacterModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Studente');
  const [maxHealth, setMaxHealth] = useState(10);
  const [maxSanity, setMaxSanity] = useState(75);

  const defaultSkills = [
    { name: 'Atletica', value: 30 },
    { name: 'Investigare', value: 40 },
    { name: 'Occulto', value: 20 },
    { name: 'Persuasione', value: 35 }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onAdd({
      name: name.trim(),
      role,
      health: maxHealth,
      maxHealth,
      sanity: maxSanity,
      maxSanity,
      skills: defaultSkills
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[#e8d4b8]">Nuovo Personaggio</h2>
          <button
            onClick={onClose}
            className="text-[#8b7355] hover:text-[#e8d4b8] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[#8b7355] text-sm block mb-2">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Takeshi Yamada"
              className="w-full bg-[#2a0a0a] border border-[#4a0e0e] rounded px-3 py-2 text-[#e8d4b8] placeholder-[#6b5544] focus:outline-none focus:border-[#6b1515]"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[#8b7355] text-sm block mb-2">Ruolo</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-[#2a0a0a] border border-[#4a0e0e] rounded px-3 py-2 text-[#e8d4b8] focus:outline-none focus:border-[#6b1515]"
            >
              <option value="Studente">Studente</option>
              <option value="Atleta">Atleta</option>
              <option value="Secchione">Secchione</option>
              <option value="Artista">Artista</option>
              <option value="Ribelle">Ribelle</option>
              <option value="Leader">Leader</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[#8b7355] text-sm block mb-2">Salute Max</label>
              <input
                type="number"
                value={maxHealth}
                onChange={(e) => setMaxHealth(parseInt(e.target.value) || 10)}
                min="1"
                max="20"
                className="w-full bg-[#2a0a0a] border border-[#4a0e0e] rounded px-3 py-2 text-[#e8d4b8] focus:outline-none focus:border-[#6b1515]"
              />
            </div>

            <div>
              <label className="text-[#8b7355] text-sm block mb-2">Sanità Max</label>
              <input
                type="number"
                value={maxSanity}
                onChange={(e) => setMaxSanity(parseInt(e.target.value) || 75)}
                min="1"
                max="100"
                className="w-full bg-[#2a0a0a] border border-[#4a0e0e] rounded px-3 py-2 text-[#e8d4b8] focus:outline-none focus:border-[#6b1515]"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[#2a1a1a] border border-[#4a0e0e] rounded px-4 py-2 text-[#8b7355] hover:bg-[#3a1a1a] transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#4a0e0e] border border-[#6b1515] rounded px-4 py-2 text-[#e8d4b8] hover:bg-[#6b1515] transition-colors"
            >
              Crea Personaggio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
