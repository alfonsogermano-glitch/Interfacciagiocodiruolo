import { useEffect, useRef, useState, useCallback } from 'react';
import { User, Brain, ChevronDown, ChevronRight, Loader2, Skull, Ghost } from 'lucide-react';
import { projectId } from '/utils/supabase/info';
import { FrischezzaTracker } from '../FrischezzaTracker';
import { FoliaSpiral } from '../FoliaSpiral';
import { ConditionsPanel } from '../ConditionsPanel';
import { TurbePanel } from '../TurbePanel';
import { EquipmentPanel as LegacyEquipmentPanel } from '../EquipmentPanel';
import type { Character } from '../../../types/character';
import { loadCharacters, loadCharactersViaServer, saveCharacter as saveCharacterToSupabase, saveCharacterAsGm, mapRowToCharacter } from '../../../services/supabase/charactersService';
import { loadNPCs, loadMonsters } from '../../../services/supabase/entitiesService';
import { useAuth, supabase } from '../../auth/AuthContext';
import { useCampaign } from '../../campaigns/CampaignContext';
import { useRuleset } from '../../campaigns/RulesetContext';

interface PlayerCharacter extends Character {
  player: string;
  notes: string;
}

type EntityKind = 'pg' | 'png' | 'mostro';
interface ListEntry {
  kind: EntityKind;
  id: string;
  name: string;
  subtitle: string;
  portraitUrl?: string;
  ownerProfileId?: string | null;
}

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

function SectionHeader({ title, count, isOpen, onToggle }: { title: string; count: number; isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-4 py-2 text-left"
    >
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
        {title} <span className="text-[var(--dash-muted)]">({count})</span>
      </span>
      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-[var(--dash-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--dash-muted)]" />}
    </button>
  );
}

