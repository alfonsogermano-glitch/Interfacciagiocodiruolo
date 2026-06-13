import { useEffect, useRef, useState } from 'react';
import {
  Eye,
  Users,
  Ghost,
  Map,
  Lightbulb,
  Scroll,
  Swords,
  Bookmark,
  Play,
  GitBranch,
  Image
} from 'lucide-react';

import { AdventureManager } from './components/gm/AdventureManager';
import { PlayerCharacters } from './components/gm/PlayerCharacters';
import { NPCManager } from './components/gm/NPCManager';
import { EnvironmentManager } from './components/gm/EnvironmentManager';
import { CluesManager } from './components/gm/CluesManager';
import { SituationsManager } from './components/gm/SituationsManager';
import { MonstersManager } from './components/gm/MonstersManager';
import { CombatTracker } from './components/gm/CombatTracker';
import { GameMap } from './components/gm/GameMap';
import { GamePhases } from './components/gm/GamePhases';
import { EquipmentCatalogPage } from '../features/gm/pages/EquipmentCatalogPage';
import { VisualAssetsManager } from './components/gm/VisualAssetsManager';
import { SceneEncounterManager } from './components/gm/SceneEncounterManager';
import { SupabaseDebug } from './components/SupabaseDebug';

import { ensureCampaignBootstrap } from '../services/campaign/ensureCampaignBootstrap';

import {
  downloadCampaignBackup,
  importCampaignBackup,
  readCampaignBackupFromFile
} from '../services/campaign/campaignBackupService';

import {
  loadDashboardSettings,
  readDashboardSettings,
  saveDashboardSettings,
  type DashboardSettings
} from '../services/settings/dashboardSettings';

import { DEFAULT_CAMPAIGN_ID } from '../config/campaign.config';

