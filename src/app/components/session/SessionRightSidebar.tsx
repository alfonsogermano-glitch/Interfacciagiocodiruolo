import { useState } from 'react';
import { MessageSquare, Users2, StickyNote, Dices } from 'lucide-react';
import { SlideOverPanel } from './SlideOverPanel';
import { SessionCharactersPanel } from './SessionCharactersPanel';
import { SessionNotesPanel } from './SessionNotesPanel';

type SessionPanelId = 'chat' | 'characters' | 'notes' | 'dice';

const ICONS: { id: SessionPanelId; label: string; icon: typeof Users2; enabled: boolean }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, enabled: false },
  { id: 'characters', label: 'Personaggi', icon: Users2, enabled: true },
  { id: 'notes', label: 'Note', icon: StickyNote, enabled: true },
  { id: 'dice', label: 'Dadi', icon: Dices, enabled: false },
];

export function SessionRightSidebar() {
  const [openPanel, setOpenPanel] = useState<SessionPanelId | null>(null);

  const togglePanel = (id: SessionPanelId) => {
    setOpenPanel(prev => (prev === id ? null : id));
  };

  return (
    <>
      <aside className="relative z-[950] flex h-full w-20 shrink-0 flex-col items-center gap-1 border-l border-[var(--dash-border)] bg-[var(--dash-sidebar-bg)] py-3">
        {ICONS.map(({ id, label, icon: Icon, enabled }) => (
          <button
            key={id}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && togglePanel(id)}
            aria-label={label}
            className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] transition-colors ${
              openPanel === id
                ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : enabled
                  ? 'text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]'
                  : 'text-[var(--dash-muted)] opacity-40 cursor-not-allowed'
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </button>
        ))}
      </aside>

      <SlideOverPanel
        isOpen={openPanel !== null}
        onClose={() => setOpenPanel(null)}
      >
        {openPanel === 'characters' && <SessionCharactersPanel />}
        {openPanel === 'notes' && <SessionNotesPanel />}
      </SlideOverPanel>
    </>
  );
}