function DraggablePortrait({
  url,
  fallbackIcon,
  size = 56,
  draggable,
  onDragStart,
}: {
  url?: string;
  fallbackIcon: React.ReactNode;
  size?: number;
  draggable: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`group relative shrink-0 overflow-hidden rounded-md border-2 border-[var(--dash-accent)] bg-[var(--dash-input)] ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">{fallbackIcon}</div>
      )}
      {draggable && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
        >
          <div className="h-full w-full overflow-hidden rounded-full border-2 border-[var(--dash-accent)]" style={{ width: size, height: size }}>
            {url ? (
              <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--dash-input)]">{fallbackIcon}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionCharactersPanel() {
  const { user, session } = useAuth();
  const { activeCampaignId, activeCampaign } = useCampaign();
  const { isHSC } = useRuleset();

  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [npcs, setNpcs] = useState<any[]>([]);
  const [monsters, setMonsters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<{ kind: EntityKind; id: string } | null>(null);
  const [currentTab, setCurrentTab] = useState<'stats' | 'conditions' | 'equipment'>('stats');
  const [openSections, setOpenSections] = useState({ pg: true, png: true, mostro: true });

  const loadSeqRef = useRef(0);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isOwner = activeCampaign?.ownerId === user?.id;

  const loadData = useCallback(async () => {
    const mySeq = ++loadSeqRef.current;
    try {
      const [loadedChars, loadedNpcs, loadedMonsters] = await Promise.all([
        session?.access_token
          ? loadCharactersViaServer(activeCampaignId, SERVER_BASE, session.access_token)
          : loadCharacters(activeCampaignId),
        loadNPCs(activeCampaignId),
        loadMonsters(activeCampaignId),
      ]);
      if (loadSeqRef.current !== mySeq) return;
      const sortByName = <T extends { name: string }>(arr: T[]) =>
        [...arr].sort((a, b) => a.name.localeCompare(b.name, 'it'));
      setCharacters(sortByName(loadedChars));
      setNpcs(sortByName(loadedNpcs));
      setMonsters(sortByName(loadedMonsters));
      if (!selected && loadedChars[0]) {
        setSelected({ kind: 'pg', id: loadedChars[0].id });
      }
    } catch (error) {
      console.error('Errore caricamento scheda unificata:', error);
    } finally {
      if (loadSeqRef.current === mySeq) setIsLoading(false);
    }
  }, [activeCampaignId, session?.access_token]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!activeCampaignId) return;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;

    const handleBroadcast = (msg: any) => {
      const data = msg?.payload ?? {};
      if (data.operation === 'DELETE') {
        const deletedId = data.old_record?.id;
        if (!deletedId) return;
        setCharacters(prev => prev.filter(c => c.id !== deletedId));
        return;
      }
      const row = data.record;
      if (!row) return;
      const mapped = mapRowToCharacter(row) as PlayerCharacter;
      setCharacters(prev => {
        const exists = prev.some(c => c.id === mapped.id);
        return exists
          ? prev.map(c => (c.id === mapped.id ? { ...mapped, ownerDisplayName: (c as any).ownerDisplayName } : c))
          : [...prev, mapped];
      });
    };

    (async () => {
      await supabase.realtime.setAuth();
      const ch = supabase
        .channel(`campaign:${activeCampaignId}`, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, handleBroadcast)
        .on('broadcast', { event: 'UPDATE' }, handleBroadcast)
        .on('broadcast', { event: 'DELETE' }, handleBroadcast)
        .subscribe();
      currentChannel = ch;
    })();

    return () => {
      if (currentChannel) { try { supabase.removeChannel(currentChannel); } catch {} }
    };
  }, [activeCampaignId]);

  const persistCharacter = useCallback((id: string, updatedChar: PlayerCharacter) => {
    if (saveTimersRef.current[id]) clearTimeout(saveTimersRef.current[id]);
    saveTimersRef.current[id] = setTimeout(async () => {
      const isMine = (updatedChar as any).ownerProfileId === user?.id;
      try {
        if (isMine || !(updatedChar as any).ownerProfileId) {
          await saveCharacterToSupabase(activeCampaignId, updatedChar, user?.id ?? '');
        } else {
          await saveCharacterAsGm(activeCampaignId, id, updatedChar, SERVER_BASE, session?.access_token ?? '');
        }
      } catch (error) {
        console.error('Errore salvataggio personaggio (sessione):', error);
      }
    }, 150);
  }, [activeCampaignId, session?.access_token, user?.id]);

  const updateCharacter = (id: string, updatedChar: PlayerCharacter) => {
    setCharacters(prev => prev.map(c => (c.id === id ? updatedChar : c)));
    persistCharacter(id, updatedChar);
  };

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedChar = selected?.kind === 'pg' ? characters.find(c => c.id === selected.id) ?? null : null;
  const selectedNpc = selected?.kind === 'png' ? npcs.find(n => n.id === selected.id) ?? null : null;
  const selectedMonster = selected?.kind === 'mostro' ? monsters.find(m => m.id === selected.id) ?? null : null;
  const isMine = selectedChar ? (selectedChar as any).ownerProfileId === user?.id : false;
  const canEdit = isMine || isOwner;

  const canDragEntity = (kind: EntityKind, ownerProfileId?: string | null) => {
    if (isOwner) return true; // il GM può trascinare tutto: PG, PNG, Mostri
    if (kind === 'pg' && ownerProfileId === user?.id) return true; // il giocatore solo il proprio PG
    return false;
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--dash-muted)]" /></div>;
  }

  const renderListItem = (entry: ListEntry) => (
    <button
      key={`${entry.kind}-${entry.id}`}
      type="button"
      onClick={() => { setSelected({ kind: entry.kind, id: entry.id }); setCurrentTab('stats'); }}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
        selected?.kind === entry.kind && selected.id === entry.id ? 'bg-[var(--dash-surface-2)]' : 'hover:bg-[var(--dash-surface-2)]/50'
      }`}
    >
      <div
        draggable={canDragEntity(entry.kind, entry.ownerProfileId)}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-hollowgate-entity', JSON.stringify({ kind: entry.kind, id: entry.id }));
        }}
        className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--dash-input)] ${
          canDragEntity(entry.kind, entry.ownerProfileId) ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        {entry.portraitUrl ? (
          <img src={entry.portraitUrl} alt={entry.name} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {entry.kind === 'png' ? <Ghost className="h-4 w-4 text-[var(--dash-accent-2)]" /> : entry.kind === 'mostro' ? <Skull className="h-4 w-4 text-[var(--dash-accent-2)]" /> : <User className="h-4 w-4 text-[var(--dash-accent-2)]" />}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[var(--dash-text-strong)]">{entry.name}</div>
        <div className="truncate text-xs text-[var(--dash-muted)]">{entry.subtitle}</div>
      </div>
    </button>
  );

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--dash-border-soft)] py-3">
        <SectionHeader title="Personaggi" count={characters.length} isOpen={openSections.pg} onToggle={() => toggleSection('pg')} />
        {openSections.pg && (
          <div className="space-y-1 px-2 pb-2">
            {characters.map(c => renderListItem({
              kind: 'pg', id: c.id, name: c.name, subtitle: (c as any).ownerDisplayName || c.player || c.style,
              portraitUrl: c.portraitCroppedImageUrl || c.portraitImageUrl,
              ownerProfileId: (c as any).ownerProfileId,
            }))}
            {characters.length === 0 && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun personaggio.</div>}
          </div>
        )}

        <SectionHeader title="PNG" count={npcs.length} isOpen={openSections.png} onToggle={() => toggleSection('png')} />
        {openSections.png && (
          <div className="space-y-1 px-2 pb-2">
            {npcs.map(n => renderListItem({
              kind: 'png', id: n.id, name: n.name, subtitle: n.role || 'PNG',
              portraitUrl: n.portraitCroppedImageUrl || n.portraitImageUrl,
            }))}
            {npcs.length === 0 && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun PNG.</div>}
          </div>
        )}

        <SectionHeader title="Mostri" count={monsters.length} isOpen={openSections.mostro} onToggle={() => toggleSection('mostro')} />
        {openSections.mostro && (
          <div className="space-y-1 px-2 pb-2">
            {monsters.map(m => renderListItem({
              kind: 'mostro', id: m.id, name: m.name, subtitle: 'Mostro',
              portraitUrl: m.portraitImageUrl,
            }))}
            {monsters.length === 0 && <div className="px-3 py-2 text-xs text-[var(--dash-muted)]">Nessun mostro.</div>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--dash-muted)]">Seleziona una scheda dalla lista</div>
        ) : selectedChar ? (
          <fieldset disabled={!canEdit} className={!canEdit ? 'opacity-90' : ''}>
            <div className="mb-4 flex items-center gap-3">
              <DraggablePortrait
                url={selectedChar.portraitCroppedImageUrl || selectedChar.portraitImageUrl}
                fallbackIcon={<User className="h-6 w-6 text-[var(--dash-accent-2)]" />}
                size={56}
                draggable={canDragEntity('pg', (selectedChar as any).ownerProfileId)}
                onDragStart={(e) => e.dataTransfer.setData('application/x-hollowgate-entity', JSON.stringify({ kind: 'pg', id: selectedChar.id }))}
              />
              <div>
                <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">{selectedChar.name}</h3>
                <p className="text-sm text-[var(--dash-muted)]">{selectedChar.style} · {selectedChar.viaggio}</p>
              </div>
            </div>

            {!canEdit && (
              <div className="mb-4 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-xs text-[var(--dash-muted)]">
                Puoi visualizzare questo personaggio ma non modificarlo.
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-2 border-b border-[var(--dash-border-soft)] pb-3">
              {[
                { id: 'stats' as const, label: 'Stato' },
                { id: 'conditions' as const, label: 'Condizioni & Follia' },
                { id: 'equipment' as const, label: 'Equipaggiamento' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setCurrentTab(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    currentTab === tab.id
                      ? 'border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                      : 'border border-transparent bg-transparent text-[var(--dash-text)] hover:bg-[var(--dash-panel)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {currentTab === 'stats' && isHSC && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <FrischezzaTracker
                    current={selectedChar.freschezza}
                    max={selectedChar.maxFreschezza}
                    crucialBoxes={selectedChar.caselleFrischezzaCruciali}
                    onUpdate={(value) => updateCharacter(selectedChar.id, { ...selectedChar, freschezza: value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(selectedChar.ambiti).map(([ambito, value]) => (
                    <div key={ambito} className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">{ambito}</div>
                      <div className="mt-1 text-xl font-semibold text-[var(--dash-text-strong)]">{value as any}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Tratti</div>
                  {selectedChar.tratti.length > 0 ? (
                    <div className="space-y-2">
                      {selectedChar.tratti.map((trait, idx) => (
                        <div key={idx} className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-2 text-sm">
                          <div className="font-medium text-[var(--dash-text-strong)]">{trait.name}</div>
                          {trait.description && <div className="text-xs text-[var(--dash-text)]">{trait.description}</div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--dash-muted)]">Nessun tratto.</div>
                  )}
                </div>
              </div>
            )}

            {currentTab === 'conditions' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Condizioni attive</div>
                  <ConditionsPanel conditions={selectedChar.conditions} onUpdate={(conditions) => updateCharacter(selectedChar.id, { ...selectedChar, conditions })} />
                </div>
                <div className="rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">
                    <Brain className="h-3.5 w-3.5 text-purple-400" /> Spirale della Follia
                  </div>
                  <FoliaSpiral current={selectedChar.follia} max={selectedChar.maxFollia} onUpdate={(value) => updateCharacter(selectedChar.id, { ...selectedChar, follia: value })} />
                </div>
                <div className="rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Turbe mentali</div>
                  <TurbePanel turbe={selectedChar.turbe} onUpdate={(turbe) => updateCharacter(selectedChar.id, { ...selectedChar, turbe })} />
                </div>
              </div>
            )}

            {currentTab === 'equipment' && (
              <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <LegacyEquipmentPanel equipment={selectedChar.equipment} onUpdate={(equipment) => updateCharacter(selectedChar.id, { ...selectedChar, equipment })} />
              </div>
            )}
          </fieldset>
        ) : selectedNpc ? (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <DraggablePortrait
                url={selectedNpc.portraitCroppedImageUrl || selectedNpc.portraitImageUrl}
                fallbackIcon={<Ghost className="h-6 w-6 text-[var(--dash-accent-2)]" />}
                size={56}
                draggable={canDragEntity('png')}
                onDragStart={(e) => e.dataTransfer.setData('application/x-hollowgate-entity', JSON.stringify({ kind: 'png', id: selectedNpc.id }))}
              />
              <div>
                <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">{selectedNpc.name}</h3>
                <p className="text-sm text-[var(--dash-muted)]">{selectedNpc.role}</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {selectedNpc.description && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Descrizione</div>
                  <p className="text-[var(--dash-text)]">{selectedNpc.description}</p>
                </div>
              )}
              {selectedNpc.personality && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Personalità</div>
                  <p className="text-[var(--dash-text)]">{selectedNpc.personality}</p>
                </div>
              )}
              {isOwner && selectedNpc.secrets && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Segreti (solo GM)</div>
                  <p className="text-[var(--dash-text)]">{selectedNpc.secrets}</p>
                </div>
              )}
              {(selectedNpc.attacco || selectedNpc.difesa) && (
                <div className="grid grid-cols-2 gap-3">
                  {selectedNpc.attacco && (
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Attacco</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{selectedNpc.attacco}</div>
                    </div>
                  )}
                  {selectedNpc.difesa && (
                    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Difesa</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{selectedNpc.difesa}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : selectedMonster ? (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <DraggablePortrait
                url={selectedMonster.portraitImageUrl}
                fallbackIcon={<Skull className="h-6 w-6 text-[var(--dash-accent-2)]" />}
                size={56}
                draggable={canDragEntity('mostro')}
                onDragStart={(e) => e.dataTransfer.setData('application/x-hollowgate-entity', JSON.stringify({ kind: 'mostro', id: selectedMonster.id }))}
              />
              <h3 className="text-xl font-semibold text-[var(--dash-text-strong)]">{selectedMonster.name}</h3>
            </div>
            <div className="space-y-3 text-sm">
              {selectedMonster.description && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Descrizione</div>
                  <p className="text-[var(--dash-text)]">{selectedMonster.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {selectedMonster.attacco && (
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Attacco</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{selectedMonster.attacco}</div>
                  </div>
                )}
                {selectedMonster.difesa && (
                  <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.08em] text-[var(--dash-accent-2)]">Difesa</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--dash-text-strong)]">{selectedMonster.difesa}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
