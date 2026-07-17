import { useState, type ReactNode } from 'react';
import type { DashboardSettings } from '../../services/settings/dashboardSettings';
import { TooltipColorsProvider } from '../components/ui/tooltip';
import { PortalContainerContext } from '../components/ui/portal-container';

interface AppShellProps {
  settings: DashboardSettings;
  leftSidebar: ReactNode;
  rightSidebar?: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
}

export function AppShell({ settings, leftSidebar, rightSidebar, topbar, children }: AppShellProps) {
  // In state (non un semplice ref) apposta: serve un re-render dei consumer
  // del context una volta che il nodo e' montato, altrimenti i portali
  // aperti prima del primo render successivo vedrebbero ancora null.
  const [paletteNode, setPaletteNode] = useState<HTMLDivElement | null>(null);

  return (
    <div
      ref={setPaletteNode}
      data-dashboard-palette={settings.palette}
      className="flex h-screen overflow-hidden bg-[var(--dash-bg)] text-[var(--dash-text)]"
    >
      <PortalContainerContext.Provider value={paletteNode}>
        <TooltipColorsProvider palette={settings.palette}>
          {leftSidebar}
          <div className="flex flex-1 flex-col overflow-hidden">
            {topbar}
            <div className="flex flex-1 overflow-hidden">
              <main className="flex-1 overflow-y-auto bg-[var(--dash-bg)]">{children}</main>
              {rightSidebar}
            </div>
          </div>
        </TooltipColorsProvider>
      </PortalContainerContext.Provider>
    </div>
  );
}
