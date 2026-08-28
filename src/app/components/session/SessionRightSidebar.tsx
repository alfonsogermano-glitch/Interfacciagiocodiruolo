import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MessageSquare, FileText, StickyNote, Dices } from 'lucide-react';
import { SlideOverPanel } from './SlideOverPanel';
import { SessionCharactersPanel } from './SessionCharactersPanel';
import { SessionNotesPanel } from './SessionNotesPanel';
import { SessionDicePanel } from './dice/SessionDicePanel';
import { DiceRollHistoryDrawer } from './dice/DiceRollHistoryDrawer';
import { DiceSessionProvider } from './dice/DiceSessionContext';
import type { SessionEntityOpenRequest } from '../../campaigns/CampaignHome';
import './sessionPanelResize.css';

type SessionPanelId = 'chat' | 'characters' | 'notes' | 'dice';

const ICONS: { id: SessionPanelId; label: string; icon: typeof FileText; enabled: boolean }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, enabled: false },
  { id: 'characters', label: 'Schede', icon: FileText, enabled: true },
  { id: 'notes', label: 'Note', icon: StickyNote, enabled: true },
  { id: 'dice', label: 'Dadi', icon: Dices, enabled: true },
];

const NOTES_PANEL_STORAGE_KEY = 'hollowgate.notes.panel-width';
const NOTES_PANEL_DEFAULT_WIDTH = 1024;
const NOTES_PANEL_MIN_WIDTH = 640;
const CHARACTERS_PANEL_STORAGE_KEY = 'hollowgate.characters.panel-width';
const CHARACTERS_PANEL_DEFAULT_WIDTH = 1024;
const CHARACTERS_PANEL_MIN_WIDTH = 640;
const CHARACTERS_SIDEBAR_STORAGE_KEY = 'hollowgate.characters.sidebar-width';
const CHARACTERS_SIDEBAR_DEFAULT_WIDTH = 256;
const CHARACTERS_SIDEBAR_MIN_WIDTH = 192;
const CHARACTERS_DETAIL_MIN_WIDTH = 360;
const LEFT_SIDEBAR_WIDTH = 100;
const SESSION_RAIL_WIDTH = 80;
const NOTES_PANEL_VIEWPORT_GAP = 16;
const CHARACTERS_PANEL_VIEWPORT_GAP = 16;

function clampNotesPanelWidth(width: number, viewportWidth: number) {
  const maxWidth = Math.max(
    0,
    viewportWidth - LEFT_SIDEBAR_WIDTH - SESSION_RAIL_WIDTH - NOTES_PANEL_VIEWPORT_GAP,
  );
  const minWidth = Math.min(NOTES_PANEL_MIN_WIDTH, maxWidth);
  return Math.min(Math.max(width, minWidth), maxWidth);
}

function clampCharactersPanelWidth(width: number, viewportWidth: number) {
  const maxWidth = Math.max(
    0,
    viewportWidth - LEFT_SIDEBAR_WIDTH - SESSION_RAIL_WIDTH - CHARACTERS_PANEL_VIEWPORT_GAP,
  );
  const minWidth = Math.min(CHARACTERS_PANEL_MIN_WIDTH, maxWidth);
  return Math.min(Math.max(width, minWidth), maxWidth);
}

