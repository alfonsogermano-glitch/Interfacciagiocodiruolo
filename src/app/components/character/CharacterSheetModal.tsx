import { useEffect, useState } from 'react';
import {
  Backpack,
  Brain,
  BookOpen,
  Castle,
  FileText,
  Heart,
  Link2,
  Loader2,
  Minus,
  Plus,
  Skull,
  Sparkles,
  Swords,
  UserCircle2,
  X
} from 'lucide-react';
import { FrischezzaTracker } from '../FrischezzaTracker';
import { FoliaSpiral } from '../FoliaSpiral';
import { ConditionsPanel } from '../ConditionsPanel';
import { TurbePanel } from '../TurbePanel';
import { EquipmentPanel } from '../EquipmentPanel';
import { getCharacterById, updateCharacter } from '../../../services/characters/characterService';
import { RULESETS, type RulesetId } from '../../campaigns/campaignTypes';
import type { Character, CharacterRecord, Condition, Equipment, Turba } from '../../../types/character';

const RULESET_ICONS: Record<RulesetId, React.ReactNode> = {
  hsc: <Skull className="h-3.5 w-3.5" />,
  dnd5e: <Swords className="h-3.5 w-3.5" />,
  pathfinder: <Castle className="h-3.5 w-3.5" />,
  coc7e: <FileText className="h-3.5 w-3.5" />,
  cocclassic: <BookOpen className="h-3.5 w-3.5" />,
  custom: <Sparkles className="h-3.5 w-3.5" />
};

function recordToCharacter(record: CharacterRecord): Character {
  const sheetData = record.sheetData ?? {};

  return {
    id: record.id,
    name: record.name,
    style: record.style ?? 'Jock',
    viaggio: record.viaggio ?? 'Campione',

    ambiti: sheetData.ambiti ?? { Fisico: 1, Scuola: 1, Carisma: 1, Strada: 1 },
    abilita: sheetData.abilita ?? {},

    freschezza: sheetData.freschezza ?? 12,
    maxFreschezza: sheetData.maxFreschezza ?? 12,
    caselleFrischezzaCruciali: sheetData.caselleFrischezzaCruciali ?? [8, 12],

    follia: sheetData.follia ?? 9,
    maxFollia: sheetData.maxFollia ?? 9,

    conditions: sheetData.conditions ?? [],
    turbe: sheetData.turbe ?? [],

    audacia: sheetData.audacia ?? 1,
    prodigi: sheetData.prodigi ?? 0,

    legame: sheetData.legame ?? '',
    linkedCharacterId: sheetData.linkedCharacterId,
    legameDescription: sheetData.legameDescription,

    coverImageUrl: sheetData.coverImageUrl ?? record.backgroundUrl ?? undefined,
    portraitImageUrl: sheetData.portraitImageUrl ?? record.portraitUrl ?? undefined,
    portraitCroppedImageUrl: sheetData.portraitCroppedImageUrl,

    coverPositionX: sheetData.coverPositionX,
    coverPositionY: sheetData.coverPositionY,
    coverScale: sheetData.coverScale,
    portraitCrop: sheetData.portraitCrop,

    tutore: sheetData.tutore ?? '',
    tratti: sheetData.tratti ?? [],
    equipment: sheetData.equipment ?? [],
    tipoSpeciale: sheetData.tipoSpeciale ?? ''
  };
}

function getRulesetId(record: CharacterRecord): RulesetId {
  const ruleset = (record.sheetData as { ruleset?: RulesetId } | undefined)?.ruleset;
  return ruleset && RULESETS[ruleset] ? ruleset : 'hsc';
}

interface CharacterSheetModalProps {
  characterId: string;
  onClose: () => void;
  onJoinSession?: () => void;
}

