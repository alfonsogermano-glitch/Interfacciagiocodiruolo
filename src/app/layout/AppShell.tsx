import { useState, type ReactNode } from 'react';
import type { DashboardSettings } from '../../services/settings/dashboardSettings';
import { TooltipColorsProvider } from '../components/ui/tooltip';
import { PortalContainerContext } from '../components/ui/portal-container';

interface AppShellProps {
  settings: DashboardSettings;
  className?: string;
  mainAreaClassName?: string;
  workspaceRowClassName?: string;
  contentClassName?: string;
  /**
   * The content slot is the shell landmark by default. A mounted view that
   * already renders its own `<main>` (SessionWorkspace) can opt out, keeping
   * exactly one main landmark without changing the slot classes or geometry.
   */
  contentAsMain?: boolean;
  stableContentNode?: boolean;
  leftSidebar: ReactNode;
  rightSidebar?: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
}

export function AppShell({ settings, className = '', mainAreaClassName = '', workspaceRowClassName = '', contentClassName = '', contentAsMain = true, stableContentNode = false, leftSidebar, rightSidebar, topbar, children }: AppShellProps) {
  // In state (non un semplice ref) apposta: serve un re-render dei consumer
  // del context una volta che il nodo e' montato, altrimenti i portali
  // aperti prima del primo render successivo vedrebbero ancora null.
  const [paletteNode, setPaletteNode] = useState<HTMLDivElement | null>(null);

  return (
    <div
      ref={setPaletteNode}
      data-dashboard-palette={settings.palette}
      className={`flex h-screen overflow-hidden bg-[var(--dash-bg)] text-[var(--dash-text)] ${className}`.trim()}
    >
      <PortalContainerContext.Provider value={paletteNode}>
        <TooltipColorsProvider palette={settings.palette}>
          {leftSidebar}
          <div className={`flex flex-1 flex-col overflow-hidden ${mainAreaClassName}`.trim()}>
            {topbar}
            <div className={`flex flex-1 overflow-hidden ${workspaceRowClassName}`.trim()}>
              {stableContentNode ? (
                <div role={contentAsMain ? 'main' : undefined} className={`flex-1 overflow-y-auto bg-[var(--dash-bg)] ${contentClassName}`.trim()}>{children}</div>
              ) : contentAsMain ? (
                <main className={`flex-1 overflow-y-auto bg-[var(--dash-bg)] ${contentClassName}`.trim()}>{children}</main>
              ) : (
                <div className={`flex-1 overflow-y-auto bg-[var(--dash-bg)] ${contentClassName}`.trim()}>{children}</div>
              )}
              {rightSidebar}
            </div>
          </div>
        </TooltipColorsProvider>
      </PortalContainerContext.Provider>
    </div>
  );
}
