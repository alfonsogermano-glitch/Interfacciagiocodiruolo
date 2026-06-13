import { useEffect, useState } from 'react';
import { Swords, Heart, Shield } from 'lucide-react';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { generateUUID } from '../../../lib/uuid';

interface Combatant {
  id: string;
  name: string;
  type: 'player' | 'monster';
  hp: number;
  maxHp: number;
  armor: number;
  initiative: number;
  conditions: string[];
  notes: string;
}

interface CombatState {
  combatants: Combatant[];
  round: number;
  currentTurn: number;
  inCombat: boolean;
}

type ActiveEncounter = {
  id: string;
  campaignId: string;
  environmentId: string;
  environmentName: string;
  npcIds: string[];
  monsterIds: string[];
  clueIds: string[];
  situationIds: string[];
  startedAt: string;
};

type MonsterSummary = {
  id: string;
  name: string;
  freschezza?: number | null;
  maxFreschezza?: number | null;
  notes?: string;
};

const COMBAT_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.combat;
const MONSTERS_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.monsters;
const ACTIVE_ENCOUNTER_STORAGE_KEY = 'hsc_active_encounter';

const DEFAULT_COMBAT_STATE: CombatState = {
  combatants: [],
  round: 1,
  currentTurn: 0,
  inCombat: false
};

