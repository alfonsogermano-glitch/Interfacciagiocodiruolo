import { Icon } from '@iconify/react';

interface GmSectionSidebarProps {
  activeTab: string;
  onChangeTab: (tabId: string) => void;
}

const PRIMARY_SECTIONS: { id: string; label: string; icon: string }[] = [
  { id: 'chapters', label: 'Capitoli e Scene', icon: 'ph:git-branch-duotone' },
  { id: 'scene-encounter', label: 'Preparazione', icon: 'ph:play-duotone' },
  { id: 'players', label: 'Schede', icon: 'ph:file-text-duotone' },
  { id: 'npcs', label: 'PNG', icon: 'ph:identification-badge-duotone' },
  { id: 'monsters', label: 'Mostri', icon: 'ph:ghost-duotone' },
  { id: 'clues', label: 'Indizi', icon: 'ph:lightbulb-duotone' },
  { id: 'equipment-catalog', label: 'Archivio Oggetti', icon: 'ph:bookmark-simple-duotone' },
];

const SECONDARY_SECTIONS: { id: string; label: string; icon: string }[] = [
  { id: 'map', label: 'Mappa legacy', icon: 'ph:map-trifold-duotone' },
  { id: 'situations', label: 'Eventi legacy', icon: 'ph:scroll-duotone' },
  { id: 'phases', label: 'Fasi di Gioco', icon: 'ph:play-duotone' },
  { id: 'combat', label: 'Combattimento', icon: 'ph:sword-duotone' },
  { id: 'visual-assets', label: 'Asset Grafici', icon: 'ph:image-duotone' },
];

function SectionButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
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
      <Icon icon={icon} className="h-[18px] w-[18px]" />
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