export function CharacterSheetModal({ characterId, onClose, onJoinSession }: CharacterSheetModalProps) {
  const [record, setRecord] = useState<CharacterRecord | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const loaded = await getCharacterById(characterId);
        if (cancelled) return;
        setRecord(loaded);
        setCharacter(recordToCharacter(loaded));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const isEditable = record?.campaignId != null;

  const persistSheetData = async (patch: Partial<Character>) => {
    if (!record || !isEditable) return;

    const nextSheetData = { ...record.sheetData, ...patch };
    setRecord({ ...record, sheetData: nextSheetData });
    setCharacter(prev => (prev ? { ...prev, ...patch } : prev));

    try {
      await updateCharacter(record.id, { sheetData: nextSheetData });
    } catch (err) {
      console.error('Errore salvataggio personaggio:', err);
    }
  };

  const ruleset = record ? RULESETS[getRulesetId(record)] : RULESETS.hsc;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] shadow-2xl">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--dash-accent)]" />
          </div>
        ) : error || !character || !record ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <p className="text-sm text-[var(--dash-danger-text)]">
              {error ?? 'Personaggio non trovato.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--dash-border)] bg-[var(--dash-surface-2)] p-5">
              <div className="flex items-center gap-4">
                {character.portraitImageUrl ? (
                  <img
                    src={character.portraitImageUrl}
                    alt={character.name}
                    className="h-16 w-16 rounded-full border border-[var(--dash-border-soft)] object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-accent)]">
                    <UserCircle2 className="h-8 w-8" />
                  </div>
                )}

                <div>
                  <h2 className="text-xl font-semibold tracking-wide text-[var(--dash-text-strong)]">
                    {character.name}
                  </h2>
                  <p className="text-sm text-[var(--dash-muted)]">
                    {character.style} · {character.viaggio}
                  </p>
                  <span
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide"
                    style={{
                      borderColor: `${ruleset.color}55`,
                      backgroundColor: `${ruleset.color}1a`,
                      color: ruleset.color
                    }}
                  >
                    {RULESET_ICONS[ruleset.id]}
                    {ruleset.name}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {!isEditable && (
                <div className="mb-5 flex flex-col items-start gap-3 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-[var(--dash-text)]">
                    Questo personaggio non è ancora in una sessione.
                  </p>
                  <button
                    type="button"
                    onClick={onJoinSession}
                    className="shrink-0 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)] transition-all hover:bg-[var(--dash-accent-2)]"
                  >
                    Unisciti a una sessione
                  </button>
                </div>
              )}

              <fieldset disabled={!isEditable} className="m-0 space-y-5 border-0 p-0 disabled:opacity-60">
              {/* Ambiti, Audacia, Prodigi */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4 sm:col-span-2 lg:col-span-1">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--dash-muted)]">Ambiti</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(character.ambiti).map(([ambito, value]) => (
                      <div key={ambito} className="rounded border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-1.5 text-center">
                        <div className="text-[10px] text-[var(--dash-muted)]">{ambito}</div>
                        <div className="text-sm font-semibold text-[var(--dash-text-strong)]">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[var(--dash-accent-2)]" />
                    <span className="font-medium text-[var(--dash-text)]">Audacia</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => persistSheetData({ audacia: Math.max(0, character.audacia - 1) })}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-lg font-semibold text-[var(--dash-text-strong)]">{character.audacia}</span>
                    <button
                      type="button"
                      onClick={() => persistSheetData({ audacia: character.audacia + 1 })}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-[var(--dash-accent-2)]" />
                    <span className="font-medium text-[var(--dash-text)]">Prodigi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => persistSheetData({ prodigi: Math.max(0, character.prodigi - 1) })}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-lg font-semibold text-[var(--dash-text-strong)]">{character.prodigi}</span>
                    <button
                      type="button"
                      onClick={() => persistSheetData({ prodigi: character.prodigi + 1 })}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Abilità */}
              {Object.keys(character.abilita).length > 0 && (
                <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--dash-muted)]">Abilità</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Object.entries(character.abilita).map(([abilita, value]) => (
                      <div key={abilita} className="flex items-center justify-between rounded border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2.5 py-1.5 text-sm">
                        <span className="text-[var(--dash-text)]">{abilita}</span>
                        <span className="font-semibold text-[var(--dash-text-strong)]">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Freschezza e Follia */}
              <div className="grid gap-4 lg:grid-cols-2">
                <FrischezzaTracker
                  current={character.freschezza}
                  max={character.maxFreschezza}
                  crucialBoxes={character.caselleFrischezzaCruciali}
                  onUpdate={value => persistSheetData({ freschezza: value })}
                />

                <div className="space-y-4">
                  <FoliaSpiral
                    current={character.follia}
                    max={character.maxFollia}
                    onUpdate={value => persistSheetData({ follia: value })}
                  />
                  <TurbePanel
                    turbe={character.turbe}
                    onUpdate={(turbe: Turba[]) => persistSheetData({ turbe })}
                  />
                </div>
              </div>

              {/* Condizioni */}
              <ConditionsPanel
                conditions={character.conditions}
                onUpdate={(conditions: Condition[]) => persistSheetData({ conditions })}
              />

              {/* Legame, Tutore, Tipo Speciale */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--dash-muted)]">
                    <Link2 className="h-3.5 w-3.5" /> Legame
                  </div>
                  <div className="text-sm text-[var(--dash-text)]">{character.legame || 'Nessuno'}</div>
                </div>
                <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--dash-muted)]">
                    <Heart className="h-3.5 w-3.5" /> Tutore
                  </div>
                  <div className="text-sm text-[var(--dash-text)]">{character.tutore || 'Nessuno'}</div>
                </div>
                <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--dash-muted)]">
                    <Sparkles className="h-3.5 w-3.5" /> Tipo speciale
                  </div>
                  <div className="text-sm text-[var(--dash-text)]">{character.tipoSpeciale || 'Nessuno'}</div>
                </div>
              </div>

              {/* Tratti */}
              {character.tratti.length > 0 && (
                <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--dash-muted)]">Tratti</div>
                  <div className="space-y-2">
                    {character.tratti.map((trait, idx) => (
                      <div key={idx} className="rounded border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-2.5">
                        <div className="text-sm font-medium text-[var(--dash-text-strong)]">{trait.name}</div>
                        {trait.description && (
                          <div className="text-xs text-[var(--dash-muted)]">{trait.description}</div>
                        )}
                        {trait.benefit && (
                          <div className="mt-1 text-xs text-[var(--dash-accent-2)]">{trait.benefit}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Equipaggiamento */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--dash-muted)]">
                  <Backpack className="h-3.5 w-3.5" /> Equipaggiamento
                </div>
                <EquipmentPanel
                  equipment={character.equipment}
                  onUpdate={(equipment: Equipment[]) => persistSheetData({ equipment })}
                />
              </div>
              </fieldset>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
