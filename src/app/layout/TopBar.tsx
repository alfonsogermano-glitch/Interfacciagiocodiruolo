import { useEffect, useRef, useState, type SVGProps } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Brush, Bug, Check, ChevronDown, Circle, CloudFog, Crosshair, Eraser, Eye, EyeOff, Hexagon, LassoSelect, LogOut, MapPin, Minus, MoreVertical, MousePointer2, Newspaper, Pencil, PenTool, Plus, ScanLine, Search, Settings, Square as SquareIcon, Trash2, Triangle, UserPlus, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useNotifications, type NotificationRow } from '../notifications/NotificationsContext';
import { useCampaign } from '../campaigns/CampaignContext';
import { isRulesetCompatible } from '../campaigns/campaignTypes';
import { JoinCampaignCharacterDialog, type JoinCampaignCharacterOption } from '../components/session/shared/JoinCampaignCharacterDialog';
import {
  loadCharactersByOwner, assignCharacterToCampaign,
  claimCharacter, loadAvailableCharactersForInvite,
} from '../../services/supabase/charactersService';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { usePortalContainer } from '../components/ui/portal-container';
import { requestSessionMapCenter, requestSessionMapDrawingClear, requestSessionMapFit, setActiveSessionMapTool, setSessionMapCalibrationActive, setSessionMapDrawMode, setSessionMapMeasureMode, setSessionMapMeasurementsVisibleToAll, setSessionMapSelectionArmed, setSessionMapSelectionMode, updateSessionGrid, updateSessionMapDrawStyle, useActiveSessionMapTool, useSessionGrid, useSessionMapCalibrationActive, useSessionMapCenterAvailable, useSessionMapDrawSettings, useSessionMapFitAvailable, useSessionMapMeasureMode, useSessionMapMeasurementsVisibleToAll, useSessionMapSelectionMode, type SessionMapDrawMode, type SessionMapMeasureMode } from '../components/session/mapToolStore';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;
const DRAW_LINE_STYLES = [
  { value: 'solid', label: 'Continua', dash: undefined },
  { value: 'dashed', label: 'Tratteggiata', dash: '10 7' },
  { value: 'dotted', label: 'Puntini', dash: '1 7' },
  { value: 'dash-dot', label: 'Tratto-punto', dash: '12 6 2 6' },
  { value: 'long-dash', label: 'Tratti lunghi', dash: '20 8' },
] as const;

interface TopBarProps {
  activeSection?: string | null;
  sessionWorkspaceActive?: boolean;
  onLogout: () => void;
  onOpenSettings: (tab: 'general' | 'profile') => void;
  onReportBug: () => void;
}

function MoveMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <g className="map-tool-move-vertical"><path d="M12 9V2M12 2 8.5 5.5M12 2l3.5 3.5M12 15v7M12 22l-3.5-3.5M12 22l3.5-3.5" /></g>
    <g className="map-tool-move-horizontal"><path d="M9 12H2M2 12l3.5-3.5M2 12l3.5 3.5M15 12h7M22 12l-3.5-3.5M22 12l-3.5 3.5" /></g>
  </svg>;
}

function SelectMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" overflow="visible" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="4" width="15" height="15" rx="2" strokeDasharray="3 2" />
    <g className="map-tool-select-cursor" strokeWidth="2.2">
      <path d="m26 26-7-7" />
      <path d="M19 24v-5h5" />
    </g>
  </svg>;
}

function MeasureConeIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 12 21 5v14Z" /><circle cx="4" cy="12" r="1.8" fill="currentColor" stroke="none" /></svg>;
}

function MeasureLineIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}><path d="M5 18 19 6" /><circle cx="5" cy="18" r="2" fill="currentColor" stroke="none" /><circle cx="19" cy="6" r="2" fill="currentColor" stroke="none" /></svg>;
}

function MeasureCircleIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /></svg>;
}

function GridMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
    {[4, 10, 16].flatMap(y => [4, 10, 16].map(x => <rect key={`${x}-${y}`} className="map-tool-grid-cell" x={x} y={y} width="4" height="4" rx="0.6" />))}
  </svg>;
}

function MeasureMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <g transform="rotate(42 12 12)">
      <rect className="map-tool-measure-fill" x="7.8" y="3" width="8.4" height="18" rx="1.5" stroke="none" fill="currentColor" opacity="0.32" />
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M8 6h4M8 9h2.5M8 12h4M8 15h2.5M8 18h4" />
    </g>
  </svg>;
}

function WallsMapIcon(props: SVGProps<SVGSVGElement>) {
  const bricks = [
    [1, 17], [8.5, 17], [16, 17],
    [4.75, 11.5], [12.25, 11.5],
    [1, 6], [8.5, 6], [16, 6],
    [4.75, 0.5], [12.25, 0.5],
  ];
  return <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.2" {...props}>
    {bricks.map(([x, y], index) => <rect key={`${x}-${y}`} className={`map-tool-wall-brick map-tool-wall-brick-${index + 1}`} x={x} y={y} width="6.8" height="5" rx="0.6" stroke="var(--dash-panel)" strokeWidth="1" />)}
  </svg>;
}

function PointerMapIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
    <g className="map-tool-pointer-arrow">
      <path d="M18 5 8 15" />
      <path d="M8 10v5h5" />
    </g>
  </svg>;
}

const SESSION_MAP_TOOLS = [
  { id: 'move', label: 'Muovi', icon: MoveMapIcon },
  { id: 'select', label: 'Seleziona', icon: SelectMapIcon },
  { id: 'grid', label: 'Griglia', icon: GridMapIcon },
  { id: 'measure', label: 'Misura', icon: MeasureMapIcon },
  { id: 'draw', label: 'Disegna', icon: Pencil },
  { id: 'pin', label: 'Puntina', icon: MapPin },
  { id: 'fog', label: 'Nebbia', icon: CloudFog },
  { id: 'walls', label: 'Muri', icon: WallsMapIcon },
  { id: 'pointer', label: 'Puntatore', icon: PointerMapIcon },
] as const;

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  monsters: 'Cerca mostro...',
  npcs: 'Cerca PNG...',
  players: 'Cerca personaggio...',
};

const NOTIFICATION_LABELS: Record<string, { icon: typeof Bell; text: (data: Record<string, any>) => string }> = {
  campaign_invite: {
    icon: UserPlus,
    text: (data) => `${data.inviterDisplayName ?? 'Qualcuno'} ti ha invitato nella campagna "${data.campaignName ?? ''}"`,
  },
};

function formatNotificationTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function NotificationRowItem({ notification }: { notification: NotificationRow }) {
  const { user, session } = useAuth();
  const { markAsRead, respondToInvite } = useNotifications();
  const { refreshJoinedCampaigns } = useCampaign();
  const [isResponding, setIsResponding] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);
  // Scelte trovate per QUESTO invito (propri PG compatibili + precompilati
  // disponibili nella campagna), popolate al click su "Accetta" - non null
  // significa "mostra il dialog di scelta PG" (spazio troppo stretto per
  // gestirlo inline in questa riga di dropdown, vedi JoinCampaignCharacterDialog
  // condiviso con HomeScreen.tsx).
  const [joinChoices, setJoinChoices] = useState<{
    ownCharacters: JoinCampaignCharacterOption[];
    availableCharacters: JoinCampaignCharacterOption[];
  } | null>(null);

  const meta = NOTIFICATION_LABELS[notification.type];
  const Icon = meta?.icon ?? Bell;
  const text = meta ? meta.text(notification.data) : `Notifica: ${notification.type}`;

  const isPendingInvite = notification.type === 'campaign_invite' && notification.data?.status === 'pending';

  const handleDecline = async () => {
    setIsResponding(true);
    setRespondError(null);
    try {
      await respondToInvite(notification.id, 'decline');
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Errore durante la risposta.');
    } finally {
      setIsResponding(false);
    }
  };

  // "Accetta" non chiama piu' respondToInvite direttamente al click sul
  // bottone: prima verifica che esista almeno un PG proprio compatibile per
  // ruleset O un precompilato disponibile in quella campagna
  // (loadAvailableCharactersForInvite - non e' ancora membro a questo punto,
  // vedi endpoint server dedicato), altrimenti blocca del tutto (nessuna accettazione, stesso
  // principio gia' applicato al codice invito in HomeScreen.tsx). Il
  // ruleset della campagna viaggia gia' dentro la notifica (campaignRuleset,
  // scritto da /campaigns/:id/invite-by-name) - nessuna chiamata di rete in
  // piu' solo per saperlo.
  //
  // respondToInvite('accept') viene chiamato UNA SOLA VOLTA qui, appena
  // confermato che esiste almeno una scelta valida - non dentro gli handler
  // di selezione del personaggio sotto. respondToInvite NON e' idempotente
  // (la notifica passa a status "accepted", una seconda chiamata sulla
  // stessa notifica torna 409 "Invito già gestito"): se restasse dentro
  // l'handler di selezione e un primo tentativo fallisse dopo un accept
  // riuscito, un retry (anche su un personaggio diverso) richiamerebbe
  // respondToInvite e fallirebbe con 409, bloccando anche il retry del solo
  // passaggio successivo. Spostandolo qui, gli handler di selezione sotto
  // diventano chiamate singole e sicure da ripetere.
  const handleAcceptClick = async () => {
    if (!user?.id) return;
    setRespondError(null);

    const campaignRuleset = notification.data?.campaignRuleset ?? null;
    if (!campaignRuleset) {
      setRespondError('Impossibile verificare la compatibilità di questo invito. Chiedi al GM di inviarlo di nuovo.');
      return;
    }

    setIsResponding(true);
    try {
      const campaignId = notification.data.campaignId as string;
      const accessToken = session?.access_token ?? publicAnonKey;
      const [myCharacters, availableCharacters] = await Promise.all([
        loadCharactersByOwner(user.id),
        loadAvailableCharactersForInvite(campaignId, null, SERVER_BASE, accessToken),
      ]);
      const ownCharacters = myCharacters.filter(c => isRulesetCompatible(c.ruleset, null, campaignRuleset));

      if (ownCharacters.length === 0 && availableCharacters.length === 0) {
        setRespondError(
          `Nessuno dei tuoi personaggi è compatibile con il regolamento di "${notification.data?.campaignName ?? 'questa campagna'}" e non ci sono personaggi precompilati disponibili. ` +
          'Crea o richiedi un personaggio compatibile, poi riprova.'
        );
        return;
      }

      await respondToInvite(notification.id, 'accept');
      await refreshJoinedCampaigns();
      setJoinChoices({
        ownCharacters: ownCharacters.map(c => ({ id: c.id, name: c.name, ruleset: c.ruleset })),
        availableCharacters: availableCharacters.map(c => ({ id: c.id, name: c.name, ruleset: c.ruleset })),
      });
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Errore durante la verifica dei personaggi.');
    } finally {
      setIsResponding(false);
    }
  };

  // La membership e' gia' stabilita da handleAcceptClick sopra - qui solo
  // l'assegnazione del PG scelto, in sicurezza rispetto a un retry.
  const handleSelectOwnCharacterForInvite = async (characterId: string) => {
    setIsResponding(true);
    setRespondError(null);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await assignCharacterToCampaign(characterId, SERVER_BASE, accessToken, { campaignId: notification.data.campaignId });
      setJoinChoices(null);
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Errore durante la risposta.');
    } finally {
      setIsResponding(false);
    }
  };

  const handleSelectAvailableCharacterForInvite = async (characterId: string) => {
    setIsResponding(true);
    setRespondError(null);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await claimCharacter(characterId, SERVER_BASE, accessToken);
      setJoinChoices(null);
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Errore durante la richiesta.');
    } finally {
      setIsResponding(false);
    }
  };

  return (
    <div
      onClick={() => { if (!notification.read) void markAsRead(notification.id); }}
      className={`flex cursor-default gap-2.5 border-b border-[var(--dash-border-soft)] px-3 py-2.5 text-sm last:border-b-0 ${
        notification.read ? 'text-[var(--dash-muted)]' : 'bg-[var(--dash-surface-2)] text-[var(--dash-text)]'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="leading-snug">{text}</p>
        <p className="mt-0.5 text-[11px] text-[var(--dash-muted)]">{formatNotificationTime(notification.created_at)}</p>
        {isPendingInvite && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={isResponding}
              onClick={(e) => { e.stopPropagation(); void handleAcceptClick(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" /> Accetta
            </button>
            <button
              type="button"
              disabled={isResponding}
              onClick={(e) => { e.stopPropagation(); void handleDecline(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)] disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" /> Rifiuta
            </button>
          </div>
        )}
        {respondError && <p className="mt-1 text-[11px] text-[var(--dash-danger-text)]">{respondError}</p>}
      </div>

      {joinChoices && (
        <JoinCampaignCharacterDialog
          campaignName={notification.data?.campaignName ?? 'questa campagna'}
          ownCharacters={joinChoices.ownCharacters}
          availableCharacters={joinChoices.availableCharacters}
          isPending={isResponding}
          error={respondError}
          onSelectOwnCharacter={(id) => { void handleSelectOwnCharacterForInvite(id); }}
          onSelectAvailableCharacter={(id) => { void handleSelectAvailableCharacterForInvite(id); }}
          onClose={() => setJoinChoices(null)}
        />
      )}
    </div>
  );
}

export function TopBar({ activeSection, sessionWorkspaceActive = false, onLogout, onOpenSettings, onReportBug }: TopBarProps) {
  const { user } = useAuth();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const activeMapTool = useActiveSessionMapTool();
  const selectionMode = useSessionMapSelectionMode();
  const measureMode = useSessionMapMeasureMode();
  const measurementsVisibleToAll = useSessionMapMeasurementsVisibleToAll();
  const drawSettings = useSessionMapDrawSettings();
  const { settings: gridSettings, editable: gridEditable } = useSessionGrid();
  const mapFitAvailable = useSessionMapFitAvailable();
  const mapCenterAvailable = useSessionMapCenterAvailable();
  const mapCalibrationActive = useSessionMapCalibrationActive();
  const [gridPanelOpen, setGridPanelOpen] = useState(false);
  const [selectPanelOpen, setSelectPanelOpen] = useState(false);
  const [selectPanelPosition, setSelectPanelPosition] = useState({ left: 0, top: 0 });
  const [measurePanelOpen, setMeasurePanelOpen] = useState(false);
  const [drawPanelOpen, setDrawPanelOpen] = useState(false);
  const [clearDrawingsConfirmOpen, setClearDrawingsConfirmOpen] = useState(false);
  const [activeDrawSlider, setActiveDrawSlider] = useState<'strokeWidth' | 'opacity' | 'fillOpacity' | null>(null);
  const [drawLineStyleOpen, setDrawLineStyleOpen] = useState(false);
  const [measurePanelPosition, setMeasurePanelPosition] = useState({ left: 0, top: 0 });
  const [measurementVisibilityTooltipOpen, setMeasurementVisibilityTooltipOpen] = useState(false);
  const measurementVisibilityHoveredRef = useRef(false);
  const [mapFitMenuOpen, setMapFitMenuOpen] = useState(false);
  const portalTarget = usePortalContainer();

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setIsUserMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsUserMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!mapFitAvailable) setMapFitMenuOpen(false);
  }, [mapFitAvailable]);

  useEffect(() => {
    if (!selectPanelOpen) return;
    const closeOutsideSelectionPalette = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-map-tool="select"], [data-session-select-panel]')) return;
      setSelectPanelOpen(false);
      setSessionMapSelectionArmed(false);
    };
    document.addEventListener('pointermove', closeOutsideSelectionPalette);
    return () => document.removeEventListener('pointermove', closeOutsideSelectionPalette);
  }, [selectPanelOpen]);

  useEffect(() => {
    if (!measurePanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMeasurePanelOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [measurePanelOpen]);

  useEffect(() => { if (!drawPanelOpen) setDrawLineStyleOpen(false); }, [drawPanelOpen]);

  useEffect(() => {
    if (!drawLineStyleOpen) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-draw-line-style]')) return;
      setDrawLineStyleOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [drawLineStyleOpen]);

  const displayName = user?.displayName ?? 'Utente';
  const initials = displayName.trim().charAt(0).toUpperCase() || '?';
  const searchPlaceholder = (activeSection && SEARCH_PLACEHOLDERS[activeSection]) || 'Cerca...';

  return (
    <header className="sticky top-0 z-[1000] flex h-12 shrink-0 items-center gap-2 border-b border-[var(--dash-border)] bg-[var(--dash-surface)] px-4">
      <div className="flex-1" />

      {sessionWorkspaceActive && (
        <div data-session-map-toolbar className="absolute left-2 right-24 flex items-center justify-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:left-1/2 md:right-auto md:-translate-x-1/2">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)]/90 p-1 shadow-lg">
            {SESSION_MAP_TOOLS.map(({ id, label, icon: Icon }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild><button type="button" data-map-tool={id} aria-label={label} aria-pressed={activeMapTool === id} disabled={!gridEditable && (id === 'grid' || id === 'draw' || id === 'fog' || id === 'walls')} onPointerEnter={event => { if (id !== 'select') return; const rect = event.currentTarget.getBoundingClientRect(); setSelectPanelPosition({ left: rect.left + rect.width / 2, top: rect.bottom }); setSelectPanelOpen(true); }} onClick={event => { if (!gridEditable && (id === 'grid' || id === 'draw' || id === 'fog' || id === 'walls')) return; setSessionMapCalibrationActive(false); if (id === 'select') { const rect = event.currentTarget.getBoundingClientRect(); setSelectPanelPosition({ left: rect.left + rect.width / 2, top: rect.bottom }); setSessionMapSelectionArmed(false); setSelectPanelOpen(true); setMeasurePanelOpen(false); setDrawPanelOpen(false); } else if (id === 'measure') { const rect = event.currentTarget.getBoundingClientRect(); setMeasurePanelPosition({ left: rect.left + rect.width / 2, top: rect.bottom }); setSessionMapSelectionArmed(false); setActiveSessionMapTool('measure'); setSelectPanelOpen(false); setDrawPanelOpen(false); setMeasurePanelOpen(open => !open); } else if (id === 'draw') { setSessionMapSelectionArmed(false); setActiveSessionMapTool('draw'); setSelectPanelOpen(false); setMeasurePanelOpen(false); setDrawPanelOpen(open => !open); } else { setSessionMapSelectionArmed(false); setActiveSessionMapTool(id); setSelectPanelOpen(false); setMeasurePanelOpen(false); setDrawPanelOpen(false); } setGridPanelOpen(id === 'grid' ? open => !open : false); setMapFitMenuOpen(false); }} className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${activeMapTool === id ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'}`}>
                  <Icon className="h-4.5 w-4.5" />
                </button></TooltipTrigger>
                {id !== 'select' && <TooltipContent side="bottom">{label}</TooltipContent>}
              </Tooltip>
            ))}
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[var(--dash-border-soft)]" />
            <Tooltip>
              <TooltipTrigger asChild><button type="button" data-session-map-center aria-label="Centra la visuale sulla mappa" disabled={!mapCenterAvailable} onClick={requestSessionMapCenter} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:cursor-not-allowed disabled:opacity-35">
                <Crosshair className="h-4.5 w-4.5" />
              </button></TooltipTrigger>
              <TooltipContent side="bottom">Centra la visuale sulla mappa</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild><button type="button" data-session-map-calibrate aria-label="Calibra mappa" aria-pressed={mapCalibrationActive} disabled={!gridEditable || gridSettings.type !== 'square'} onClick={() => { setSessionMapCalibrationActive(!mapCalibrationActive); setSessionMapSelectionArmed(false); setSelectPanelOpen(false); setMeasurePanelOpen(false); setGridPanelOpen(false); }} className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${mapCalibrationActive ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'}`}><ScanLine className="h-4.5 w-4.5" /></button></TooltipTrigger>
              <TooltipContent side="bottom">Calibra mappa</TooltipContent>
            </Tooltip>
          </div>
          {gridPanelOpen && createPortal(<div data-session-grid-panel className="fixed left-1/2 top-14 z-[1100] w-[min(92vw,550px)] -translate-x-1/2 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-2.5 text-xs text-[var(--dash-text)] shadow-2xl">
            <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)_200px]">
              <div className="flex justify-center gap-1.5 border-b border-[var(--dash-border-soft)] pb-2 sm:flex-col sm:border-b-0 sm:border-r sm:pb-0 sm:pr-2">{([['square', SquareIcon, 'Quadrata'], ['hex-flat', Hexagon, 'Esagonale piatta'], ['hex-pointy', Hexagon, 'Esagonale a punta']] as const).map(([type, Icon, label]) => <button key={type} type="button" disabled={!gridEditable} title={label} aria-label={label} aria-pressed={gridSettings.type === type} onClick={() => updateSessionGrid({ type, visible: true })} className={`grid h-9 w-9 place-items-center rounded-md border ${gridSettings.type === type ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/20 text-[var(--dash-accent-2)]' : 'border-transparent text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]'} disabled:opacity-50`}><Icon className={`h-5 w-5 ${type === 'hex-pointy' ? 'rotate-90' : ''}`} /></button>)}</div>
              <div className="space-y-2 sm:px-1"><label className="flex items-center justify-between gap-3 text-[11px] font-medium">Snap alla griglia<input type="checkbox" disabled={!gridEditable} checked={gridSettings.snap} onChange={event => updateSessionGrid({ snap: event.target.checked })} className="h-4 w-4 accent-[var(--dash-accent)]" /></label><label className="block text-[11px] font-medium"><span className="mb-1 block">Stile linea</span><select disabled={!gridEditable} value={gridSettings.lineStyle ?? 'solid'} onChange={event => updateSessionGrid({ lineStyle: event.target.value as 'solid' | 'dashed' | 'dotted' | 'crosses' | 'corners' })} className="h-8 w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 text-xs text-[var(--dash-text)]"><option value="solid">Intera</option><option value="dashed">Tratteggiata</option><option value="dotted">Punti</option><option value="crosses">Incroci</option><option value="corners">Angoli</option></select></label><label className="flex items-center justify-between gap-3 text-[11px] font-medium"><span>Colore griglia</span><input type="color" disabled={!gridEditable} value={gridSettings.color ?? '#38bdf8'} onChange={event => updateSessionGrid({ color: event.target.value, visible: true })} className="h-7 w-16 cursor-pointer rounded border border-[var(--dash-border-soft)] bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Colore griglia" /></label><label className="block text-[11px]"><span className="mb-0.5 flex justify-between"><span>Opacità griglia</span><span>{Math.round(gridSettings.opacity * 100)}%</span></span><input type="range" min="0" max="1" step="0.05" disabled={!gridEditable} value={gridSettings.opacity} onChange={event => updateSessionGrid({ opacity: Number(event.target.value), visible: true })} className="block h-4 w-full accent-[var(--dash-accent)]" /></label></div>
              <div className="space-y-1.5 border-t border-[var(--dash-border-soft)] pt-2 sm:border-l sm:border-t-0 sm:pl-2.5 sm:pt-0"><div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-[var(--dash-muted)]"><span className="leading-tight">Distanza per cella</span><span className="leading-tight">Unità</span><input aria-label="Distanza per cella" type="number" min="0.1" step="0.1" disabled={!gridEditable} value={gridSettings.distance} onChange={event => updateSessionGrid({ distance: Math.max(0.1, Number(event.target.value) || 0.1) })} className="h-8 w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 text-xs text-[var(--dash-text)]" /><input aria-label="Unità" value={gridSettings.unit} disabled={!gridEditable} onChange={event => updateSessionGrid({ unit: event.target.value })} className="h-8 w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 text-xs text-[var(--dash-text)]" /></div><p className="text-[10px] leading-tight text-[var(--dash-muted)]">Valore reale per cella, usato anche dal righello.</p><div><div className="mb-0.5 text-[11px] text-[var(--dash-muted)]">Dimensione cella</div><div data-session-grid-size-stepper className="flex h-8 items-stretch overflow-hidden rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)]"><button type="button" aria-label="Diminuisci dimensione cella" disabled={!gridEditable || gridSettings.cellSize <= 2} onClick={() => updateSessionGrid({ cellSize: Math.max(2, gridSettings.cellSize - 1) })} className="flex w-9 items-center justify-center text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button><input type="number" aria-label="Dimensione cella" min="2" max="500" disabled={!gridEditable} value={gridSettings.cellSize} onChange={event => updateSessionGrid({ cellSize: Math.min(500, Math.max(2, Number(event.target.value) || 2)) })} className="min-w-0 flex-1 appearance-none border-x border-[var(--dash-border)] bg-transparent px-1 text-center text-xs text-[var(--dash-text)] outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none" /><button type="button" aria-label="Aumenta dimensione cella" disabled={!gridEditable || gridSettings.cellSize >= 500} onClick={() => updateSessionGrid({ cellSize: Math.min(500, gridSettings.cellSize + 1) })} className="flex w-9 items-center justify-center text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button></div></div></div>
            </div>
            {gridSettings.type === 'square' && gridSettings.snap && <label className="flex items-center justify-between gap-3 border-t border-[var(--dash-border-soft)] pt-2 text-[11px] font-medium"><span>Posizionamento oggetti</span><select disabled={!gridEditable} aria-label="Posizionamento oggetti sulla griglia quadrata" value={gridSettings.squareSnapMode ?? 'half-step'} onChange={event => updateSessionGrid({ squareSnapMode: event.target.value as 'half-step' | 'cell-center' })} className="h-8 rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 text-xs text-[var(--dash-text)]"><option value="half-step">Mezzo passo</option><option value="cell-center">Centro casella</option></select></label>}
            {gridEditable && gridSettings.type === 'square' && <div data-session-map-fit className="absolute bottom-8 right-2.5 w-20"><button type="button" disabled={!mapFitAvailable} title={mapFitAvailable ? 'Adatta la mappa alla griglia' : 'Sblocca la mappa per adattarla'} aria-haspopup="menu" aria-expanded={mapFitAvailable && mapFitMenuOpen} onClick={() => setMapFitMenuOpen(open => !open)} className="flex h-8 w-full items-center justify-between rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface-2)] px-2 text-[10px] font-medium text-[var(--dash-text)] hover:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-40"><span>Adatta</span><ChevronDown className={`h-3 w-3 transition-transform ${mapFitMenuOpen ? 'rotate-180' : ''}`} /></button>{mapFitAvailable && mapFitMenuOpen && <div role="menu" className="absolute bottom-full right-0 z-10 mb-1 w-48 overflow-hidden rounded-md border border-[var(--dash-border)] bg-[var(--dash-panel)] shadow-xl"><button type="button" role="menuitem" onClick={() => { requestSessionMapFit('exact'); setMapFitMenuOpen(false); }} className="block w-full px-2.5 py-2 text-left text-[11px] hover:bg-[var(--dash-surface-2)]"><span className="block font-medium">Adatta entrambi i lati</span><span className="block text-[10px] text-[var(--dash-muted)]">Allineamento esatto</span></button><button type="button" role="menuitem" onClick={() => { requestSessionMapFit('proportional'); setMapFitMenuOpen(false); }} className="block w-full border-t border-[var(--dash-border-soft)] px-2.5 py-2 text-left text-[11px] hover:bg-[var(--dash-surface-2)]"><span className="block font-medium">Mantieni proporzioni</span><span className="block text-[10px] text-[var(--dash-muted)]">Allinea il lato più vicino</span></button><button type="button" role="menuitem" onClick={() => { requestSessionMapFit('reset'); setMapFitMenuOpen(false); }} className="block w-full border-t border-[var(--dash-border-soft)] px-2.5 py-2 text-left text-[11px] hover:bg-[var(--dash-surface-2)]"><span className="block font-medium">Ripristina mappa originale</span><span className="block text-[10px] text-[var(--dash-muted)]">Rimuove l'adattamento</span></button></div>}</div>}
           </div>, portalTarget ?? document.body)}
          {selectPanelOpen && createPortal(<div data-session-select-panel onPointerLeave={() => { setSelectPanelOpen(false); setSessionMapSelectionArmed(false); }} className="fixed z-[1100] flex -translate-x-1/2 gap-1 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 shadow-2xl" style={{ left: selectPanelPosition.left, top: selectPanelPosition.top }}>
             <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Selezione rettangolare" aria-pressed={selectionMode === 'rectangle'} onClick={() => { setActiveSessionMapTool('select'); setSessionMapSelectionMode('rectangle'); setSessionMapSelectionArmed(true); setSelectPanelOpen(false); setMeasurePanelOpen(false); }} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${selectionMode === 'rectangle' ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/20 text-[var(--dash-text-strong)]' : 'border-transparent text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'}`}><SquareIcon className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="bottom">Seleziona a Rettangolo</TooltipContent></Tooltip>
             <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Selezione a mano libera" aria-pressed={selectionMode === 'freehand'} onClick={() => { setActiveSessionMapTool('select'); setSessionMapSelectionMode('freehand'); setSessionMapSelectionArmed(true); setSelectPanelOpen(false); setMeasurePanelOpen(false); }} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${selectionMode === 'freehand' ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/20 text-[var(--dash-text-strong)]' : 'border-transparent text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'}`}><LassoSelect className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="bottom">Seleziona a Mano libera</TooltipContent></Tooltip>
           </div>, portalTarget ?? document.body)}
           {measurePanelOpen && createPortal(<div data-session-measure-panel className="fixed z-[1100] flex -translate-x-1/2 gap-1 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 shadow-2xl" style={{ left: measurePanelPosition.left, top: measurePanelPosition.top }}>
            {([['line', 'Linea', MeasureLineIcon], ['circle', 'Cerchio', MeasureCircleIcon], ['cone', 'Cono', MeasureConeIcon]] as const).map(([mode, label, Icon]) => <Tooltip key={mode}><TooltipTrigger asChild><button type="button" aria-label={label} aria-pressed={measureMode === mode} onClick={() => setSessionMapMeasureMode(mode as SessionMapMeasureMode)} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${measureMode === mode ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/20 text-[var(--dash-text-strong)]' : 'border-transparent text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]'}`}><Icon data-static-icon={mode === 'line' ? true : undefined} className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="bottom">{label}</TooltipContent></Tooltip>)}
            <Tooltip open={measurementVisibilityTooltipOpen}><TooltipTrigger asChild><button type="button" aria-label={measurementsVisibleToAll ? 'Visibile a tutti' : 'Visibile solo a me'} aria-pressed={!measurementsVisibleToAll} onPointerEnter={() => { measurementVisibilityHoveredRef.current = true; setMeasurementVisibilityTooltipOpen(true); }} onPointerLeave={() => { measurementVisibilityHoveredRef.current = false; setMeasurementVisibilityTooltipOpen(false); }} onFocus={() => setMeasurementVisibilityTooltipOpen(true)} onBlur={() => { if (!measurementVisibilityHoveredRef.current) setMeasurementVisibilityTooltipOpen(false); }} onClick={() => setSessionMapMeasurementsVisibleToAll(!measurementsVisibleToAll)} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${measurementsVisibleToAll ? 'border-transparent text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]' : 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/20 text-[var(--dash-text-strong)]'}`}>{measurementsVisibleToAll ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button></TooltipTrigger><TooltipContent side="bottom">{measurementsVisibleToAll ? 'Visibile a tutti' : 'Visibile solo a me'}</TooltipContent></Tooltip>
           </div>, portalTarget ?? document.body)}
           {drawPanelOpen && createPortal(<div data-session-draw-panel className="fixed left-1/2 top-14 z-[1100] w-[min(94vw,720px)] -translate-x-1/2 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-2 shadow-2xl">
             <div className="flex items-center gap-1">{([['grab', 'Seleziona elemento', MousePointer2], ['freehand', 'Disegno a mano libera', Brush], ['polygon', 'Poligono', PenTool], ['line', 'Linea', Minus], ['rectangle', 'Rettangolo', SquareIcon], ['circle', 'Cerchio', Circle], ['triangle', 'Triangolo', Triangle], ['hexagon', 'Esagono', Hexagon], ['eraser', 'Gomma', Eraser]] as const).map(([mode, label, Icon]) => <Tooltip key={mode}><TooltipTrigger asChild><button type="button" aria-label={label} aria-pressed={drawSettings.mode === mode} onClick={() => { setSessionMapDrawMode(mode as SessionMapDrawMode); setActiveSessionMapTool('draw'); }} className={`grid h-9 w-9 place-items-center rounded-md border ${drawSettings.mode === mode ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/20 text-[var(--dash-text-strong)]' : 'border-transparent text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]'}`}><Icon data-static-icon className="h-4.5 w-4.5" /></button></TooltipTrigger><TooltipContent side="bottom">{label}</TooltipContent></Tooltip>)}<span className="mx-1 h-6 w-px bg-[var(--dash-border-soft)]" /><label className="flex items-center gap-1 text-[10px] text-[var(--dash-muted)]">Linea<input aria-label="Colore linea" type="color" value={drawSettings.style.strokeColor} onChange={event => updateSessionMapDrawStyle({ strokeColor: event.target.value })} className="h-8 w-9 rounded bg-transparent" /></label><label className="flex items-center gap-1 text-[10px] text-[var(--dash-muted)]">Interno<input aria-label="Colore interno" type="color" value={drawSettings.style.fillColor} onChange={event => updateSessionMapDrawStyle({ fillColor: event.target.value })} className="h-8 w-9 rounded bg-transparent" /></label><div data-draw-line-style className="relative ml-1"><Tooltip><TooltipTrigger asChild><button type="button" aria-label={`Stile linea: ${DRAW_LINE_STYLES.find(item => item.value === drawSettings.style.lineStyle)?.label}`} aria-haspopup="listbox" aria-expanded={drawLineStyleOpen} onClick={() => setDrawLineStyleOpen(open => !open)} className="grid h-8 w-24 place-items-center rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-2 hover:border-[var(--dash-accent)]"><svg viewBox="0 0 80 12" className="h-4 w-full" aria-hidden="true"><line x1="2" y1="6" x2="78" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={DRAW_LINE_STYLES.find(item => item.value === drawSettings.style.lineStyle)?.dash} /></svg></button></TooltipTrigger><TooltipContent side="bottom">Stile linea</TooltipContent></Tooltip>{drawLineStyleOpen && <div role="listbox" aria-label="Stile linea disegno" className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1 shadow-xl">{DRAW_LINE_STYLES.map(item => <Tooltip key={item.value}><TooltipTrigger asChild><button type="button" role="option" aria-label={item.label} aria-selected={drawSettings.style.lineStyle === item.value} onClick={() => { updateSessionMapDrawStyle({ lineStyle: item.value }); setDrawLineStyleOpen(false); }} className={`grid h-8 w-full place-items-center rounded px-2 ${drawSettings.style.lineStyle === item.value ? 'bg-[var(--dash-accent)]/20 text-[var(--dash-accent-2)]' : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]'}`}><svg viewBox="0 0 100 12" className="h-4 w-full" aria-hidden="true"><line x1="2" y1="6" x2="98" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={item.dash} /></svg></button></TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip>)}</div>}</div><Tooltip><TooltipTrigger asChild><button type="button" aria-label="Elimina tutti i disegni" onClick={() => setClearDrawingsConfirmOpen(true)} className="ml-auto grid h-9 w-9 place-items-center rounded-md text-red-300 hover:bg-red-500/15"><Trash2 data-static-icon className="h-4.5 w-4.5" /></button></TooltipTrigger><TooltipContent side="bottom">Elimina tutti</TooltipContent></Tooltip></div>
             <div className="mt-2 grid gap-2 border-t border-[var(--dash-border-soft)] pt-2 sm:grid-cols-3">{([['strokeWidth', 'Spessore', 0.5, 32, 0.5, drawSettings.style.strokeWidth], ['opacity', 'Opacità (%)', 0.01, 1, 0.01, drawSettings.style.opacity], ['fillOpacity', 'Riempimento (%)', 0, 1, 0.01, drawSettings.style.fillOpacity]] as const).map(([key, label, min, max, step, value]) => <label key={key} className="relative grid grid-cols-[84px_minmax(80px,1fr)_52px] items-center gap-2 text-[10px] text-[var(--dash-muted)]"><span>{label}</span><span className="relative"><input aria-label={label} title={`${label.replace(' (%)', '')}: ${key === 'strokeWidth' ? value : `${Math.round(Number(value) * 100)}%`}`} type="range" min={min} max={max} step={step} value={value} onPointerDown={() => setActiveDrawSlider(key)} onPointerUp={() => setActiveDrawSlider(null)} onPointerCancel={() => setActiveDrawSlider(null)} onChange={event => updateSessionMapDrawStyle({ [key]: Number(event.target.value) })} className="block w-full accent-[var(--dash-accent)]" />{activeDrawSlider === key && <output className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow" style={{ left: `${(Number(value) - min) / (max - min) * 100}%` }}>{key === 'strokeWidth' ? Number(value).toFixed(1) : `${Math.round(Number(value) * 100)}%`}</output>}</span><input aria-label={`${label} valore`} type="number" min={key === 'strokeWidth' ? min : 0} max={key === 'strokeWidth' ? max : 100} step={key === 'strokeWidth' ? step : 1} value={key === 'strokeWidth' ? value : Math.round(Number(value) * 100)} onChange={event => { const raw = Number(event.target.value); updateSessionMapDrawStyle({ [key]: key === 'strokeWidth' ? Math.min(max, Math.max(min, raw)) : Math.min(1, Math.max(0, raw / 100)) }); }} className="h-7 appearance-none rounded border border-[var(--dash-border)] bg-[var(--dash-input)] px-1.5 text-right text-[11px] text-[var(--dash-text)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /></label>)}</div>
             {clearDrawingsConfirmOpen && <div role="alertdialog" aria-modal="true" aria-label="Conferma eliminazione disegni" className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-black/65 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-4 shadow-2xl"><h3 className="font-semibold text-[var(--dash-text-strong)]">Eliminare tutti i disegni?</h3><p className="mt-1 text-xs text-[var(--dash-muted)]">L’operazione rimuove tutti i disegni del Capitolo corrente.</p><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setClearDrawingsConfirmOpen(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dash-border)] px-3 py-2 text-xs"><X className="h-3.5 w-3.5" />Annulla</button><button type="button" onClick={() => { requestSessionMapDrawingClear(); setClearDrawingsConfirmOpen(false); }} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"><Trash2 className="h-3.5 w-3.5" />Elimina tutti</button></div></div></div>}
           </div>, portalTarget ?? document.body)}
        </div>
      )}

      {/* Search */}
      <div className={`${sessionWorkspaceActive ? 'hidden' : 'flex'} w-48 items-center gap-2 rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-1.5 text-[var(--dash-muted)]`}>
        <Search className="h-4 w-4 shrink-0" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none"
        />
      </div>

      {/* Notifications */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-notification-button
                aria-label={unreadCount > 0 ? 'Nuove Notifiche' : 'Notifiche'}
                className="relative flex items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] p-2 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)]"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--dash-danger-border)]" />
                )}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{unreadCount > 0 ? 'Nuove Notifiche' : 'Notifiche'}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          className="w-80 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-0 text-[var(--dash-text)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--dash-border-soft)] px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--dash-muted)]">Notifiche</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="text-xs text-[var(--dash-accent)] hover:underline"
              >
                Segna tutte come lette
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[var(--dash-muted)]">Nessuna notifica</p>
            ) : (
              notifications.map((n) => <NotificationRowItem key={n.id} notification={n} />)
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User */}
      <div ref={userMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setIsUserMenuOpen(open => !open)}
          className="flex items-center gap-2 rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface)] px-2 py-1 transition-colors hover:text-[var(--dash-text)]"
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--dash-accent)] text-xs font-semibold text-[var(--dash-text-strong)]">
              {initials}
            </span>
          )}
          <span className="text-sm text-[var(--dash-text)]">{displayName}</span>
          <span data-account-menu-dots className="grid h-5 w-5 place-items-center">
            <MoreVertical className="h-3.5 w-3.5 text-[var(--dash-muted)]" />
          </span>
        </button>

        {isUserMenuOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[160px] rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] py-1 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                window.open('/news', '_blank');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              <Newspaper className="h-4 w-4" /> News e Novità
            </button>
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                onReportBug();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              <Bug className="h-4 w-4" /> Segnala un Bug
            </button>
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                onOpenSettings('general');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              <Settings className="h-4 w-4" /> Impostazioni
            </button>
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              <LogOut className="h-4 w-4" /> Esci
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
