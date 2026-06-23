import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LandingPage from './landing/LandingPage';
import { PrivacyPolicy } from './legal/PrivacyPolicy';
import { DeleteData } from './legal/DeleteData';
import { SetNewPasswordModal } from './landing/SetNewPasswordModal';
import { CampaignProvider, useCampaign } from './campaigns/CampaignContext';
import { RulesetProvider } from './campaigns/RulesetContext';
import { CampaignSelector, CampaignSwitcher } from './campaigns/CampaignSelector';
import { MigrationWizard, isMigrationNeeded } from './campaigns/MigrationWizard';
import { HomeScreen } from './home/HomeScreen';
import { AppShell } from './layout/AppShell';
import { LeftSidebar } from './layout/LeftSidebar';
import { GmSectionSidebar } from './layout/GmSectionSidebar';
import { TopBar } from './layout/TopBar';
import { SettingsModal } from './components/SettingsModal';
import { EditProfileModal } from './components/EditProfileModal';

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

type NavigationTarget = {
  tabId: string;
  entityId?: string;
  entityType?: string;
};

interface DashboardProps {
  activeTab: string;
  navigationTarget: NavigationTarget | null;
  onNavigate: (target: NavigationTarget) => void;
}

function Dashboard({ activeTab, navigationTarget, onNavigate }: DashboardProps) {
  const { activeCampaignId, campaigns, isLoading: campaignsLoading } = useCampaign();
  const [isCampaignSelectorOpen, setIsCampaignSelectorOpen] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const [campaignToastMessage, setCampaignToastMessage] = useState<string | null>(null);

  const importCampaignInputRef = useRef<HTMLInputElement | null>(null);

  const migrationAlreadyDone = localStorage.getItem('hsc-migration-v1-done') === 'true';
  const showWizard =
    !wizardDismissed &&
    !campaignsLoading &&
    !migrationAlreadyDone &&
    (campaigns.length === 0 || isMigrationNeeded());

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

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <CampaignSwitcher onClick={() => setIsCampaignSelectorOpen(true)} />

        <div className="flex items-center gap-2">
          <input
            ref={importCampaignInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportCampaign}
            className="hidden"
          />

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

      {activeTab === 'phases' && <GamePhases />}

      {activeTab === 'adventures' && (
        <AdventureManager campaignId={activeCampaignId} />
      )}

      {activeTab === 'players' && <PlayerCharacters />}
      {activeTab === 'npcs' && (
        <NPCManager navigationTarget={navigationTarget} />
      )}
      {activeTab === 'map' && <GameMap />}

      {activeTab === 'environments' && (
        <EnvironmentManager
          campaignId={activeCampaignId}
          navigationTarget={navigationTarget}
          onNavigate={onNavigate}
        />
      )}

      {activeTab === 'scene-encounter' && <SceneEncounterManager />}
      {activeTab === 'clues' && <CluesManager />}
      {activeTab === 'situations' && <SituationsManager />}
      {activeTab === 'monsters' && (
        <MonstersManager
          navigationTarget={navigationTarget}
          onNavigate={onNavigate}
        />
      )}
      {activeTab === 'combat' && <CombatTracker />}

      {activeTab === 'equipment-catalog' && (
        <EquipmentCatalogPage
          campaignId={activeCampaignId}
          onNavigate={onNavigate}
        />
      )}

      {activeTab === 'visual-assets' && (
        <VisualAssetsManager campaignId={activeCampaignId} />
      )}

      {isCampaignSelectorOpen && (
        <CampaignSelector onClose={() => setIsCampaignSelectorOpen(false)} />
      )}

      {showWizard && (
        <MigrationWizard onComplete={() => setWizardDismissed(true)} />
      )}

      {campaignToastMessage && (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center">
          <div className="max-w-sm rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-panel)] px-6 py-4 text-center text-sm text-[var(--dash-text-strong)] shadow-2xl">
            {campaignToastMessage}
          </div>
        </div>
      )}
    </div>
  );
}

const VIEW_LS_KEY = 'hsc-current-view';
const ACTIVE_TAB_LS_KEY = 'hsc-active-main-tab';

