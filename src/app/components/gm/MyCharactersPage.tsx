import { useState, useEffect } from 'react';
import { Plus, User, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { CharacterCreationWizard } from './CharacterCreationWizard';
import { loadCharactersByOwner, saveCharacter, deleteCharacter, updateCharacterCampaign } from '../../../services/supabase/charactersService';
import type { Character } from '../../../types/character';

type OwnedCharacter = Character & { player: string; notes: string; ownerProfileId: string; campaignId: string | null };

export function MyCharactersPage() {
  const { user } = useAuth();
  const { campaigns, joinedCampaigns } = useCampaign();

  const [characters, setCharacters] = useState<OwnedCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<OwnedCharacter | null>(null);

  const allCampaignOptions = [
    ...campaigns.map(c => ({ id: c.id, name: c.name, suffix: '(tua campagna)' })),
    ...joinedCampaigns.map(c => ({ id: c.id, name: c.name, suffix: '(partecipi)' })),
  ];

  const load = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    const data = await loadCharactersByOwner(user.id);
    setCharacters(data);
    setIsLoading(false);
  };

  useEffect(() => { void load(); }, [user?.id]);

  const handleAdd = async (character: Character & { player: string; notes: string }) => {
    if (!user?.id) return;
    await saveCharacter(editingCharacter?.campaignId ?? null, character, user.id);
    setShowWizard(false);
    setEditingCharacter(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Eliminare questo personaggio? L\'azione non è reversibile.')) return;
    await deleteCharacter(id);
    await load();
  };

  const handleAssignCampaign = async (characterId: string, campaignId: string) => {
    await updateCharacterCampaign(characterId, campaignId || null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-wide text-[var(--dash-text-strong)]">I miei personaggi</h2>
        <button type="button" onClick={() => { setEditingCharacter(null); setShowWizard(true); }}
          className="flex items-center gap-2 rounded-xl border border-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-accent)] hover:bg-[var(--dash-surface-2)]">
          <Plus className="h-4 w-4" /> Crea nuovo personaggio
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>
      ) : characters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/60 px-6 py-12 text-center">
          <p className="text-sm text-[var(--dash-muted)]">Non hai ancora creato nessun personaggio.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {characters.map(char => {
            const assignedCampaign = allCampaignOptions.find(c => c.id === char.campaignId);
            return (
              <div key={char.id} className="flex h-[120px] overflow-hidden rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-xl">
                <div className="relative h-full w-[120px] shrink-0 overflow-hidden bg-black/30">
                  {char.portraitCroppedImageUrl || char.portraitImageUrl ? (
                    <img src={char.portraitCroppedImageUrl || char.portraitImageUrl} alt={char.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center"><User className="h-8 w-8 text-[var(--dash-accent-2)]" /></div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-3">
                  <div>
                    <h3 className="truncate text-lg font-semibold text-[var(--dash-text-strong)]">{char.name}</h3>
                    <p className="text-sm text-[var(--dash-muted)]">{char.style} · {char.viaggio}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={char.campaignId ?? ''}
                      onChange={e => handleAssignCampaign(char.id, e.target.value)}
                      className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 py-1 text-xs text-[var(--dash-text)]"
                    >
                      <option value="">— Nessuna campagna —</option>
                      {allCampaignOptions.map(c => (
                        <option key={c.id} value={c.id}>{c.name} {c.suffix}</option>
                      ))}
                    </select>
                    {!assignedCampaign && char.campaignId && (
                      <span className="text-xs text-[var(--dash-muted)]">(campagna non più disponibile)</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-2 px-3">
                  <button type="button" onClick={() => { setEditingCharacter(char); setShowWizard(true); }}
                    className="rounded-lg p-2 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => handleDelete(char.id)}
                    className="rounded-lg p-2 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-danger-text)]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showWizard && (
        <CharacterCreationWizard
          onClose={() => { setShowWizard(false); setEditingCharacter(null); }}
          onAdd={handleAdd}
          existingCharacters={characters.filter(c => c.id !== editingCharacter?.id).map(c => ({ id: c.id, name: c.name }))}
          initialCharacter={editingCharacter}
        />
      )}
    </div>
  );
}
