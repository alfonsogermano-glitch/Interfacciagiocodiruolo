import { useState } from 'react';
import { MessageSquare, Users2, StickyNote, Dices } from 'lucide-react';
import { SlideOverPanel } from './SlideOverPanel';
import { SessionCharactersPanel } from './SessionCharactersPanel';

type SessionPanelId = 'chat' | 'characters' | 'notes' | 'dice';

const ICONS: { id: SessionPanelId; label: string; icon: typeof Users2; enabled: boolean }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, enabled: false },
  { id: 'characters', label: 'Personaggi', icon: Users2, enabled: true },
  { id: 'notes', label: 'Note', icon: StickyNote, enabled: false },
  { id: 'dice', label: 'Dadi', icon: Dices, enabled: false },
];

export function SessionRightSidebar() {
  const [openPanel, setOpenPanel] = useState<SessionPanelId | null>(null);

  const togglePanel = (id: SessionPanelId) => {
    setOpenPanel(prev => (prev === id ? null : id));
  };

  return (
    <>
      <aside className="flex h-full w-16 shrink-0 flex-col items-center gap-2 border-l border-[var(--dash-border)] bg-[var(--dash-sidebar-bg)] py-3">
        {ICONS.map(({ id, label, icon: Icon, enabled }) => (
          <button
            key={id}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && togglePanel(id)}
            title={enabled ? label : `${label} (in arrivo)`}
            className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
              openPanel === id
                ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : enabled
                  ? 'text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                  : 'text-[var(--dash-muted)] opacity-40 cursor-not-allowed'
            }`}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </aside>

      <SlideOverPanel
        isOpen={openPanel !== null}
        onClose={() => setOpenPanel(null)}
      >
        {openPanel === 'characters' && <SessionCharactersPanel />}
      </SlideOverPanel>
    </>
  );
}
