import { useState, type ReactNode } from 'react';
import { User, Brain, Heart, Star, Ghost, Skull, ChevronDown, ChevronRight } from 'lucide-react';
import { FrischezzaTracker } from '../../FrischezzaTracker';
import { FoliaSpiral } from '../../FoliaSpiral';
import { ConditionsPanel } from '../../ConditionsPanel';
import { TurbePanel } from '../../TurbePanel';
import { EquipmentPanel as LegacyEquipmentPanel } from '../../EquipmentPanel';
import { DraggablePortrait } from './DraggablePortrait';
import { EntityTabBar } from './EntityTabBar';
import { EntityDetailRail } from './EntityDetailRail';
import { useEntityTabs, type EntityTabsEntityType } from './useEntityTabs';

const ABILITA_PER_AMBITO: Record<string, string[]> = {
  Fisico: ['Muscoli', 'Sport', 'Acrobatica', 'Resistenza', 'Freddezza'],
  Scuola: ['Cultura', 'Tecnologia', 'Studio', 'Pronto Soccorso', 'Scienze'],
  Carisma: ['Esibirsi', 'Parlantina', 'Fascino', 'Intuito', 'Leadership'],
  Strada: ['Furtività', 'Mira', 'Sopravvivenza', 'Crimine', 'Allerta'],
};

const CHARACTER_BASE_TABS = [
  { id: 'summary', label: 'Riepilogo' },
  { id: 'conditions', label: 'Condizioni & Follia' },
  { id: 'equipment', label: 'Equipaggiamento' },
] as const;

// Per ora PNG e Mostri hanno solo la tab "Riepilogo": altre eventuali tab
// base verranno aggiunte in seguito.
const NPC_MONSTER_BASE_TABS = [
  { id: 'summary', label: 'Riepilogo' },
] as const;

function AbilitaDots({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const dots = [1, 2, 3, 4];
  return (
    <div className="flex gap-1">
      {dots.map((dot) => {
        const filled = dot <= value;
        return (
          <button
            key={dot}
            type="button"
            disabled={disabled}
            onClick={() => onChange(filled && dot === value ? dot - 1 : dot)}
            className={`h-3.5 w-3.5 rounded-full border transition-all ${
              filled ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]' : 'border-[var(--dash-border-soft)] bg-transparent'
            } ${disabled ? '' : 'hover:scale-125'}`}
          />
        );
      })}
    </div>
  );
}

function StarRating({ value, max, onChange, disabled }: { value: number; max: number; onChange: (v: number) => void; disabled: boolean }) {
  const stars = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="flex items-center justify-between">
      <div className="flex gap-1">
        {stars.map((star) => {
          const filled = star <= value;
          return (
            <button
              key={star}
              type="button"
              disabled={disabled}
              onClick={() => onChange(filled ? star - 1 : star)}
              className={disabled ? '' : 'transition-transform hover:scale-110'}
            >
              <Star
                className="h-5 w-5"
                fill={filled ? '#eab308' : 'none'}
                color={filled ? '#eab308' : 'var(--dash-border-soft)'}
                strokeWidth={filled ? 1 : 1.5}
              />
            </button>
          );
        })}
      </div>
      <span className="text-xs text-yellow-500/70">{value} / {max}</span>
    </div>
  );
}

interface EntityDetailViewProps {
  entityType: EntityTabsEntityType;
  entity: any;
  onUpdate: (updated: any) => void;
  canEdit: boolean;
  campaignId: string | null;
  accessToken: string | null | undefined;
  isHSC: boolean;
  draggable: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  headerAction?: ReactNode;
  /** Riga proprietario (avatar + nome), solo per i PG. Nascosta quando il
   *  "proprietario" coincide sempre col viewer (es. MyCharactersPage), dove
   *  sarebbe informazione ridondante. */
  showOwnerRow?: boolean;
  /** false quando il chiamante mostra la rail altrove (es. MyCharactersPage,
   *  che la monta nello slot rightSidebar di AppShell per ancorarla al bordo
   *  schermo) invece che inline qui dentro. Default true per non cambiare
   *  nulla nell'uso esistente in SessionCharactersPanel.tsx. */
  showRail?: boolean;
}