function AuthGate() {
  const { user, isLoading, signOut, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const { setActiveCampaign, activeCampaign } = useCampaign();

  const [view, setView] = useState<'home' | 'dashboard'>(
    () => (localStorage.getItem(VIEW_LS_KEY) === 'dashboard' ? 'dashboard' : 'home')
  );

  useEffect(() => {
    if (!user && !isLoading) {
      setView('home');
      localStorage.setItem(VIEW_LS_KEY, 'home');
    }
  }, [user, isLoading]);

  const [activeGmTab, setActiveGmTab] = useState(() => {
    if (typeof window === 'undefined') return 'phases';

    return window.localStorage.getItem(ACTIVE_TAB_LS_KEY) ?? 'phases';
  });

  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);
  const [homeScrollTarget, setHomeScrollTarget] = useState<'characters' | 'campaigns' | null>(null);

  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>(
    () => readDashboardSettings()
  );
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [draftDashboardSettings, setDraftDashboardSettings] =
    useState<DashboardSettings>(() => dashboardSettings);

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

  const changeActiveGmTab = (tabId: string) => {
    setActiveGmTab(tabId);

    try {
      window.localStorage.setItem(ACTIVE_TAB_LS_KEY, tabId);
    } catch (error) {
      console.error('Errore nel salvataggio del tab attivo:', error);
    }
  };

  const navigateToEntity = (target: NavigationTarget) => {
    setNavigationTarget(target);
    changeActiveGmTab(target.tabId);
  };

  const updateDashboardSettings = (patch: Partial<DashboardSettings>) => {
    setDashboardSettings(previousSettings => {
      const nextSettings = {
        ...previousSettings,
        ...patch
      };

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
  };

  const goToDashboard = (campaign?: Parameters<typeof setActiveCampaign>[0]) => {
    if (campaign) setActiveCampaign(campaign);
    localStorage.setItem(VIEW_LS_KEY, 'dashboard');
    setView('dashboard');
  };

  const goToHome = () => {
    localStorage.setItem(VIEW_LS_KEY, 'home');
    setView('home');
  };

  const goToHomeSection = (section: 'characters' | 'campaigns') => {
    goToHome();
    setHomeScrollTarget(section);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--dash-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          <p className="text-sm text-[var(--dash-muted)]">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  if (isPasswordRecovery) {
    return <SetNewPasswordModal onComplete={clearPasswordRecovery} />;
  }

  if (!isBootstrapped) {
    return null;
  }

  return (
    <>
      <AppShell
        settings={dashboardSettings}
        leftSidebar={
          <LeftSidebar
            view={view}
            onGoHome={goToHome}
            onGoToHomeSection={goToHomeSection}
            onOpenSettings={openSettings}
            onLogout={() => void signOut()}
            activeCampaignName={activeCampaign?.name}
          />
        }
        rightSidebar={
          view === 'dashboard' ? (
            <GmSectionSidebar activeTab={activeGmTab} onChangeTab={changeActiveGmTab} />
          ) : null
        }
        topbar={
          <TopBar
            activeSection={view === 'dashboard' ? activeGmTab : null}
            onLogout={() => void signOut()}
            onEditProfile={() => setIsEditProfileOpen(true)}
          />
        }
      >
        {view === 'home' ? (
          <HomeScreen
            onEnterCampaign={campaign => goToDashboard(campaign)}
            scrollTarget={homeScrollTarget}
            onScrollHandled={() => setHomeScrollTarget(null)}
          />
        ) : (
          <Dashboard
            activeTab={activeGmTab}
            navigationTarget={navigationTarget}
            onNavigate={navigateToEntity}
          />
        )}
      </AppShell>

      {isSettingsOpen && (
        <SettingsModal
          draft={draftDashboardSettings}
          onChangeDraft={setDraftDashboardSettings}
          onSave={saveSettingsAndClose}
          onCancel={closeSettingsWithoutSaving}
        />
      )}

      {isEditProfileOpen && (
        <EditProfileModal onClose={() => setIsEditProfileOpen(false)} />
      )}
    </>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path === '/privacy') return <PrivacyPolicy />;
  if (path === '/elimina-dati') return <DeleteData />;

  return (
    <AuthProvider>
      <CampaignProvider>
        <RulesetProvider>
          <AuthGate />
        </RulesetProvider>
      </CampaignProvider>
    </AuthProvider>
  );
}
