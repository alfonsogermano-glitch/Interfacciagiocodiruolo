import type { ReactNode } from 'react';
import type { DashboardSettings } from '../../services/settings/dashboardSettings';

interface AppShellProps {
  settings: DashboardSettings;
  leftSidebar: ReactNode;
  rightSidebar?: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
}

export function AppShell({ settings, leftSidebar, rightSidebar, topbar, children }: AppShellProps) {
  return (
    <div
      data-dashboard-palette={settings.palette}
      className="flex h-screen overflow-hidden bg-[var(--dash-bg)] text-[var(--dash-text)]"
    >
      {leftSidebar}
      <main className="flex flex-1 flex-col overflow-y-auto bg-[var(--dash-bg)]">
        {topbar}
        {children}
      </main>
      {rightSidebar}
    </div>
  );
}
