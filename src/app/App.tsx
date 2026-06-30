import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LandingPage from './landing/LandingPage';
import { PrivacyPolicy } from './legal/PrivacyPolicy';
import { DeleteData } from './legal/DeleteData';
import { SetNewPasswordModal } from './landing/SetNewPasswordModal';
import { CampaignProvider, useCampaign } from './campaigns/CampaignContext';
import { RulesetProvider } from './campaigns/RulesetContext';
import { HomeScreen } from './home/HomeScreen';
import { AppShell } from './layout/AppShell';
import { LeftSidebar } from './layout/LeftSidebar';
import { GmSectionSidebar } from './layout/GmSectionSidebar';
import { TopBar } from './layout/TopBar';
import { SettingsModal } from './components/SettingsModal';
import { ReportBugModal } from './components/ReportBugModal';
import { NewsPage } from './news/NewsPage';

import { AdventureManager } from './components/gm/AdventureManager';
import { PlayerCharacters } from './components/gm/PlayerCharacters';
import { MyCharactersPage } from './components/gm/MyCharactersPage';
import { CampaignsPage } from './components/gm/CampaignsPage';
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

  return (
    <div className="px-6 py-6">

      {activeTab === 'phases' && <GamePhases />}

      {activeTab === 'adventures' && (
        <AdventureManager campaignId={activeCampaignId} />
      )}

      {activeTab === 'players' && <PlayerCharacters />}
      {activeTab === 'characters' && <MyCharactersPage />}
      {activeTab === 'campaigns' && <CampaignsPage />}
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

    </div>
  );
}

const VIEW_LS_KEY = 'hsc-current-view';
const ACTIVE_TAB_LS_KEY = 'hsc-active-main-tab';

function AuthGate() {
  const { user, isLoading, signOut, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const { setActiveCampaign, activeCampaign, campaigns } = useCampaign();

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
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'profile'>('general');
  const [isReportBugOpen, setIsReportBugOpen] = useState(false);
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

  const openSettings = (tab: 'general' | 'profile' = 'general') => {
    setDraftDashboardSettings(dashboardSettings);
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  const closeSettingsWithoutSaving = () => {
    setDraftDashboardSettings(dashboardSettings);
    setIsSettingsOpen(false);
  };

  const saveSettingsAndClose = async () => {
    updateDashboardSettings(draftDashboardSettings);
    setDashboardSettings(draftDashboardSettings);
    await saveDashboardSettings(draftDashboardSettings);
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
            onGoToCharacters={() => { goToDashboard(); changeActiveGmTab('characters'); }}
            onGoToCampaigns={() => { goToDashboard(); changeActiveGmTab('campaigns'); }}
            campaigns={campaigns}
            activeCampaignId={activeCampaign?.id}
            onSelectCampaign={(campaign) => goToDashboard(campaign)}
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
            onOpenSettings={(tab) => openSettings(tab)}
            onReportBug={() => setIsReportBugOpen(true)}
          />
        }
      >
        {view === 'home' ? (
          <HomeScreen
            onEnterCampaign={campaign => goToDashboard(campaign)}
            scrollTarget={homeScrollTarget}
            onScrollHandled={() => setHomeScrollTarget(null)}
            palette={dashboardSettings.palette}
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
          initialTab={settingsInitialTab}
        />
      )}

      {isReportBugOpen && (
        <ReportBugModal onClose={() => setIsReportBugOpen(false)} palette={dashboardSettings.palette} />
      )}

    </>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path === '/privacy') return <PrivacyPolicy />;
  if (path === '/elimina-dati') return <DeleteData />;
  if (path === '/news') return <NewsPage />;

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