export function CombatTracker() {
  const [combatState, setCombatState] = useState<CombatState>(() => {
    if (typeof window === 'undefined') return DEFAULT_COMBAT_STATE;

    try {
      const savedCombat = window.localStorage.getItem(COMBAT_STORAGE_KEY);
      if (!savedCombat) return DEFAULT_COMBAT_STATE;

      const parsedCombat = JSON.parse(savedCombat);
      if (!parsedCombat || typeof parsedCombat !== 'object') {
        return DEFAULT_COMBAT_STATE;
      }

      const combatants = Array.isArray(parsedCombat.combatants)
        ? parsedCombat.combatants.filter(
            (c: Partial<Combatant>) =>
              c &&
              typeof c.id === 'string' &&
              typeof c.name === 'string' &&
              (c.type === 'player' || c.type === 'monster')
          )
        : [];

      return {
        combatants: combatants.slice(0, 50) as Combatant[],
        round: typeof parsedCombat.round === 'number' ? parsedCombat.round : 1,
        currentTurn:
          typeof parsedCombat.currentTurn === 'number'
            ? parsedCombat.currentTurn
            : 0,
        inCombat:
          typeof parsedCombat.inCombat === 'boolean'
            ? parsedCombat.inCombat
            : false
      };
    } catch {
      return DEFAULT_COMBAT_STATE;
    }
  });

  const [activeEncounter] = useState<ActiveEncounter | null>(() => {
    if (typeof window === 'undefined') return null;

    try {
      const saved = window.localStorage.getItem(ACTIVE_ENCOUNTER_STORAGE_KEY);
      if (!saved) return null;

      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!Array.isArray(parsed.monsterIds)) return null;
      if (!Array.isArray(parsed.npcIds)) return null;

      return parsed as ActiveEncounter;
    } catch {
      return null;
    }
  });

  const { combatants, round, currentTurn, inCombat } = combatState;

  useEffect(() => {
    try {
      window.localStorage.setItem(COMBAT_STORAGE_KEY, JSON.stringify(combatState));
    } catch (error) {
      console.error('Errore nel salvataggio del combattimento:', error);
    }
  }, [combatState]);

  const readMonsters = (): MonsterSummary[] => {
    if (typeof window === 'undefined') return [];

    try {
      const saved = window.localStorage.getItem(MONSTERS_STORAGE_KEY);
      if (!saved) return [];

      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const importEncounterMonsters = () => {
    if (!activeEncounter) return;

    const monsters = readMonsters().filter(monster =>
      activeEncounter.monsterIds.includes(monster.id)
    );

    const encounterCombatants: Combatant[] = monsters.map(monster => {
      const rawMaxHp = monster.maxFreschezza ?? monster.freschezza ?? 10;
      const maxHp = Math.max(1, Number(rawMaxHp) || 10);

      return {
        id: `encounter_monster_${monster.id}`,
        name: monster.name || 'Mostro senza nome',
        type: 'monster',
        hp: maxHp,
        maxHp,
        armor: 0,
        initiative: Math.floor(Math.random() * 20) + 1,
        conditions: [],
        notes: monster.notes ?? ''
      };
    });

    setCombatState(prev => {
      const existingIds = new Set(prev.combatants.map(c => c.id));

      const newCombatants = encounterCombatants.filter(
        combatant => !existingIds.has(combatant.id)
      );

      if (newCombatants.length === 0) return prev;

      return {
        ...prev,
        combatants: [...prev.combatants, ...newCombatants]
      };
    });
  };

  const startCombat = () => {
    if (combatants.length === 0) return;

    const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);

    setCombatState(prev => ({
      ...prev,
      combatants: sorted,
      inCombat: true,
      currentTurn: 0,
      round: 1
    }));
  };

  const endCombat = () => {
    setCombatState(prev => ({
      ...prev,
      inCombat: false,
      currentTurn: 0,
      round: 1
    }));
  };

  const nextTurn = () => {
    setCombatState(prev => {
      if (prev.currentTurn >= prev.combatants.length - 1) {
        return {
          ...prev,
          currentTurn: 0,
          round: prev.round + 1
        };
      }

      return {
        ...prev,
        currentTurn: prev.currentTurn + 1
      };
    });
  };

  const addCombatant = (type: 'player' | 'monster') => {
    const newCombatant: Combatant = {
      id: generateUUID(),
      name: type === 'player' ? 'Nuovo PG' : 'Nuovo Mostro',
      type,
      hp: 10,
      maxHp: 10,
      armor: 0,
      initiative: Math.floor(Math.random() * 20) + 1,
      conditions: [],
      notes: ''
    };

    setCombatState(prev => ({
      ...prev,
      combatants: [...prev.combatants, newCombatant]
    }));
  };

  const updateHP = (id: string, delta: number) => {
    setCombatState(prev => ({
      ...prev,
      combatants: prev.combatants.map(c =>
        c.id === id
          ? { ...c, hp: Math.max(0, Math.min(c.maxHp, c.hp + delta)) }
          : c
      )
    }));
  };

  const removeCombatant = (id: string) => {
    setCombatState(prev => {
      const nextCombatants = prev.combatants.filter(c => c.id !== id);

      return {
        ...prev,
        combatants: nextCombatants,
        currentTurn: Math.min(prev.currentTurn, Math.max(0, nextCombatants.length - 1))
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-surface-2)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[var(--dash-text)]">Tracker Combattimento</h2>

            {inCombat && (
              <p className="text-[var(--dash-muted)]">
                Round {round} - Turno di:{' '}
                <span className="text-[var(--dash-text)]">
                  {combatants[currentTurn]?.name}
                </span>
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {!inCombat ? (
              <>
                <button
                  onClick={() => addCombatant('player')}
                  className="rounded border border-[var(--dash-border)] bg-[var(--dash-border)] px-4 py-2 text-[var(--dash-text)] hover:bg-[var(--dash-border)]"
                >
                  + PG
                </button>

                <button
                  onClick={() => addCombatant('monster')}
                  className="rounded border border-[var(--dash-border)] bg-[var(--dash-border)] px-4 py-2 text-[var(--dash-text)] hover:bg-[var(--dash-border)]"
                >
                  + Mostro
                </button>

                <button
                  onClick={startCombat}
                  className="rounded border border-[var(--dash-accent)] bg-[var(--dash-border)] px-6 py-2 text-[var(--dash-text)] hover:bg-[var(--dash-accent)]"
                >
                  Inizia Combattimento
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={nextTurn}
                  className="rounded border border-[var(--dash-accent)] bg-[var(--dash-border)] px-6 py-2 text-[var(--dash-text)] hover:bg-[var(--dash-accent)]"
                >
                  Prossimo Turno
                </button>

                <button
                  onClick={endCombat}
                  className="rounded border border-[var(--dash-border)] bg-[var(--dash-border)] px-4 py-2 text-[var(--dash-text)] hover:bg-[var(--dash-danger-bg)]"
                >
                  Termina Combattimento
                </button>
              </>
            )}
          </div>
        </div>

        {activeEncounter && (
          <div className="mb-4 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--dash-accent-2)]">
                  Encounter attivo
                </div>

                <h3 className="mt-1 text-[var(--dash-text-strong)]">
                  {activeEncounter.environmentName}
                </h3>

                <p className="mt-1 text-xs text-[var(--dash-muted)]">
                  Mostri: {activeEncounter.monsterIds.length} · PNG:{' '}
                  {activeEncounter.npcIds.length}
                </p>
              </div>

              <button
                type="button"
                onClick={importEncounterMonsters}
                disabled={activeEncounter.monsterIds.length === 0}
                className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:opacity-40"
              >
                Importa mostri encounter
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 rounded-lg bg-[var(--dash-input)] p-4 md:grid-cols-4">
          <div>
            <p className="mb-1 text-sm text-[var(--dash-muted)]">Round</p>
            <p className="text-[var(--dash-text)]">{round}</p>
          </div>

          <div>
            <p className="mb-1 text-sm text-[var(--dash-muted)]">Combattenti</p>
            <p className="text-[var(--dash-text)]">{combatants.length}</p>
          </div>

          <div>
            <p className="mb-1 text-sm text-[var(--dash-muted)]">PG</p>
            <p className="text-[var(--dash-text)]">
              {combatants.filter(c => c.type === 'player').length}
            </p>
          </div>

          <div>
            <p className="mb-1 text-sm text-[var(--dash-muted)]">Mostri</p>
            <p className="text-[var(--dash-text)]">
              {combatants.filter(c => c.type === 'monster').length}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {combatants.length === 0 ? (
          <div className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-surface-2)] p-12 text-center">
            <Swords className="mx-auto mb-4 h-16 w-16 text-[var(--dash-border)]" />
            <p className="text-[var(--dash-muted)]">Aggiungi combattenti per iniziare</p>
          </div>
        ) : (
          combatants.map((combatant, idx) => (
            <div
              key={combatant.id}
              className={`rounded-lg border-2 p-4 transition-all ${
                inCombat && idx === currentTurn
                  ? 'border-[var(--dash-border)] bg-[var(--dash-input)]'
                  : 'border-[var(--dash-border)] bg-[var(--dash-surface-2)]'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--dash-border)]">
                  <div className="text-center">
                    <p className="text-xs text-[var(--dash-muted)]">INIT</p>
                    <p className="text-[var(--dash-text)]">{combatant.initiative}</p>
                  </div>
                </div>

                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    {combatant.type === 'player' ? (
                      <span className="rounded bg-[var(--dash-panel)] px-2 py-1 text-xs text-[var(--dash-text)]">
                        PG
                      </span>
                    ) : (
                      <span className="rounded bg-[var(--dash-danger-bg)] px-2 py-1 text-xs text-[var(--dash-danger-text)]">
                        MOSTRO
                      </span>
                    )}

                    <input
                      type="text"
                      value={combatant.name}
                      onChange={e =>
                        setCombatState(prev => ({
                          ...prev,
                          combatants: prev.combatants.map(c =>
                            c.id === combatant.id
                              ? { ...c, name: e.target.value }
                              : c
                          )
                        }))
                      }
                      className="bg-transparent text-[var(--dash-text)] outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-[var(--dash-danger-text)]" />

                      <button
                        onClick={() => updateHP(combatant.id, -1)}
                        className="rounded bg-[var(--dash-border)] px-2 py-1 text-sm text-[var(--dash-text)] hover:bg-[var(--dash-danger-bg)]"
                      >
                        -
                      </button>

                      <span className="min-w-[60px] text-center text-[var(--dash-text)]">
                        {combatant.hp}/{combatant.maxHp}
                      </span>

                      <button
                        onClick={() => updateHP(combatant.id, 1)}
                        className="rounded bg-[var(--dash-border)] px-2 py-1 text-sm text-[var(--dash-text)] hover:bg-[var(--dash-accent)]"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[var(--dash-muted)]">
                      <Shield className="h-4 w-4" />
                      <span>ARM {combatant.armor}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => removeCombatant(combatant.id)}
                  className="px-3 py-1 text-[var(--dash-muted)] hover:text-[var(--dash-danger-text)]"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}