type NavigationTarget = {
  tabId: string;
  entityId?: string;
  entityType?: string;
};

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'phases';

    return window.localStorage.getItem('hsc-active-main-tab') ?? 'phases';
  });

  const [campaignToastMessage, setCampaignToastMessage] = useState<string | null>(null);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);

  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>(
    () => readDashboardSettings()
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [draftDashboardSettings, setDraftDashboardSettings] =
    useState<DashboardSettings>(() => dashboardSettings);

  const importCampaignInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapDashboard() {
      try {
        const loadedSettings = await loadDashboardSettings();

        if (!cancelled) {
          setDashboardSettings(loadedSettings);
        }

        ensureCampaignBootstrap();
      } catch (error) {
        console.error('Errore bootstrap dashboard:', error);

        try {
          ensureCampaignBootstrap();
        } catch (bootstrapError) {
          console.error('Errore bootstrap campagna:', bootstrapError);
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapped(true);
        }
      }
    }

    void bootstrapDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const changeActiveTab = (tabId: string) => {
    setActiveTab(tabId);

    try {
      window.localStorage.setItem('hsc-active-main-tab', tabId);
    } catch (error) {
      console.error('Errore nel salvataggio del tab attivo:', error);
    }
  };

  const navigateToEntity = (target: NavigationTarget) => {
    setNavigationTarget(target);
    changeActiveTab(target.tabId);
  };

  const updateDashboardSettings = (patch: Partial<DashboardSettings>) => {
    setDashboardSettings(previousSettings => {
      const nextSettings = {
        ...previousSettings,
        ...patch
      };

      console.log('Salvataggio impostazioni dashboard:', nextSettings);
      saveDashboardSettings(nextSettings);

      return nextSettings;
    });
  };

  const openSettings = () => {
    setDraftDashboardSettings(dashboardSettings);
    setIsSettingsOpen(true);
  };

  const closeSettingsWithoutSaving = () => {
    setDraftDashboardSettings(dashboardSettings);
    setIsSettingsOpen(false);
  };

  const saveSettingsAndClose = () => {
    updateDashboardSettings(draftDashboardSettings);
    setDashboardSettings(draftDashboardSettings);
    saveDashboardSettings(draftDashboardSettings);
    setIsSettingsOpen(false);
    showCampaignToast('Impostazioni salvate.');
  };

  const showCampaignToast = (message: string) => {
    setCampaignToastMessage(message);

    window.setTimeout(() => {
      setCampaignToastMessage(null);
    }, 2600);
  };

  const handleExportCampaign = () => {
    try {
      downloadCampaignBackup();
      showCampaignToast('Campagna esportata con successo.');
    } catch (error) {
      console.error('Errore durante l’esportazione della campagna:', error);
      showCampaignToast('Errore durante l’esportazione della campagna.');
    }
  };

  const handleImportCampaign = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const backup = await readCampaignBackupFromFile(file);
      importCampaignBackup(backup);
      showCampaignToast('Campagna importata con successo. Ricarico i dati...');
      window.location.reload();
    } catch (error) {
      console.error('Errore durante l’importazione della campagna:', error);
      showCampaignToast('File campagna non valido o danneggiato.');
    } finally {
      event.target.value = '';
    }
  };

  const tabs = [
    { id: 'phases', label: 'Fasi di Gioco', icon: Play },
    { id: 'adventures', label: 'Avventure', icon: GitBranch },
    { id: 'players', label: 'PG', icon: Users },
    { id: 'npcs', label: 'PNG', icon: Ghost },
    { id: 'map', label: 'Mappa', icon: Map },
    { id: 'environments', label: 'Luoghi', icon: Bookmark },
    { id: 'scene-encounter', label: 'Scene', icon: Play },
    { id: 'clues', label: 'Indizi', icon: Lightbulb },
    { id: 'situations', label: 'Situazioni', icon: Scroll },
    { id: 'monsters', label: 'Mostri', icon: Swords },
    { id: 'combat', label: 'Combattimento', icon: Swords },
    { id: 'equipment-catalog', label: 'Archivio Oggetti', icon: Bookmark },
    { id: 'visual-assets', label: 'Asset Grafici', icon: Image }
  ];

  if (!isBootstrapped) {
    return null;
  }

  return (
    <div
  data-dashboard-palette={dashboardSettings.palette}
  className="min-h-screen bg-[var(--dash-bg)] text-[var(--dash-text)]"
      >
      <header className="sticky top-0 z-50 border-b-2 border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
        <div className="mx-auto max-w-[1800px] px-6 py-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="h-8 w-8 text-[var(--dash-accent)]" />

              <div>
                <h1 className="text-[var(--dash-text)]">Dashboard dell'Antico</h1>
                <p className="text-sm text-[var(--dash-muted)]">
                  Controllo completo della sessione di gioco
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                ref={importCampaignInputRef}
                type="file"
                accept="application/json"
                onChange={handleImportCampaign}
                className="hidden"
              />

              <button
                type="button"
                onClick={openSettings}
                className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
              >
                Impostazioni
              </button>

              <button
                type="button"
                onClick={handleExportCampaign}
                className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
              >
                Esporta Campagna
              </button>

              <button
                type="button"
                onClick={() => importCampaignInputRef.current?.click()}
                className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
              >
                Importa Campagna
              </button>
            </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-2">
            {tabs.map(tab => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => changeActiveTab(tab.id)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[var(--dash-accent)] text-[var(--dash-text)]'
                      : 'bg-[var(--dash-input)] text-[var(--dash-muted)] hover:bg-[var(--dash-border)]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-6 py-6">
        {activeTab === 'phases' && <GamePhases />}

        {activeTab === 'adventures' && (
          <AdventureManager campaignId={DEFAULT_CAMPAIGN_ID} />
        )}

        {activeTab === 'players' && <PlayerCharacters />}
        {activeTab === 'npcs' && (
          <NPCManager navigationTarget={navigationTarget} />
        )}
        {activeTab === 'map' && <GameMap />}

        {activeTab === 'environments' && (
          <EnvironmentManager
            campaignId={DEFAULT_CAMPAIGN_ID}
            navigationTarget={navigationTarget}
            onNavigate={navigateToEntity}
          />
        )}

        {activeTab === 'scene-encounter' && <SceneEncounterManager />}
        {activeTab === 'clues' && <CluesManager />}
        {activeTab === 'situations' && <SituationsManager />}
        {activeTab === 'monsters' && (
          <MonstersManager
            navigationTarget={navigationTarget}
            onNavigate={navigateToEntity}
          />
        )}
        {activeTab === 'combat' && <CombatTracker />}

        {activeTab === 'equipment-catalog' && (
          <EquipmentCatalogPage
            campaignId={DEFAULT_CAMPAIGN_ID}
            onNavigate={navigateToEntity}
          />
        )}

        {activeTab === 'visual-assets' && (
          <VisualAssetsManager campaignId={DEFAULT_CAMPAIGN_ID} />
        )}
      </main>

      {campaignToastMessage && (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center">
          <div className="max-w-sm rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-6 py-4 text-center text-sm text-[var(--dash-text-strong)] shadow-2xl">
            {campaignToastMessage}
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-5">
              <div className="text-xs uppercase tracking-[0.14em] text-[var(--dash-accent-2)]">
                Impostazioni dashboard
              </div>

              <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-strong)]">
                Personalizzazione & Database
              </h3>
            </div>

            <div className="space-y-6">
              {/* Sezione Personalizzazione */}
              <div className="border-b border-[var(--dash-border)] pb-5">
                <h4 className="text-sm font-medium text-[var(--dash-text-strong)] mb-3">Personalizzazione</h4>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm text-[var(--dash-text)]">
                      Lingua
                    </label>

                    <select
                      value={draftDashboardSettings.language}
                      onChange={e =>
                        setDraftDashboardSettings(previous => ({
                          ...previous,
                          language: e.target.value as DashboardSettings['language']
                        }))
                      }
                      className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                    >
                      <option value="it">Italiano</option>
                      <option value="en">English</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-[var(--dash-text)]">
                      Palette
                    </label>

                    <select
                      value={draftDashboardSettings.palette}
                      onChange={e =>
                        setDraftDashboardSettings(previous => ({
                          ...previous,
                          palette: e.target.value as DashboardSettings['palette']
                        }))
                      }
                      className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                    >
                      <option value="cthulhu">Cthulhu classica</option>
                      <option value="blood">Rosso sangue</option>
                      <option value="amber">Ambra antica</option>
                      <option value="emerald">Verde occulto</option>
                      <option value="arcane">Blu arcano</option>
                      <option value="noir">Noir</option>
                      <option value="frost">Gelo</option>
                      <option value="violet">Violetto cosmico</option>
                    </select>
                  </div>
                </div>
              </div>
              {/* Sezione Salvataggio */}
<div className="border-b border-[var(--dash-border)] pb-5">
  <h4 className="mb-3 text-sm font-medium text-[var(--dash-text-strong)]">
    Modalità salvataggio
  </h4>

  <div className="space-y-3">
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <input
        type="radio"
        name="saveMode"
        value="cloud"
        checked={draftDashboardSettings.saveMode === 'cloud'}
        onChange={() => setDraftDashboardSettings(previous => ({ ...previous, saveMode: 'cloud' }))}
        className="mt-1"
      />

      <span>
        <span className="block text-sm font-medium text-[var(--dash-text-strong)]">
          Cloud Supabase
        </span>
        <span className="mt-1 block text-xs text-[var(--dash-muted)]">
          Usa Supabase come archivio principale, mantenendo il fallback locale già esistente.
        </span>
      </span>
    </label>

    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <input
        type="radio"
        name="saveMode"
        value="local"
        checked={draftDashboardSettings.saveMode === 'local'}
        onChange={() => setDraftDashboardSettings(previous => ({ ...previous, saveMode: 'local' }))}
        className="mt-1"
      />

      <span>
        <span className="block text-sm font-medium text-[var(--dash-text-strong)]">
          Locale sul dispositivo
        </span>
        <span className="mt-1 block text-xs text-[var(--dash-muted)]">
          Salva i dati sul dispositivo dell’utente. In questa fase prepara la dashboard al futuro salvataggio locale stabile.
        </span>
      </span>
    </label>
  </div>
</div>

              {/* Sezione Supabase Debug */}
              <div>
                <h4 className="text-sm font-medium text-[var(--dash-text-strong)] mb-3">Database Supabase</h4>
                <SupabaseDebug />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[var(--dash-border)] pt-4">
              <button
                type="button"
                onClick={closeSettingsWithoutSaving}
                className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
              >
                Esci senza salvare
              </button>

              <button
                type="button"
                onClick={saveSettingsAndClose}
                className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
              >
                Salva impostazioni
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}