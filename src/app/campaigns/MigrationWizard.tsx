import { useEffect, useState } from 'react';
import { CheckCircle2, Database, HardDrive, Cloud, ArrowRight, Loader2, Skull, Swords, Castle, Sparkles } from 'lucide-react';
import { CAMPAIGN_STORAGE_KEYS } from '../../services/campaign/campaignStorageKeys';
import { isTauriRuntime } from '../../services/runtime/runtimeEnvironment';
import { readDashboardSettings } from '../../services/settings/dashboardSettings';
import { useCampaign } from './CampaignContext';
import { RULESETS, type RulesetId } from './campaignTypes';

const LEGACY_CAMPAIGN_ID = '10000000-0000-0000-0000-000000000001';
const MIGRATION_DONE_KEY = 'hsc-migration-v1-done';

const RULESET_ICONS: Record<RulesetId, React.ReactNode> = {
  hsc: <Skull className="h-4 w-4" />,
  dnd5e: <Swords className="h-4 w-4" />,
  pathfinder: <Castle className="h-4 w-4" />,
  custom: <Sparkles className="h-4 w-4" />,
};

// ─── Detection ──────────────────────────────────────────────────────────────

type StorageSource = 'localStorage' | 'tauri' | 'supabase-local';

interface LegacyDataSummary {
  hasData: boolean;
  sources: StorageSource[];
  counts: Record<string, number>;
}

function detectLegacyLocalStorage(): { hasData: boolean; counts: Record<string, number> } {
  const counts: Record<string, number> = {};

  const collections: Array<[string, keyof typeof CAMPAIGN_STORAGE_KEYS]> = [
    ['Avventure', 'adventures'],
    ['PG', 'playerCharacters'],
    ['PNG', 'npcs'],
    ['Mostri', 'monsters'],
    ['Luoghi', 'environments'],
    ['Indizi', 'clues'],
    ['Situazioni', 'situations'],
  ];

  for (const [label, key] of collections) {
    try {
      const raw = localStorage.getItem(CAMPAIGN_STORAGE_KEYS[key]);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        counts[label] = parsed.length;
      }
    } catch { /* ignore */ }
  }

  return { hasData: Object.keys(counts).length > 0, counts };
}

function detectLegacyTauri(): boolean {
  // Tauri ha dati se esiste la directory della campagna legacy
  // Non possiamo accedervi direttamente dal browser senza invoke,
  // quindi usiamo un flag salvato da un precedente avvio Tauri.
  return isTauriRuntime();
}

export function detectLegacyData(): LegacyDataSummary {
  const ls = detectLegacyLocalStorage();
  const sources: StorageSource[] = [];

  if (ls.hasData) sources.push('localStorage');
  if (detectLegacyTauri() && !ls.hasData) sources.push('tauri');

  const settings = readDashboardSettings();
  if (settings.saveMode === 'cloud' && !ls.hasData && !isTauriRuntime()) {
    // In cloud mode senza dati locali: niente da migrare
  }

  return {
    hasData: sources.length > 0 || ls.hasData,
    sources,
    counts: ls.counts,
  };
}

// Ritorna true solo se ci sono dati legacy da migrare (il flag done viene controllato in AuthGate)
export function isMigrationNeeded(): boolean {
  const { hasData } = detectLegacyData();
  return hasData;
}

export function markMigrationDone(): void {
  localStorage.setItem(MIGRATION_DONE_KEY, 'true');
}

// ─── Wizard UI ───────────────────────────────────────────────────────────────

type WizardStep = 'detect' | 'configure' | 'migrating' | 'done';

function StorageIcon({ source }: { source: StorageSource }) {
  if (source === 'localStorage') return <HardDrive className="h-4 w-4 text-[var(--dash-accent)]" />;
  if (source === 'tauri') return <HardDrive className="h-4 w-4 text-[var(--dash-accent)]" />;
  return <Cloud className="h-4 w-4 text-[var(--dash-accent)]" />;
}

function StorageLabel({ source }: { source: StorageSource }) {
  if (source === 'localStorage') return <>Browser (localStorage)</>;
  if (source === 'tauri') return <>App desktop (file locali)</>;
  return <>Cloud Supabase</>;
}

