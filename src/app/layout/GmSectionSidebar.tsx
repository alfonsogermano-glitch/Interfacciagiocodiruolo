import type { LucideIcon } from 'lucide-react';
import {
  Ghost,
  Swords,
  Bookmark,
  GitBranch,
  Map,
  Lightbulb,
  Scroll,
  Play,
  Image,
  Users,
} from 'lucide-react';

interface GmSectionSidebarProps {
  activeTab: string;
  onChangeTab: (tabId: string) => void;
}

const PRIMARY_SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'players', label: 'Personaggi', icon: Users },
  { id: 'npcs', label: 'PNG', icon: Ghost },
  { id: 'monsters', label: 'Mostri', icon: Swords },
  { id: 'environments', label: 'Luoghi', icon: Bookmark },
  { id: 'adventures', label: 'Avventure', icon: GitBranch },
  { id: 'map', label: 'Mappa', icon: Map },
  { id: 'clues', label: 'Indizi', icon: Lightbulb },
  { id: 'situations', label: 'Situazioni', icon: Scroll },
  { id: 'combat', label: 'Combattimento', icon: Swords },
];

const SECONDARY_SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'phases', label: 'Fasi di Gioco', icon: Play },
  { id: 'scene-encounter', label: 'Scene', icon: Play },
  { id: 'equipment-catalog', label: 'Archivio Oggetti', icon: Bookmark },
  { id: 'visual-assets', label: 'Asset Grafici', icon: Image },
];

function SectionButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] transition-colors ${
        active
          ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
          : 'text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </button>
  );
}

export function GmSectionSidebar({ activeTab, onChangeTab }: GmSectionSidebarProps) {
  return (
    <aside className="flex h-full w-20 shrink-0 flex-col items-center gap-1 overflow-y-auto border-l border-[var(--dash-border)] bg-[var(--dash-sidebar-bg)] py-3">
      {PRIMARY_SECTIONS.map(section => (
        <SectionButton
          key={section.id}
          icon={section.icon}
          label={section.label}
          active={activeTab === section.id}
          onClick={() => onChangeTab(section.id)}
        />
      ))}

      <div className="my-2 h-px w-8 bg-[var(--dash-border)]" />

      {SECONDARY_SECTIONS.map(section => (
        <SectionButton
          key={section.id}
          icon={section.icon}
          label={section.label}
          active={activeTab === section.id}
          onClick={() => onChangeTab(section.id)}
        />
      ))}
    </aside>
  );
}