export function EntityDetailView({
  entityType,
  entity,
  onUpdate,
  canEdit,
  campaignId,
  accessToken,
  isHSC,
  draggable,
  onDragStart,
  headerAction,
  showOwnerRow = true,
  showRail = true,
}: EntityDetailViewProps) {
  const [expandedAmbito, setExpandedAmbito] = useState<string | null>(null);
  const [relationsOpen, setRelationsOpen] = useState(false);

  const baseTabs = entityType === 'character' ? CHARACTER_BASE_TABS : NPC_MONSTER_BASE_TABS;

  const tabs = useEntityTabs({
    entityType,
    entityId: entity?.id ?? null,
    campaignId,
    accessToken,
    canEdit,
    baseTabs: baseTabs.map(t => ({ id: t.id, label: t.label })),
    savedTabOrder: entity?.tabOrder,
    onPersistTabOrder: (order) => {
      onUpdate({ ...entity, tabOrder: order });
    },
  });

  const updateAmbito = (ambito: string, delta: number) => {
    const currentValue = (entity.ambiti as any)[ambito] ?? 0;
    const nextValue = Math.max(0, Math.min(2, currentValue + delta));
    onUpdate({ ...entity, ambiti: { ...entity.ambiti, [ambito]: nextValue } });
  };

  const fallbackIcon =
    entityType === 'character' ? (
      <User className="h-12 w-12 text-[var(--dash-accent-2)]" />
    ) : entityType === 'npc' ? (
      <Ghost className="h-6 w-6 text-[var(--dash-accent-2)]" />
    ) : (
      <Skull className="h-6 w-6 text-[var(--dash-accent-2)]" />
    );

  const portraitUrl =
    entityType === 'monster' ? entity.portraitImageUrl : entity.portraitCroppedImageUrl || entity.portraitImageUrl;
  const portraitSize = entityType === 'character' ? 116 : 56;

  return (
    <>
    {tabs.draggedTabId && <div className="fixed inset-0 z-[9999] cursor-grabbing" />}
    <div className="flex overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]">
      <div className="min-w-0 flex-1 p-5">
        <div className={!canEdit ? 'opacity-90' : ''}>
          <div className="mb-4 flex items-start gap-4">
            <DraggablePortrait
              url={portraitUrl}
              fallbackIcon={fallbackIcon}
              size={portraitSize}
              draggable={draggable}
              onDragStart={onDragStart}
              hiddenFromPlayers={entityType !== 'character' ? !entity.visibleToPlayers : undefined}
            />

            {entityType === 'character' ? (
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  type="text"
                  value={entity.name}
                  onChange={(e) => onUpdate({ ...entity, name: e.target.value })}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold text-[var(--dash-text-strong)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
                <p className="px-1 text-sm text-[var(--dash-muted)]">
                  {entity.style} · {entity.viaggio}
                </p>
                <input
                  type="text"
                  value={entity.description ?? ''}
                  onChange={(e) => onUpdate({ ...entity, description: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Breve descrizione del personaggio"
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm text-[var(--dash-text)] outline-none transition-colors hover:border-[var(--dash-border-soft)] focus:border-[var(--dash-accent)] disabled:cursor-not-allowed"
                />
                {showOwnerRow && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-input)]">
                      {entity.ownerAvatarUrl ? (
                        <img src={entity.ownerAvatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center"><User className="h-3.5 w-3.5 text-[var(--dash-accent-2)]" /></div>
                      )}
                    </div>
                    <span className="text-xs text-[var(--dash-muted)]">
                      {entity.ownerDisplayName || 'Giocatore sconosciuto'}
                    </span>
                  </div>
                )}
              </div>
            ) : entityType === 'npc' ? (
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">{entity.name}</h3>
                <p className="text-sm text-[var(--dash-muted)]">{entity.role}</p>
              </div>
            ) : (
              <h3 className="min-w-0 flex-1 text-xl font-semibold text-[var(--dash-text-strong)]">{entity.name}</h3>
            )}

            {headerAction}
          </div>

          {!canEdit && (
            <div className="mb-4 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-muted)]">
              {entityType === 'character'
                ? 'Puoi visualizzare questo personaggio ma non modificarlo.'
                : 'Puoi visualizzare questa scheda ma non modificarla.'}
            </div>
          )}
        </div>

        <EntityTabBar canEdit={canEdit} tabs={tabs} />

        <fieldset disabled={!canEdit} className={!canEdit ? 'opacity-90' : ''}>
          {entityType === 'character' && tabs.currentTab === 'summary' && isHSC && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {(['Fisico', 'Scuola', 'Carisma', 'Strada'] as const).map((ambito) => {
                  const value = (entity.ambiti as any)[ambito];
                  const isExpanded = expandedAmbito === ambito;
                  return (
                    <div
                      key={ambito}
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedAmbito(isExpanded ? null : ambito)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedAmbito(isExpanded ? null : ambito); }}
                      className={`cursor-pointer rounded-lg border-2 px-1.5 py-2 text-center transition-colors ${
                        isExpanded
                          ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)]'
                          : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)]'
                      }`}
                    >
                      <div className="truncate text-[10px] uppercase tracking-[0.05em] text-[var(--dash-accent-2)]">{ambito}</div>
                      <div className="mt-0.5 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          tabIndex={canEdit ? 0 : -1}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateAmbito(ambito, -1);
                          }}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-panel)] ${
                            canEdit ? '' : 'invisible'
                          }`}
                        >
                          −
                        </button>
                        <span className="text-lg font-semibold text-[var(--dash-text-strong)]">{value}</span>
                        <button
                          type="button"
                          tabIndex={canEdit ? 0 : -1}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateAmbito(ambito, 1);
                          }}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-xs text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)] ${
                            canEdit ? '' : 'invisible'
                          }`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {expandedAmbito && (
                <div className="rounded-xl border-2 border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                    Abilità · {expandedAmbito}
                  </div>
                  <div className="space-y-2.5">
                    {ABILITA_PER_AMBITO[expandedAmbito].map((abilita) => {
                      const currentValue = (entity.abilita as any)?.[abilita] ?? 1;
                      return (
                        <div key={abilita} className="flex items-center justify-between">
                          <span className="text-sm text-[var(--dash-text)]">{abilita}</span>
                          <AbilitaDots
                            value={currentValue}
                            disabled={!canEdit}
                            onChange={(v) => onUpdate({
                              ...entity,
                              abilita: { ...entity.abilita, [abilita]: v },
                            })}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-xl border-2 border-red-900/60 bg-red-950/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-red-500/80">
                    <Heart className="h-4 w-4 text-red-500" />
                    Freschezza
                  </div>
                  <span className="text-xs text-red-200/60">{entity.freschezza} / {entity.maxFreschezza}</span>
                </div>
                <FrischezzaTracker
                  current={entity.freschezza}
                  max={entity.maxFreschezza}
                  crucialBoxes={entity.caselleFrischezzaCruciali}
                  onUpdate={(value) => onUpdate({ ...entity, freschezza: value })}
                />
              </div>
              <div className="rounded-xl border-2 border-purple-900/60 bg-purple-950/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-purple-400/80">
                    <Brain className="h-4 w-4 text-purple-400" />
                    Spirale della Follia
                  </div>
                  <span className="text-xs text-purple-200/60">{entity.follia} / {entity.maxFollia}</span>
                </div>
                <FoliaSpiral current={entity.follia} max={entity.maxFollia} onUpdate={(value) => onUpdate({ ...entity, follia: value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border-2 border-yellow-900/60 bg-yellow-950/20 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-yellow-500/80">Audacia</div>
                  <StarRating
                    value={typeof entity.audacia === 'number' ? entity.audacia : 1}
                    max={6}
                    disabled={!canEdit}
                    onChange={(v) => onUpdate({ ...entity, audacia: v })}
                  />
                </div>
                <div className="rounded-xl border-2 border-yellow-900/60 bg-yellow-950/20 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-yellow-500/80">Prodigi</div>
                  <StarRating
                    value={typeof entity.prodigi === 'number' ? entity.prodigi : 1}
                    max={2}
                    disabled={!canEdit}
                    onChange={(v) => onUpdate({ ...entity, prodigi: v })}
                  />
                </div>
              </div>

              <div className="rounded-xl border-2 border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tratti</div>
                {entity.tratti.length > 0 ? (
                  <div className="space-y-2">
                    {entity.tratti.map((trait: any, idx: number) => (
                      <div key={idx} className="rounded-lg border-2 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-2 text-sm">
                        <div className="font-medium text-[var(--dash-text-strong)]">{trait.name}</div>
                        {trait.description && <div className="text-xs text-[var(--dash-text)]">{trait.description}</div>}
                        {trait.benefit && <div className="mt-1 text-xs text-[var(--dash-accent-2)]">{trait.benefit}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--dash-muted)]">Nessun tratto.</div>
                )}
              </div>
            </div>
          )}

          {entityType === 'character' && tabs.currentTab === 'conditions' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Condizioni attive</div>
                <ConditionsPanel conditions={entity.conditions} onUpdate={(conditions) => onUpdate({ ...entity, conditions })} />
              </div>
              <div className="rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Turbe mentali</div>
                <TurbePanel turbe={entity.turbe} onUpdate={(turbe) => onUpdate({ ...entity, turbe })} />
              </div>
            </div>
          )}

          {entityType === 'character' && tabs.currentTab === 'equipment' && (
            <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
              <LegacyEquipmentPanel equipment={entity.equipment} onUpdate={(equipment) => onUpdate({ ...entity, equipment })} />
            </div>
          )}

          {entityType === 'npc' && tabs.currentTab === 'summary' && (
            <div className="space-y-3 text-sm">
              {entity.description && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Descrizione</div>
                  <p className="text-[var(--dash-text)]">{entity.description}</p>
                </div>
              )}
              {entity.personality && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Personalità</div>
                  <p className="text-[var(--dash-text)]">{entity.personality}</p>
                </div>
              )}
              {canEdit && entity.secrets && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Segreti (solo GM)</div>
                  <p className="text-[var(--dash-text)]">{entity.secrets}</p>
                </div>
              )}
              {(entity.attacco || entity.difesa) && (
                <div className="grid grid-cols-2 gap-3">
                  {entity.attacco && (
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Attacco</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{entity.attacco}</div>
                    </div>
                  )}
                  {entity.difesa && (
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Difesa</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{entity.difesa}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {entityType === 'monster' && tabs.currentTab === 'summary' && (
            <div className="space-y-3 text-sm">
              {entity.description && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Descrizione</div>
                  <p className="text-[var(--dash-text)]">{entity.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {entity.attacco && (
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Attacco</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{entity.attacco}</div>
                  </div>
                )}
                {entity.difesa && (
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Difesa</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{entity.difesa}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tabs.customTabs.map(tab =>
            tabs.currentTab === tab.id && (canEdit || !tab.hidden) ? (
              <textarea
                key={tab.id}
                value={tab.content}
                onChange={(e) => tabs.handleCustomTabContentChange(tab.id, e.target.value)}
                disabled={!canEdit}
                placeholder="Scrivi qui..."
                className="h-64 w-full resize-none rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-70"
              />
            ) : null
          )}
        </fieldset>

        {entityType === 'character' && (
          <div className="mt-5 border-t border-[var(--dash-border-soft)] pt-4">
            <button
              type="button"
              onClick={() => setRelationsOpen(o => !o)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-[var(--dash-accent-2)]"
            >
              Relazioni e riferimenti
              {relationsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {relationsOpen && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Legame</div>
                  <div className="text-base font-medium text-[var(--dash-text-strong)]">{entity.legame || 'Nessuno'}</div>
                  <div className="mt-2 text-xs leading-relaxed text-[var(--dash-text)]">
                    {entity.legameDescription || 'Nessuna descrizione aggiuntiva.'}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tutore</div>
                  <div className="text-base font-medium text-[var(--dash-text-strong)]">{entity.tutore || 'Nessuno'}</div>
                  <div className="mt-2 text-xs leading-relaxed text-[var(--dash-text)]">
                    Figura adulta o riferimento speciale del personaggio.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showRail && <EntityDetailRail />}
    </div>
    </>
  );
}