function clampCharactersSidebarWidth(width: number, panelWidth: number) {
  const maxWidth = Math.max(CHARACTERS_SIDEBAR_MIN_WIDTH, panelWidth - CHARACTERS_DETAIL_MIN_WIDTH);
  return Math.min(Math.max(width, CHARACTERS_SIDEBAR_MIN_WIDTH), maxWidth);
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

function readStoredCharactersPanelWidth() {
  if (typeof window === 'undefined') return CHARACTERS_PANEL_DEFAULT_WIDTH;
  try {
    const stored = window.localStorage.getItem(CHARACTERS_PANEL_STORAGE_KEY);
    const parsed = stored === null ? CHARACTERS_PANEL_DEFAULT_WIDTH : Number(stored);
    const candidate = Number.isFinite(parsed) ? parsed : CHARACTERS_PANEL_DEFAULT_WIDTH;
    return clampCharactersPanelWidth(candidate, window.innerWidth);
  } catch {
    return clampCharactersPanelWidth(CHARACTERS_PANEL_DEFAULT_WIDTH, window.innerWidth);
  }
}

function readStoredCharactersSidebarWidth() {
  if (typeof window === 'undefined') return CHARACTERS_SIDEBAR_DEFAULT_WIDTH;
  try {
    const stored = window.localStorage.getItem(CHARACTERS_SIDEBAR_STORAGE_KEY);
    if (stored === null) return CHARACTERS_SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : CHARACTERS_SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return CHARACTERS_SIDEBAR_DEFAULT_WIDTH;
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
  const charactersPanelResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const charactersSidebarResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [notesPanelWidth, setNotesPanelWidth] = useState(readStoredNotesPanelWidth);
  const [charactersPanelWidth, setCharactersPanelWidth] = useState(readStoredCharactersPanelWidth);
  const [charactersSidebarWidth, setCharactersSidebarWidth] = useState(readStoredCharactersSidebarWidth);
  const [isResizingNotesPanel, setIsResizingNotesPanel] = useState(false);
  const [isResizingCharactersPanel, setIsResizingCharactersPanel] = useState(false);
  const [isResizingCharactersSidebar, setIsResizingCharactersSidebar] = useState(false);

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
      setCharactersPanelWidth((currentWidth) => clampCharactersPanelWidth(currentWidth, window.innerWidth));
    };
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, []);

  useEffect(() => {
    setCharactersSidebarWidth((currentWidth) => clampCharactersSidebarWidth(currentWidth, charactersPanelWidth));
  }, [charactersPanelWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTES_PANEL_STORAGE_KEY, String(Math.round(notesPanelWidth)));
    } catch {
      // Il resize continua a funzionare anche se lo storage locale e' bloccato.
    }
  }, [notesPanelWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHARACTERS_PANEL_STORAGE_KEY, String(Math.round(charactersPanelWidth)));
    } catch {
      // Il resize continua a funzionare anche se lo storage locale e' bloccato.
    }
  }, [charactersPanelWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHARACTERS_SIDEBAR_STORAGE_KEY, String(Math.round(charactersSidebarWidth)));
    } catch {
      // Il resize continua a funzionare anche se lo storage locale e' bloccato.
    }
  }, [charactersSidebarWidth]);

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

  const handleCharactersPanelResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    charactersPanelResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: charactersPanelWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizingCharactersPanel(true);
  };

  const handleCharactersPanelResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = charactersPanelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const requestedWidth = resize.startWidth + (resize.startX - event.clientX);
    setCharactersPanelWidth(clampCharactersPanelWidth(requestedWidth, window.innerWidth));
  };

  const finishCharactersPanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = charactersPanelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    charactersPanelResizeRef.current = null;
    setIsResizingCharactersPanel(false);
  };

  const handleCharactersSidebarResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    charactersSidebarResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: charactersSidebarWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizingCharactersSidebar(true);
  };

  const handleCharactersSidebarResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = charactersSidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const requestedWidth = resize.startWidth + (event.clientX - resize.startX);
    setCharactersSidebarWidth(clampCharactersSidebarWidth(requestedWidth, charactersPanelWidth));
  };

  const finishCharactersSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = charactersSidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    charactersSidebarResizeRef.current = null;
    setIsResizingCharactersSidebar(false);
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

  const charactersPanelResizeHandle = (
    <div
      data-character-panel-resizer="true"
      role="separator"
      aria-orientation="vertical"
      aria-label="Ridimensiona finestra schede"
      aria-valuemin={CHARACTERS_PANEL_MIN_WIDTH}
      aria-valuenow={Math.round(charactersPanelWidth)}
      onPointerDown={handleCharactersPanelResizePointerDown}
      onPointerMove={handleCharactersPanelResizePointerMove}
      onPointerUp={finishCharactersPanelResize}
      onPointerCancel={finishCharactersPanelResize}
      onLostPointerCapture={() => {
        charactersPanelResizeRef.current = null;
        setIsResizingCharactersPanel(false);
      }}
      style={{ left: -4, width: 9, touchAction: 'none' }}
      className="group absolute inset-y-0 z-30 cursor-col-resize"
    >
      <div
        className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
          isResizingCharactersPanel
            ? 'bg-[var(--dash-accent)]'
            : 'bg-transparent group-hover:bg-[var(--dash-accent)]'
        }`}
      />
    </div>
  );

  const charactersSidebarResizeHandle = (
    <div
      data-character-sidebar-resizer="true"
      role="separator"
      aria-orientation="vertical"
      aria-label="Ridimensiona lista schede"
      aria-valuemin={CHARACTERS_SIDEBAR_MIN_WIDTH}
      aria-valuenow={Math.round(charactersSidebarWidth)}
      onPointerDown={handleCharactersSidebarResizePointerDown}
      onPointerMove={handleCharactersSidebarResizePointerMove}
      onPointerUp={finishCharactersSidebarResize}
      onPointerCancel={finishCharactersSidebarResize}
      onLostPointerCapture={() => {
        charactersSidebarResizeRef.current = null;
        setIsResizingCharactersSidebar(false);
      }}
      style={{ left: charactersSidebarWidth - 4, width: 9, touchAction: 'none' }}
      className="group absolute inset-y-0 z-40 cursor-col-resize"
    >
      <div
        className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
          isResizingCharactersSidebar
            ? 'bg-[var(--dash-accent)]'
            : 'bg-transparent group-hover:bg-[var(--dash-accent)]'
        }`}
      />
    </div>
  );

  const resizablePanelOpen = openPanel === 'notes' || openPanel === 'characters';
  const activePanelWidth =
    openPanel === 'notes' ? notesPanelWidth : openPanel === 'characters' ? charactersPanelWidth : undefined;
  const activePanelResizeHandle =
    openPanel === 'notes' ? notesPanelResizeHandle : openPanel === 'characters' ? charactersPanelResizeHandle : undefined;

  return (
    <DiceSessionProvider>
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
          widthClassName={resizablePanelOpen ? 'max-w-none' : undefined}
          panelWidth={activePanelWidth}
          leftResizeHandle={activePanelResizeHandle}
        >
          {openPanel === 'characters' && (
            <div
              data-session-characters-resizable="true"
              className="relative h-full min-h-0 overflow-hidden"
              style={{ '--characters-list-width': `${charactersSidebarWidth}px` } as CSSProperties}
            >
              <SessionCharactersPanel initialSelection={openCharacterRequest} />
              {charactersSidebarResizeHandle}
            </div>
          )}
          {openPanel === 'notes' && <SessionNotesPanel />}
          {openPanel === 'dice' && <SessionDicePanel />}
        </SlideOverPanel>

        <DiceRollHistoryDrawer />
      </>
    </DiceSessionProvider>
  );
}