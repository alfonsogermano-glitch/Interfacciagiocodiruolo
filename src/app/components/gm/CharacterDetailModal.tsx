import { useState } from 'react';
import { X, Shield, Brain } from 'lucide-react';
import { FrischezzaTracker } from '../FrischezzaTracker';
import { FoliaSpiral } from '../FoliaSpiral';
import { ConditionsPanel } from '../ConditionsPanel';
import { TurbePanel } from '../TurbePanel';
import { EquipmentPanel as LegacyEquipmentPanel } from '../EquipmentPanel';
import type { Character } from '../../../types/character';

type FullCharacter = Character & { player: string; notes: string; ownerProfileId: string; campaignId: string | null };

interface CharacterDetailModalProps {
  character: FullCharacter;
  onClose: () => void;
  onUpdate: (updated: FullCharacter) => void;
}

export function CharacterDetailModal({ character, onClose, onUpdate }: CharacterDetailModalProps) {
  const [currentTab, setCurrentTab] = useState<'stats' | 'conditions' | 'equipment'>('stats');

  const char = character;
  const updateCharacter = (patch: Partial<FullCharacter>) => {
    onUpdate({ ...char, ...patch });
  };

  const audaciaValue = typeof char.audacia === 'number' ? char.audacia : 1;
  const prodigiValue = typeof char.prodigi === 'number' ? char.prodigi : 1;

  const updateAudacia = (delta: number) => {
    const next = Math.min(6, Math.max(0, audaciaValue + delta));
    updateCharacter({ audacia: next });
  };

  const updateProdigi = (delta: number) => {
    const next = Math.min(2, Math.max(0, prodigiValue + delta));
    updateCharacter({ prodigi: next });
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--dash-border-soft)] px-6 py-4">
          <h2 className="text-xl font-semibold text-[var(--dash-text-strong)]">{char.name}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="mb-5 flex flex-wrap gap-2 border-b border-[var(--dash-border-soft)] pb-3">
            {[
              { id: 'stats' as const, label: 'Stato' },
              { id: 'conditions' as const, label: 'Condizioni & Follia' },
              { id: 'equipment' as const, label: 'Equipaggiamento' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`rounded-md px-4 py-2 text-sm transition-colors ${
                  currentTab === tab.id
                    ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)] border border-[var(--dash-accent)]'
                    : 'bg-transparent text-[var(--dash-text)] border border-transparent hover:bg-[var(--dash-panel)] hover:text-[var(--dash-text-strong)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {currentTab === 'stats' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                    <FrischezzaTracker
                      current={char.freschezza}
                      max={char.maxFreschezza}
                      crucialBoxes={char.caselleFrischezzaCruciali}
                      onUpdate={(value) => updateCharacter({ freschezza: value })}
                    />
                  </div>

                  <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
                    <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      Relazioni e riferimenti
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                        <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Legame</div>
                        <div className="text-base font-medium text-[var(--dash-text-strong)]">{char.legame || 'Nessuno'}</div>
                        <div className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-[var(--dash-text)]">
                          {char.legameDescription || 'Nessuna descrizione aggiuntiva.'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                        <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tutore</div>
                        <div className="text-base font-medium text-[var(--dash-text-strong)]">{char.tutore || 'Nessuno'}</div>
                        <div className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-[var(--dash-text)]">
                          Figura adulta o riferimento speciale del personaggio.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
                    <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      Risorse del personaggio
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                        <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Prodigi</div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xl font-semibold text-[var(--dash-text-strong)]">
                              {prodigiValue}<span className="ml-2 text-sm font-normal text-[var(--dash-accent-2)]">/ 2</span>
                            </div>
                            <div className="mt-1 text-xs text-[var(--dash-muted)]">Attuale / Massimo</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => updateProdigi(-1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]">−</button>
                            <button type="button" onClick={() => updateProdigi(1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]">+</button>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          {[1, 2].map(slot => (
                            <div key={slot} className={`h-2 flex-1 rounded-full ${slot <= prodigiValue ? 'bg-[var(--dash-accent-2)]' : 'bg-[var(--dash-border-soft)]'}`} />
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                        <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Audacia</div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xl font-semibold text-[var(--dash-text-strong)]">
                              {audaciaValue}<span className="ml-2 text-sm font-normal text-[var(--dash-accent-2)]">/ 6</span>
                            </div>
                            <div className="mt-1 text-xs text-[var(--dash-muted)]">Attuale / Massimo</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => updateAudacia(-1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]">−</button>
                            <button type="button" onClick={() => updateAudacia(1)} className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]">+</button>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-6 gap-2">
                          {[1, 2, 3, 4, 5, 6].map(slot => (
                            <div key={slot} className={`h-2 rounded-full ${slot <= audaciaValue ? 'bg-[var(--dash-accent-2)]' : 'bg-[var(--dash-border-soft)]'}`} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      <Shield className="h-4 w-4" />
                      Tratti
                    </div>
                    {char.tratti.length > 0 ? (
                      <div className="space-y-3">
                        {char.tratti.map((trait, idx) => (
                          <div key={idx} className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                            <div className="font-medium text-[var(--dash-text-strong)]">{trait.name}</div>
                            {trait.description && <div className="mt-1 text-sm text-[var(--dash-text)]">{trait.description}</div>}
                            {trait.benefit && <div className="mt-2 text-xs text-[var(--dash-accent-2)]">{trait.benefit}</div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-[var(--dash-muted)]">Nessun tratto.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentTab === 'conditions' && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <div>
                  <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
                    <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      Condizioni attive
                    </div>
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                      <ConditionsPanel conditions={char.conditions} onUpdate={(conditions) => updateCharacter({ conditions })} />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      <Brain className="h-4 w-4 text-purple-400" />
                      Spirale della Follia
                    </div>
                    <FoliaSpiral current={char.follia} max={char.maxFollia} onUpdate={(value) => updateCharacter({ follia: value })} />
                  </div>
                  <div className="rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                    <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                      Turbe mentali
                    </div>
                    <TurbePanel turbe={char.turbe} onUpdate={(turbe) => updateCharacter({ turbe })} />
                  </div>
                </div>
              </div>
            )}

            {currentTab === 'equipment' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
                  <div className="mb-3 text-sm uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                    Inventario del personaggio
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Totale oggetti</div>
                      <div className="mt-2 text-2xl font-semibold text-[var(--dash-text-strong)]">{char.equipment.length}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tascabili</div>
                      <div className="mt-2 text-2xl font-semibold text-[var(--dash-text-strong)]">{char.equipment.filter(item => item.type === 'tascabile').length}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Trasportabili</div>
                      <div className="mt-2 text-2xl font-semibold text-[var(--dash-text-strong)]">{char.equipment.filter(item => item.type === 'trasportabile' || item.type === 'arma').length}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Risorse</div>
                      <div className="mt-2 text-2xl font-semibold text-[var(--dash-text-strong)]">{char.equipment.filter(item => item.type === 'risorsa').length}</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                    <LegacyEquipmentPanel equipment={char.equipment} onUpdate={(equipment) => updateCharacter({ equipment })} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
