import { useEffect, useRef, useState } from 'react';
import { MessageSquare, FileText, StickyNote, Dices } from 'lucide-react';
import { SlideOverPanel } from './SlideOverPanel';
import { SessionCharactersPanel } from './SessionCharactersPanel';
import { SessionNotesPanel } from './SessionNotesPanel';
import type { SessionEntityOpenRequest } from '../../campaigns/CampaignHome';

type SessionPanelId = 'chat' | 'characters' | 'notes' | 'dice';

const ICONS: { id: SessionPanelId; label: string; icon: typeof FileText; enabled: boolean }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, enabled: false },
  { id: 'characters', label: 'Schede', icon: FileText, enabled: true },
  { id: 'notes', label: 'Note', icon: StickyNote, enabled: true },
  { id: 'dice', label: 'Dadi', icon: Dices, enabled: false },
];

const NOTES_PANEL_STORAGE_KEY = 'hollowgate.notes.panel-width';
const NOTES_PANEL_DEFAULT_WIDTH = 1024;
const NOTES_PANEL_MIN_WIDTH = 640;
const LEFT_SIDEBAR_WIDTH = 100;
const SESSION_RAIL_WIDTH = 80;
const NOTES_PANEL_VIEWPORT_GAP = 16;

function clampNotesPanelWidth(width: number, viewportWidth: number) {
  const maxWidth = Math.max(
    0,
    viewportWidth - LEFT_SIDEBAR_WIDTH - SESSION_RAIL_WIDTH - NOTES_PANEL_VIEWPORT_GAP,
  );
  const minWidth = Math.min(NOTES_PANEL_MIN_WIDTH, maxWidth);
  return Math.min(Math.max(width, minWidth), maxWidth);
}

function readStoredNotesPanelWidth() {
  if (typeof window === 'undefined') return NOTES_PANEL_DEFAULT_WIDTH;
  try {
    const stored = window.localStorage.getItem(NOTES_PANEL_STORAGE_KEY);
    const parsed = stored === null ? NOTES_PANEL_DEFAULT_WIDTH : Number(stored);
    const candidate = Number.isFinite(parsed) ? parsed : NOTES_PANEL_DEFAULT_WIDTH;
    return clampNotesPanelWidth(candidate, window.innerWidth);
  } catch {
    return clampNotesPanelWidth(NOTES_PANEL_DEFAULT_WIDTH, window.innerWidth);
  }
}

interface SessionRightSidebarProps {
  // Comando esterno (da CampaignHome.tsx via App.tsx) per aprire il
  // pannello "Schede" con un'entita' specifica gia' selezionata - stesso
  // pannello che si apre premendo l'icona, non uno nuovo.
  openCharacterRequest?: SessionEntityOpenRequest | null;
}

export function SessionRightSidebar({ openCharacterRequest = null }: SessionRightSidebarProps) {
  const [openPanel, setOpenPanel] = useState<SessionPanelId | null>(null);
  const notesPanelResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [notesPanelWidth, setNotesPanelWidth] = useState(readStoredNotesPanelWidth);
  const [isResizingNotesPanel, setIsResizingNotesPanel] = useState(false);

  const togglePanel = (id: SessionPanelId) => {
    setOpenPanel(prev => (prev === id ? null : id));
  };

  useEffect(() => {
    if (!openCharacterRequest) return;
    setOpenPanel('characters');
  }, [openCharacterRequest?.requestId]);

  useEffect(() => {
    const clampToViewport = () => {
      setNotesPanelWidth((currentWidth) => clampNotesPanelWidth(currentWidth, window.innerWidth));
    };
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTES_PANEL_STORAGE_KEY, String(Math.round(notesPanelWidth)));
    } catch {
      // Il resize continua a funzionare anche se lo storage locale e' bloccato.
    }
  }, [notesPanelWidth]);

  const handleNotesPanelResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    notesPanelResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: notesPanelWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizingNotesPanel(true);
  };

  const handleNotesPanelResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = notesPanelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const requestedWidth = resize.startWidth + (resize.startX - event.clientX);
    setNotesPanelWidth(clampNotesPanelWidth(requestedWidth, window.innerWidth));
  };

  const finishNotesPanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = notesPanelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    notesPanelResizeRef.current = null;
    setIsResizingNotesPanel(false);
  };

  const notesPanelResizeHandle = (
    <div
      data-note-panel-resizer="true"
      role="separator"
      aria-orientation="vertical"
      aria-label="Ridimensiona finestra note"
      aria-valuemin={NOTES_PANEL_MIN_WIDTH}
      aria-valuenow={Math.round(notesPanelWidth)}
      onPointerDown={handleNotesPanelResizePointerDown}
      onPointerMove={handleNotesPanelResizePointerMove}
      onPointerUp={finishNotesPanelResize}
      onPointerCancel={finishNotesPanelResize}
      onLostPointerCapture={() => {
        notesPanelResizeRef.current = null;
        setIsResizingNotesPanel(false);
      }}
      style={{ left: -4, width: 9, touchAction: 'none' }}
      className="group absolute inset-y-0 z-30 cursor-col-resize"
    >
      <div
        className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
          isResizingNotesPanel
            ? 'bg-[var(--dash-accent)]'
            : 'bg-transparent group-hover:bg-[var(--dash-accent)]'
        }`}
      />
    </div>
  );

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
        widthClassName={openPanel === 'notes' ? 'max-w-none' : undefined}
        panelWidth={openPanel === 'notes' ? notesPanelWidth : undefined}
        leftResizeHandle={openPanel === 'notes' ? notesPanelResizeHandle : undefined}
      >
        {openPanel === 'characters' && <SessionCharactersPanel initialSelection={openCharacterRequest} />}
        {openPanel === 'notes' && <SessionNotesPanel />}
      </SlideOverPanel>
    </>
  );
}