export function MigrationWizard({ onComplete }: { onComplete: () => void }) {
  const { createCampaign, campaigns } = useCampaign();

  const [step, setStep] = useState<WizardStep>('detect');
  const [legacy, setLegacy] = useState<LegacyDataSummary>({ hasData: false, sources: [], counts: {} });
  const [campaignName, setCampaignName] = useState('Prima Campagna');
  const [ruleset, setRuleset] = useState<RulesetId>('hsc');
  const [error, setError] = useState<string | null>(null);

  const settings = readDashboardSettings();

  useEffect(() => {
    const summary = detectLegacyData();
    setLegacy(summary);
    setStep('configure');
  }, []);

  const handleSkip = () => {
    markMigrationDone();
    onComplete();
  };

  const handleMigrate = async () => {
    setStep('migrating');
    setError(null);

    try {
      // Crea la campagna con il LEGACY_CAMPAIGN_ID per mantenere tutti i dati esistenti
      await createCampaign({
        id: LEGACY_CAMPAIGN_ID,
        name: campaignName.trim() || 'Prima Campagna',
        description: 'Campagna migrata dai dati esistenti.',
        ruleset,
      });

      markMigrationDone();
      setStep('done');
    } catch (err) {
      console.log('Errore migrazione:', err);
      setError(`Errore durante la migrazione: ${err}. Riprova o clicca "Salta" per ricominciare da zero.`);
      setStep('configure');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border-2 border-[var(--dash-accent)] bg-[var(--dash-panel)] shadow-[0_0_60px_var(--dash-accent)]/40 shadow-2xl">

        {/* Header */}
        <div className="border-b border-[var(--dash-border-soft)] px-6 py-5">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-[var(--dash-accent)]" />
            <div>
              <h2 className="text-base font-semibold text-[var(--dash-text-strong)]">
                {campaigns.length === 0 ? 'Prima campagna' : 'Migrazione dati'}
              </h2>
              <p className="text-xs text-[var(--dash-muted)]">
                {campaigns.length === 0
                  ? 'Configura la tua prima campagna per iniziare'
                  : 'Trovati dati da una versione precedente'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">

          {/* Detect / Configure */}
          {(step === 'detect' || step === 'configure') && (
            <div className="space-y-5">

              {/* Dati trovati */}
              {legacy.hasData && (
                <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-4">
                  <p className="mb-3 text-sm font-medium text-[var(--dash-text-strong)]">
                    Dati trovati in:
                  </p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {legacy.sources.map(src => (
                      <span key={src} className="flex items-center gap-1.5 rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2.5 py-1 text-xs text-[var(--dash-text)]">
                        <StorageIcon source={src} />
                        <StorageLabel source={src} />
                      </span>
                    ))}
                    {settings.saveMode === 'cloud' && (
                      <span className="flex items-center gap-1.5 rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2.5 py-1 text-xs text-[var(--dash-text)]">
                        <Cloud className="h-4 w-4 text-[var(--dash-accent)]" />
                        Supabase (cloud mode attiva)
                      </span>
                    )}
                  </div>

                  {Object.keys(legacy.counts).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(legacy.counts).map(([label, count]) => (
                        <span key={label} className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-0.5 text-xs text-[var(--dash-muted)]">
                          {count} {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Nome campagna */}
              <div>
                <label className="mb-1.5 block text-sm text-[var(--dash-text)]">
                  {campaigns.length === 0 ? 'Nome campagna' : 'Nome per la campagna esistente'}
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  placeholder="Nome campagna"
                  className="w-full rounded-xl border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-2.5 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)]"
                />
              </div>

              {/* Regolamento */}
              <div>
                <label className="mb-2 block text-sm text-[var(--dash-text)]">Regolamento</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.values(RULESETS)).map(rs => (
                    <button
                      key={rs.id}
                      type="button"
                      onClick={() => setRuleset(rs.id)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-colors ${
                        ruleset === rs.id
                          ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]'
                          : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)]'
                      }`}
                    >
                      <span className="text-[var(--dash-accent)]">{RULESET_ICONS[rs.id]}</span>
                      <span className="truncate">{rs.name}</span>
                      {ruleset === rs.id && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--dash-accent)]" />}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-3 text-sm text-[var(--dash-danger-text)]">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-sm text-[var(--dash-muted)] underline underline-offset-2 hover:text-[var(--dash-text)]"
                >
                  Salta — ricomincia da zero
                </button>
                <button
                  type="button"
                  onClick={handleMigrate}
                  disabled={!campaignName.trim()}
                  className="flex items-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)] disabled:opacity-50"
                >
                  {campaigns.length === 0 ? 'Crea campagna' : 'Migra dati'} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Migrating */}
          {step === 'migrating' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-[var(--dash-accent)]" />
              <div>
                <p className="font-medium text-[var(--dash-text-strong)]">Creazione campagna in corso...</p>
                <p className="mt-1 text-sm text-[var(--dash-muted)]">Collegamento ai dati esistenti.</p>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-[var(--dash-accent)]" />
              <div>
                <p className="text-lg font-semibold text-[var(--dash-text-strong)]">
                  {campaigns.length <= 1 ? 'Campagna creata!' : 'Migrazione completata!'}
                </p>
                <p className="mt-1 text-sm text-[var(--dash-muted)]">
                  Campagna <strong className="text-[var(--dash-text-strong)]">"{campaignName}"</strong> pronta.
                </p>
              </div>
              <button
                type="button"
                onClick={onComplete}
                className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-6 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]"
              >
                Vai alla dashboard <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
