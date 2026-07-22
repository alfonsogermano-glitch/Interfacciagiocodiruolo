import { useState, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  Play, Square, Loader2, AlertTriangle, Users, Ghost, Skull,
  KeyRound, Check, MoreVertical, Pencil, Copy, CopyPlus, UserCog, FileDown, Trash2, UserMinus, Undo2,
  LayoutGrid, Package, FolderPlus, FolderTree, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCampaign } from './CampaignContext';
import { useCampaignChannel } from '../../services/realtime/campaignChannel';
import {
  loadCharactersByOwner, copyCharacterToCampaign, unassignCharacterFromCampaign,
  duplicateCharacter, deleteCharacter, setCharacterAvailableForPlayers, releaseCharacter,
  saveCharacter as saveCharacterToSupabase, saveCharacterAsGm, deleteCharacterAsGm, mapRowToCharacter,
} from '../../services/supabase/charactersService';
import {
  loadNPCs, loadMonsters, saveNPC, saveMonster, type NPC, type Monster,
  duplicateNPC, deleteNPC, unassignNPCFromCampaign, copyNPCToCampaign,
  duplicateMonster, deleteMonster, unassignMonsterFromCampaign, copyMonsterToCampaign,
} from '../../services/supabase/entitiesService';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { EntityCard } from '../components/session/shared/EntityCard';
import { EntityKebabMenu, type EntityKebabMenuItem } from '../components/session/shared/EntityKebabMenu';
import { CampaignNotesPanel } from '../components/session/shared/CampaignNotesPanel';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { usePortalContainer } from '../components/ui/portal-container';
import { CampaignForm } from './CampaignSelector';
import { CampaignCoverEditor, type CampaignCoverPatch } from './CampaignCoverEditor';
import { InviteByNameModal } from './InviteByNameModal';
import { isRulesetCompatible, type CampaignCreateInput, type RulesetId } from './campaignTypes';
import type { TokenBorderStyle, TokenBorderThickness } from '../../types/tokenStyle';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { FolderIconPicker } from '../components/shared/FolderIconPicker';
import { getFolderIconComponent } from '../components/shared/folderIconCatalog';
import { Switch } from '../components/ui/switch';
import {
  loadFolders, createFolder, renameFolder, reorderFolder, deleteFolder, deleteFolderCascade, setCharacterFolder, setFolderParent, setFolderIcon,
  getFolderDepth, isValidFolderNestTarget, MAX_FOLDER_DEPTH,
  type Folder, type FolderEntityType,
} from '../../services/supabase/foldersService';
import { useFolderDragDrop, UNFILED_DROP_ID, reorderIds, type FolderDropTarget } from '../components/session/shared/useFolderDragDrop';
import { CharacterCreationWizard } from '../components/gm/CharacterCreationWizard';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../components/ui/paletteColors';
import type { Character } from '../../types/character';

// Stessa funzione di MyCharactersPage.tsx (non condivisa in un modulo a
// parte: e' un one-liner che legge il DOM, non vale la pena un import
// incrociato tra le due pagine per questo).
function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

const photoCornerButtonClass =
  'rounded-lg bg-black/40 p-1 text-white/80 transition-colors hover:bg-black/60 hover:text-white';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;
const AUTO_CLOSE_AFTER_MS = 60 * 60 * 1000; // 1 ora

// Stessa forma del "selected" interno di SessionCharactersPanel.tsx - usata
// per chiedere l'apertura del pannello "Schede" (SessionRightSidebar, gia'
// montata come rightSidebar di AppShell nella vista campagna) con
// un'entita' specifica pre-selezionata, invece di costruire un pannello
// dedicato qui.
export type SessionEntityOpenRequest = { kind: 'pg' | 'png' | 'mostro'; id: string; requestId: number };

interface CampaignHomeProps {
  onGoToManagement: () => void;
  onOpenSessionEntity: (kind: 'pg' | 'png' | 'mostro', id: string) => void;
}

type PlayerCharacterSummary = {
  id: string;
  name: string;
  ownerProfileId: string;
  ruleset: RulesetId | null;
  createdAt: string | null;
  portraitUrl: string | null;
  portraitSourceUrl: string | null;
  portraitCropArea: { x: number; y: number; width: number; height: number } | null;
  styleViaggio: string;
  description: string;
  ownerAvatarUrl: string | null;
  tokenColor: string | null;
  tokenBackgroundColor: string | null;
  tokenBorderStyle: TokenBorderStyle | null;
  tokenBorderThickness: TokenBorderThickness | null;
  tokenBorderVisible: boolean | null;
  tokenBorderLabel: string | null;
  // Servono per le condizioni del menu ⋮ (Disponibile per i giocatori,
  // Rilascia al GM) - gia' presenti nella risposta grezza di
  // GET /campaigns/:id/characters (select("*") lato server), qui solo
  // mappati per la prima volta.
  campaignId: string | null;
  claimableOrigin: boolean;
  originalOwnerProfileId: string | null;
  availableForPlayers: boolean;
  folderId: string | null;
};

type PlayerRow = {
  profileId: string;
  displayName: string | null;
  joinedAt: string | null;
  characters: PlayerCharacterSummary[];
};

type QuickFilter = 'all' | 'pg' | 'premades' | 'npc' | 'monster';

// Stesso helper di pillClass() in MyCharactersPage.tsx - riuso lo stile
// (non l'implementazione, e' una funzione locale non esportata li' anche).
function pillClass(active: boolean) {
  return `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
      : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
  }`;
}

// Riga in cima a ciascuna delle 4 sezioni della griglia: icona+etichetta
// (era gia' presente per PNG/Mostri come <h2 col-span-2>, ma solo quando
// activeQuickFilter === 'all' - qui invece sempre visibile e uniformata
// anche a Personaggi/Precompilati, che prima non avevano alcuna
// intestazione) + pulsante "Nuova cartella", solo GM (le cartelle sono
// gestite solo dal GM, visibili identiche a tutti - vedi piano Fase 2).
function FolderSectionHeader({
  icon: Icon, label, isOwner, onCreateFolder, disabledReason = null,
}: {
  icon: typeof Users;
  label: string;
  isOwner: boolean;
  /** Assente = nessun pulsante "Nuova cartella" (es. vista piatta "Tutti",
   *  o sezione Personaggi che non ha mai cartelle) - solo icona+etichetta. */
  onCreateFolder?: () => void;
  /** null = pulsante attivo; stringa = disabilitato, mostrata nel tooltip
   *  al posto di "Nuova cartella" (limite di annidamento, vedi
   *  MAX_FOLDER_DEPTH in foldersService.ts). */
  disabledReason?: string | null;
}) {
  return (
    // min-h-8 (32px, l'altezza con pulsante): senza, la riga sarebbe alta
    // solo 20px (il testo) quando il pulsante non compare (non-owner, o
    // sezioni come Personaggi che non ne hanno mai uno) - un salto di 8px
    // ogni volta che si passa da una vista all'altra. Altezza fissa qui +
    // stesso spaziatore costante in colonna 1 (vedi activeSectionHeaderSpacerClass)
    // elimina il salto invece di ammorbidirlo con una transizione.
    <div className="col-span-2 flex min-h-8 items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--dash-muted)]">
        <Icon className="h-4 w-4" /> {label}
      </h2>
      {isOwner && onCreateFolder && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCreateFolder}
              disabled={disabledReason !== null}
              aria-label="Nuova cartella"
              className={`flex items-center rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1.5 text-[var(--dash-muted)] transition-colors ${
                disabledReason !== null ? 'cursor-not-allowed opacity-40' : 'hover:text-[var(--dash-text-strong)]'
              }`}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{disabledReason ?? 'Nuova cartella'}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// Riga di una singola cartella (drill-down: click = entra dentro, il
// contenuto della cartella sostituisce la vista invece di espandersi sotto -
// vedi FolderBreadcrumb per la navigazione di ritorno). data-folder-id +
// data-folder-entity-type sono gli hook per useFolderDragDrop - vedi il
// commento su resolveFolderDropTarget in useFolderDragDrop.ts per il perche'
// serve anche l'entity-type (le 4 sezioni condividono lo stesso containerRef).
// Rinomina inline al click sul nome: stesso pattern di renamingTabId/
// renameDraft in useEntityTabs.ts (autoFocus, Enter conferma, Escape annulla,
// blur conferma).
function FolderRow({
  folder, onEnter, count, subfolderCount, canEdit, isRenaming, renameDraft, onRenameDraftChange,
  onStartRename, onCommitRename, onCancelRename, onRequestDelete, onOpenIconPicker, onPointerDown, dropState, isDimmed,
}: {
  folder: Folder;
  /** Naviga dentro la cartella (drill-down) - visibile/utilizzabile anche
   *  da chi non puo' modificare (sola lettura puo' comunque sfogliare). */
  onEnter: () => void;
  count: number;
  /** Conteggio ricorsivo delle sole sotto-cartelle (a qualunque profondita'),
   *  gia' calcolato da countFolderContentsRecursive insieme a count ma
   *  prima scartato qui - 0 = nessun'icona, per non appesantire la riga
   *  delle cartelle-foglia (la maggioranza). */
  subfolderCount: number;
  canEdit: boolean;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRequestDelete: () => void;
  /** Apre FolderIconPicker per questa cartella - assente/non chiamato se
   *  !canEdit (icona non cliccabile per chi non puo' modificare). */
  onOpenIconPicker: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  /** 'valid'/'invalid' solo mentre e' il bersaglio di un drag di CARTELLA in
   *  corso (vedi isValidFolderNestTarget in foldersService.ts) - un drag di
   *  CARD e' sempre 'valid' quando e' sopra questa riga (le card non hanno
   *  vincoli di profondita'/ciclo). 'none' se questa riga non e' il
   *  bersaglio corrente. */
  dropState: 'none' | 'valid' | 'invalid';
  /** Attenuata mentre e' proprio questa cartella a essere trascinata -
   *  stesso valore (opacity-40) gia' usato per le tab in EntityTabBar.tsx. */
  isDimmed: boolean;
}) {
  return (
    <div
      data-folder-id={folder.id}
      data-folder-entity-type={folder.entityType}
      onPointerDown={canEdit ? onPointerDown : undefined}
      className={`group col-span-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
        dropState === 'valid'
          ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/10'
          : dropState === 'invalid'
          ? 'border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)]'
          : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)]'
      } ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${isDimmed ? 'opacity-40' : ''}`}
    >
      <button type="button" onClick={onEnter} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {(() => {
          const Icon = getFolderIconComponent(folder.icon);
          // <span>, non <button>: siamo gia' dentro il <button onEnter>
          // sopra (un <button> annidato non e' HTML valido) - stesso schema
          // gia' usato dal nome poco sotto per il rinomina-al-click.
          return canEdit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-no-drag
                  onClick={(e) => { e.stopPropagation(); onOpenIconPicker(); }}
                  className="shrink-0 rounded p-0.5 text-[var(--dash-accent-2)] transition-colors hover:bg-[var(--dash-surface-2)]"
                >
                  <Icon className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Cambia icona</TooltipContent>
            </Tooltip>
          ) : (
            <Icon className="h-4 w-4 shrink-0 text-[var(--dash-accent-2)]" />
          );
        })()}
        {isRenaming ? (
          <input
            type="text"
            autoFocus
            data-no-drag
            value={renameDraft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            className="w-40 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-input)] px-2 py-1 text-sm text-[var(--dash-text)]"
          />
        ) : (
          <span
            className="truncate text-sm font-medium text-[var(--dash-text-strong)]"
            onClick={canEdit ? (e) => { e.stopPropagation(); onStartRename(); } : undefined}
          >
            {folder.name}
          </span>
        )}
        <span className="shrink-0 text-xs text-[var(--dash-muted)]">({count})</span>
        {subfolderCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <FolderTree className="h-3 w-3 shrink-0 text-[var(--dash-muted)]" />
            </TooltipTrigger>
            <TooltipContent side="top">
              {subfolderCount === 1 ? 'Contiene 1 sotto-cartella' : `Contiene ${subfolderCount} sotto-cartelle`}
            </TooltipContent>
          </Tooltip>
        )}
      </button>
      {canEdit && !isRenaming && (
        <button
          type="button"
          data-no-drag
          onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
          className="shrink-0 rounded p-1 text-[var(--dash-muted)] opacity-0 transition-opacity hover:text-[var(--dash-danger-text)] group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--dash-muted)]" />
    </div>
  );
}

// Calcola se questa riga cartella e' il bersaglio corrente di un drag e,
// se lo e', se il drop sarebbe valido - usata sia per lo stile (verde/rosso
// durante il drag) sia, con la stessa funzione isValidFolderNestTarget, come
// guardia finale prima di inviare la richiesta in handleNestFolder: un solo
// punto di verita' chiamato in due momenti diversi del ciclo di vita del drag.
function computeFolderRowDropState(
  dnd: { draggedItem: { kind: 'folder' | 'card'; id: string } | null; dropTarget: { type: string; folderId?: string } | null },
  folder: Folder,
  foldersById: Map<string, Folder>,
): 'none' | 'valid' | 'invalid' {
  const target = dnd.dropTarget;
  if (!target || (target.type !== 'into-folder' && target.type !== 'nest-into-folder') || target.folderId !== folder.id) {
    return 'none';
  }
  if (dnd.draggedItem?.kind !== 'folder') return 'valid'; // card: nessun vincolo di profondita'/ciclo
  return isValidFolderNestTarget(dnd.draggedItem.id, folder.id, foldersById) ? 'valid' : 'invalid';
}

// Striscia "Senza cartella": bersaglio esplicito per togliere una card da
// una cartella (invece di rendere tutta l'area sparsa delle card sciolte un
// hit-target implicito, che avrebbe richiesto di avvolgerle in un unico div
// e romperebbe il flusso a griglia condiviso - vedi piano Fase 2). Mostrata
// solo se la sezione ha almeno una cartella: con zero cartelle tutte le card
// sono gia' banalmente "sciolte", nessun'etichetta serve.
// (Fase 7 aveva aggiunto una zona gemella dentro le cartelle stesse
// ("Rimuovi da questa cartella") - rimossa: il drag sul breadcrumb copre la
// stessa necessita' in modo piu' naturale, senza un elemento dedicato in piu'.)
function UnfiledDropZone({ entityType, isDropActive }: { entityType: FolderEntityType; isDropActive: boolean }) {
  return (
    <div
      data-folder-id={UNFILED_DROP_ID}
      data-folder-entity-type={entityType}
      className={`col-span-2 rounded-lg border border-dashed px-3 py-1.5 text-[11px] uppercase tracking-wide transition-colors ${
        isDropActive ? 'border-[var(--dash-accent)] text-[var(--dash-accent-2)]' : 'border-[var(--dash-border-soft)] text-[var(--dash-muted)]'
      }`}
    >
      Senza cartella
    </div>
  );
}

// Catena radice→corrente (esclusa la radice, rappresentata dall'etichetta
// di sezione nel breadcrumb) per il drill-down - si ferma anche su un id
// stantio (es. cartella cancellata altrove) invece di andare in loop o
// lanciare, il breadcrumb si tronca semplicemente li'.
function getFolderPath(folderId: string | null, foldersById: Map<string, Folder>): Folder[] {
  const path: Folder[] = [];
  let current = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    const folder = foldersById.get(current);
    if (!folder) break;
    path.unshift(folder);
    seen.add(current);
    current = folder.parentFolderId;
  }
  return path;
}

// Un antenato del currentFolderId e' per costruzione anche antenato della
// cartella/card trascinata (figlia diretta di currentFolderId) - spostare
// qualcosa verso un proprio antenato non puo' mai creare un ciclo ne'
// violare MAX_FOLDER_DEPTH (si va sempre piu' superficiali). Il guardiano
// generico in handleNestFolder resta comunque attivo, ridondante ma innocuo.
function isBreadcrumbDropActive(dropTarget: FolderDropTarget | null, folderId: string): boolean {
  if (!dropTarget) return false;
  if (folderId === UNFILED_DROP_ID) return dropTarget.type === 'unfiled';
  return (dropTarget.type === 'into-folder' || dropTarget.type === 'nest-into-folder') && dropTarget.folderId === folderId;
}

// Percorso di navigazione del drill-down - non lo shadcn ui/breadcrumb.tsx
// (mai usato altrove in questo file, usa classi generiche text-muted-
// foreground/text-foreground invece delle var(--dash-*) di palette usate
// ovunque qui) - stesso idioma "div a mano con var(--dash-*)" del resto del
// file. Nascosto alla radice (path vuoto), ridondante con l'etichetta di
// FolderSectionHeader.
// Da Fase 7 anche bersaglio di drop (unico modo per portare una card/
// cartella fuori da una cartella annidata, non c'e' piu' una zona dedicata
// separata - vedi Fase 8) - tranne l'ultimo segmento (la cartella corrente,
// in grassetto): rilasciare li' sarebbe un no-op visibile (sei gia' dentro
// quella cartella). "Risali di un livello" resta comunque sempre
// raggiungibile in un solo gesto: il penultimo segmento (o la radice, se
// si e' annidati un solo livello) e' per costruzione il genitore diretto
// della cartella corrente.
function FolderBreadcrumb({
  sectionLabel, path, entityType, dropTarget, onNavigate,
}: {
  sectionLabel: string;
  path: Folder[];
  entityType: FolderEntityType;
  dropTarget: FolderDropTarget | null;
  onNavigate: (folderId: string | null) => void;
}) {
  return (
    <div className="col-span-2 flex flex-wrap items-center gap-1 text-xs text-[var(--dash-muted)]">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onNavigate(null)}
            data-folder-id={UNFILED_DROP_ID}
            data-folder-entity-type={entityType}
            data-folder-breadcrumb="true"
            className={`transition-colors ${
              isBreadcrumbDropActive(dropTarget, UNFILED_DROP_ID) ? 'text-[var(--dash-accent-2)]' : 'hover:text-[var(--dash-text-strong)]'
            }`}
          >
            {sectionLabel}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Sposta qui</TooltipContent>
      </Tooltip>
      {path.map((folder, idx) => {
        const isCurrent = idx === path.length - 1;
        const button = (
          <button
            type="button"
            onClick={() => onNavigate(folder.id)}
            {...(isCurrent ? {} : {
              'data-folder-id': folder.id,
              'data-folder-entity-type': entityType,
              'data-folder-breadcrumb': 'true',
            })}
            className={`truncate transition-colors ${
              isCurrent
                ? 'font-semibold text-[var(--dash-text-strong)]'
                : isBreadcrumbDropActive(dropTarget, folder.id)
                ? 'text-[var(--dash-accent-2)]'
                : 'hover:text-[var(--dash-text-strong)]'
            }`}
          >
            {folder.name}
          </button>
        );
        return (
          <Fragment key={folder.id}>
            <ChevronRight className="h-3 w-3 shrink-0" />
            {isCurrent ? button : (
              <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="top">Sposta qui</TooltipContent>
              </Tooltip>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// Ghost visivo simulato via portal (Fase 5) - stesso principio del ghost
// nativo di DraggablePortrait.tsx (nodo fuori flusso via createPortal), ma
// riposizionato manualmente a ogni pointermove invece di affidarsi a
// dataTransfer.setDragImage (API nativa, non applicabile al drag
// pointer-based usato qui - vedi indagine sul feedback visivo di drag).
// Riceve solo dati grezzi dall'hook (draggedItem/pointerPosition) piu'
// folders/items del chiamante e decide da solo cosa disegnare - l'hook
// resta "solo meccanica", questo componente resta agnostico rispetto alla
// forma di T (stesso principio di renderCard in renderFolderedSection).
//
// Portato su usePortalContainer() (il nodo [data-dashboard-palette] di
// AppShell.tsx) invece che su document.body: cosi' le classi Tailwind
// var(--dash-*) usate da EntityCard arrivano per cascata e non serve piu'
// l'hack dei colori inline usato qui prima di riusare EntityCard (stesso
// bug gia' diagnosticato per il menu ⋮ invisibile, vedi portal-container.tsx
// - stesso hook gia' usato da EntityTabBar.tsx per il suo menu portato).
function DragGhost<T extends { id: string }>({
  dnd, folders, items, renderCard,
}: {
  dnd: ReturnType<typeof useFolderDragDrop>;
  folders: Folder[];
  items: T[];
  renderCard: (item: T) => React.ReactNode;
}) {
  const portalContainer = usePortalContainer();
  if (!dnd.draggedItem || !dnd.pointerPosition) return null;

  const content = dnd.draggedItem.kind === 'folder' ? (() => {
    const folder = folders.find((f) => f.id === dnd.draggedItem!.id);
    if (!folder) return null;
    const Icon = getFolderIconComponent(folder.icon);
    return (
      <div className="flex max-w-[220px] items-center gap-1.5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-2.5 py-1.5 text-xs font-medium text-[var(--dash-text)] opacity-90 shadow-2xl">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{folder.name}</span>
      </div>
    );
  })() : (() => {
    const item = items.find((it) => it.id === dnd.draggedItem!.id);
    if (!item) return null;
    // Card completa in miniatura, non la sola etichetta - il box foto di
    // EntityCard (variant grid) e' a larghezza fissa (140px) indipendente
    // dal contenitore, quindi per restringere il ghost si scala l'intera
    // card invece di dargli una larghezza piccola (altrimenti la foto
    // dominerebbe lo spazio, sproporzionata rispetto al testo).
    return (
      <div className="w-[280px] origin-top-left scale-[0.65] overflow-hidden rounded-2xl opacity-80 shadow-2xl">
        {renderCard(item)}
      </div>
    );
  })();

  if (!content) return null;

  return createPortal(
    <div
      style={{ position: 'fixed', left: dnd.pointerPosition.x + 14, top: dnd.pointerPosition.y + 14, zIndex: 2000 }}
      className="pointer-events-none"
    >
      {content}
    </div>,
    portalContainer ?? document.body
  );
}

export function CampaignHome({ onGoToManagement, onOpenSessionEntity }: CampaignHomeProps) {
  const { user, session } = useAuth();
  const { activeCampaign, campaigns, joinedCampaigns, refreshCampaigns, refreshJoinedCampaigns, updateCampaign, deleteCampaign, generateInviteCode } = useCampaign();

  const [isToggling, setIsToggling] = useState(false);
  const [gmOnline, setGmOnline] = useState(false);
  const [localSessionActive, setLocalSessionActive] = useState<boolean | null>(null);
  const [ownCharacterId, setOwnCharacterId] = useState<string | null>(null);
  const [characterLookupDone, setCharacterLookupDone] = useState(false);
  const [autoClosedNotice, setAutoClosedNotice] = useState(false);
  const autoCloseCheckedRef = useRef(false);
  const [gmDisplayName, setGmDisplayName] = useState<string | null>(null);
  const [gmAvatarUrl, setGmAvatarUrl] = useState<string | null>(null);
  const [playerRows, setPlayerRows] = useState<PlayerRow[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  // "Precompilati": PG del GM (available_for_players=true) - esclusi di
  // proposito da playerRows sopra (quello raggruppa solo per membro non-GM,
  // vedi il filtro su activeCampaign.ownerId piu' sotto), quindi vanno tenuti
  // a parte qui dalla stessa risposta /campaigns/:id/characters.
  const [availablePremades, setAvailablePremades] = useState<PlayerCharacterSummary[]>([]);
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [npcsLoaded, setNpcsLoaded] = useState(false);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [monstersLoaded, setMonstersLoaded] = useState(false);

  // ─── Cartelle (sistema di organizzazione Precompilati/PNG/Mostri) ───
  // Un array per sezione (namespace 'premade'/'npc'/'monster' - vedi
  // supabase-add-folders.sql), mai mescolati tra loro: una cartella non
  // compare mai in una sezione diversa da quella in cui e' stata creata.
  // 'character' rimosso dalla UI (i PG normali sono tornati al
  // comportamento pre-cartelle) ma resta un entity_type valido nello
  // schema/tipo - eventuali cartelle 'character' create durante i test
  // restano nel DB, orfane e senza piu' UI, innocue (nessun trigger le
  // tocca finche' nessuno aggiorna quelle righe).
  const [premadeFolders, setPremadeFolders] = useState<Folder[]>([]);
  const [npcFolders, setNpcFolders] = useState<Folder[]>([]);
  const [monsterFolders, setMonsterFolders] = useState<Folder[]>([]);
  // "Dove sono" per sezione (drill-down: sostituisce il vecchio
  // espandi/collassa ad albero) - null = radice della sezione. 3 variabili
  // indipendenti, stesso motivo di premadeFolders/npcFolders/monsterFolders
  // sopra: mai un unico Record condiviso, sezioni diverse non devono potersi
  // confondere concettualmente anche se qui non collidono comunque (id UUID).
  const [premadeCurrentFolderId, setPremadeCurrentFolderId] = useState<string | null>(null);
  const [npcCurrentFolderId, setNpcCurrentFolderId] = useState<string | null>(null);
  const [monsterCurrentFolderId, setMonsterCurrentFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState('');
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  // Deselezionata di default ogni volta che si apre il dialog: comportamento
  // invariato (solo unlink, vedi handleConfirmDeleteFolder) a meno che il GM
  // non la spunti esplicitamente per l'eliminazione a cascata.
  const [deleteFolderCascadeContent, setDeleteFolderCascadeContent] = useState(false);
  // setFolders catturato insieme alla cartella al momento dell'apertura
  // (onOpenIconPicker in FolderRow) - vedi handleSelectFolderIcon.
  const [iconPickerTarget, setIconPickerTarget] = useState<{ folder: Folder; setFolders: React.Dispatch<React.SetStateAction<Folder[]>> } | null>(null);

  const [inviteCopied, setInviteCopied] = useState(false);
  const [showInviteByNameModal, setShowInviteByNameModal] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>('all');
  const [copyDialogChar, setCopyDialogChar] = useState<PlayerCharacterSummary | null>(null);
  const [copyTargetCampaignId, setCopyTargetCampaignId] = useState<string | null>(null);
  const [isCopyingChar, setIsCopyingChar] = useState(false);
  const [copyCharError, setCopyCharError] = useState<string | null>(null);
  const [removePlayerTarget, setRemovePlayerTarget] = useState<PlayerRow | null>(null);
  const [isRemovingPlayer, setIsRemovingPlayer] = useState(false);
  const [removePlayerError, setRemovePlayerError] = useState<string | null>(null);
  // Bump per forzare un refetch di PG/PNG/Mostri dopo copia/rimozione dal
  // menu delle card, o dopo un evento members_change dal canale condiviso.
  const [playersReloadToken, setPlayersReloadToken] = useState(0);
  // Righe grezze (select("*") originale) dietro a playerRows/availablePremades -
  // PlayerCharacterSummary e' troppo leggero per precompilare il wizard di
  // modifica (mancano ambiti/abilita/equipaggiamento/etc.), quindi "Modifica"
  // pesca da qui e mappa con mapRowToCharacter solo quando serve davvero.
  const [charactersRaw, setCharactersRaw] = useState<any[]>([]);

  // ─── Menu ⋮ condiviso (EntityKebabMenu) sulle card PG/precompilati/PNG/Mostri ───
  const [menuColors, setMenuColors] = useState(() => getCurrentPaletteColors());
  const [editingCharacter, setEditingCharacter] = useState<ReturnType<typeof mapRowToCharacter> | null>(null);
  const [deleteCharTarget, setDeleteCharTarget] = useState<PlayerCharacterSummary | null>(null);
  const [isDeletingChar, setIsDeletingChar] = useState(false);
  const [releaseCharTarget, setReleaseCharTarget] = useState<PlayerCharacterSummary | null>(null);
  const [isReleasingChar, setIsReleasingChar] = useState(false);
  // Rimuove solo questo PG dalla campagna (il giocatore resta membro con
  // eventuali altri suoi PG) - distinta da removePlayerTarget piu' sotto,
  // che rimuove tutti i PG del giocatore piu' la membership. Solo GM (isOwner).
  const [unassignCharTarget, setUnassignCharTarget] = useState<PlayerCharacterSummary | null>(null);
  const [isUnassigningChar, setIsUnassigningChar] = useState(false);
  // Elimina/Rimuovi/Copia per PNG e Mostri - tagged union invece di 6 stati
  // separati (uno per azione x tipo): stessa forma per entrambi i tipi,
  // nessuna differenza di comportamento tra i due se non la funzione service
  // da chiamare.
  const [deleteEntityTarget, setDeleteEntityTarget] = useState<{ kind: 'npc' | 'monster'; id: string; name: string } | null>(null);
  const [isDeletingEntity, setIsDeletingEntity] = useState(false);
  const [unassignEntityTarget, setUnassignEntityTarget] = useState<{ kind: 'npc' | 'monster'; id: string; name: string } | null>(null);
  const [isUnassigningEntity, setIsUnassigningEntity] = useState(false);
  const [copyEntityDialog, setCopyEntityDialog] = useState<{ kind: 'npc' | 'monster'; id: string; name: string; ruleset: RulesetId | null } | null>(null);
  const [copyEntityTargetId, setCopyEntityTargetId] = useState<string | null>(null);
  const [isCopyingEntity, setIsCopyingEntity] = useState(false);
  const [copyEntityError, setCopyEntityError] = useState<string | null>(null);

  const lookupSeqRef = useRef(0);
  const isOwner = activeCampaign?.ownerId === user?.id;
  const sessionActive = localSessionActive ?? !!activeCampaign?.sessionActive;

  useEffect(() => {
    setLocalSessionActive(activeCampaign?.sessionActive ?? false);
  }, [activeCampaign?.id, activeCampaign?.sessionActive]);

  useEffect(() => {
    if (!activeCampaign?.id) return;
    const promise = isOwner ? refreshCampaigns() : refreshJoinedCampaigns();
    void promise;
  }, [activeCampaign?.id, isOwner]);

  // Il GM, al rientro, verifica se una sessione è rimasta attiva troppo a
  // lungo (es. ha chiuso il browser senza terminarla esplicitamente) e la
  // chiude automaticamente, senza intaccare le disconnessioni brevi/pausa
  useEffect(() => {
    if (!isOwner || !activeCampaign?.id || autoCloseCheckedRef.current) return;
    if (!activeCampaign.sessionActive) return;

    const activatedAt = activeCampaign.sessionActivatedAt ? new Date(activeCampaign.sessionActivatedAt).getTime() : null;
    if (!activatedAt) return;

    autoCloseCheckedRef.current = true;

    if (Date.now() - activatedAt > AUTO_CLOSE_AFTER_MS) {
      const accessToken = session?.access_token ?? publicAnonKey;
      fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ active: false }),
      })
        .then(() => {
          setLocalSessionActive(false);
          setAutoClosedNotice(true);
          void refreshCampaigns();
        })
        .catch(err => console.error('Errore chiusura automatica sessione:', err));
    }
  }, [isOwner, activeCampaign?.id, activeCampaign?.sessionActive, activeCampaign?.sessionActivatedAt, session]);

  // Trova il proprio personaggio in questa campagna (solo per i giocatori)
  useEffect(() => {
    const mySeq = ++lookupSeqRef.current;

    if (isOwner) {
      setOwnCharacterId(null);
      setCharacterLookupDone(true);
      return;
    }
    if (!user?.id || !activeCampaign?.id) {
      setCharacterLookupDone(false);
      return;
    }
    setCharacterLookupDone(false);
    loadCharactersByOwner(user.id)
      .then(chars => {
        if (lookupSeqRef.current !== mySeq) return;
        const mine = chars.find(c => c.campaignId === activeCampaign.id);
        setOwnCharacterId(mine?.id ?? null);
        setCharacterLookupDone(true);
      })
      .catch(err => {
        console.error('Errore nel caricamento dei personaggi:', err);
      });
  }, [isOwner, user?.id, activeCampaign?.id]);

  // Sezione "Players": combina /characters (PG gia' arricchiti con
  // owner_display_name/owner_avatar_url lato server) e /member-names
  // (roster completo dei membri, incluso chi non ha ancora un PG). Il GM
  // non e' mai tra i membri (si unisce solo chi fa "join"), quindi il suo
  // nome arriva separato come ownerDisplayName.
  useEffect(() => {
    if (!activeCampaign?.id || !session) return;
    let cancelled = false;
    setPlayersLoaded(false);

    (async () => {
      try {
        const accessToken = session.access_token;
        const [charsRes, memberNamesRes] = await Promise.all([
          fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/characters`, { headers: { Authorization: `Bearer ${accessToken}` } }),
          fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/member-names`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        ]);
        if (cancelled) return;
        const charsData = charsRes.ok ? await charsRes.json() : { characters: [] };
        const memberNamesData = memberNamesRes.ok ? await memberNamesRes.json() : { members: [], ownerDisplayName: null };
        if (cancelled) return;

        const characters = charsData.characters ?? [];
        setCharactersRaw(characters);
        // Il GM ha gia' la propria riga dedicata (badge "GM") indipendentemente
        // dal fatto che possieda un PG - va escluso qui, all'ingresso
        // dell'unione, cosi' non puo' ricomparire ne' come membro ne' come
        // "orfano" piu' sotto, qualunque sia la provenienza del suo profileId.
        const members: { profileId: string; displayName: string | null; joinedAt: string | null }[] = (memberNamesData.members ?? [])
          .filter((m: any) => m.profileId !== activeCampaign.ownerId);

        const toCharacterSummary = (ch: any): PlayerCharacterSummary => ({
          id: ch.id,
          name: ch.name,
          ownerProfileId: ch.owner_profile_id,
          ruleset: ch.ruleset ?? null,
          createdAt: ch.created_at ?? null,
          portraitUrl: ch.portrait_image_url ?? null,
          portraitSourceUrl: ch.portrait_source_image_url ?? null,
          portraitCropArea: ch.portrait_crop_area ?? null,
          // stesso formato di MyCharactersPage.tsx:463 ({style} · {viaggio})
          styleViaggio: [ch.style, ch.viaggio].filter(Boolean).join(' · ') || 'Personaggio',
          description: ch.sheet_data?.description ?? '',
          ownerAvatarUrl: ch.owner_avatar_url ?? null,
          tokenColor: ch.token_color ?? null,
          tokenBackgroundColor: ch.token_background_color ?? null,
          tokenBorderStyle: ch.token_border_style ?? null,
          tokenBorderThickness: ch.token_border_thickness ?? null,
          tokenBorderVisible: ch.token_border_visible ?? null,
          tokenBorderLabel: ch.token_border_label ?? null,
          campaignId: ch.campaign_id ?? null,
          claimableOrigin: ch.claimable_origin ?? false,
          originalOwnerProfileId: ch.original_owner_profile_id ?? null,
          availableForPlayers: ch.available_for_players ?? false,
          folderId: ch.folder_id ?? null,
        });

        const charsByOwner = new Map<string, PlayerCharacterSummary[]>();
        for (const ch of characters) {
          const ownerId = ch.owner_profile_id;
          if (!ownerId) continue;
          const list = charsByOwner.get(ownerId) ?? [];
          list.push(toCharacterSummary(ch));
          charsByOwner.set(ownerId, list);
        }

        // Unione tra membri noti e proprietari di PG non (piu') tra i membri
        // (es. rimosso dalla campagna ma PG non riassegnato) - nessun PG va perso.
        const knownIds = new Set(members.map((m) => m.profileId));
        const orphanOwnerIds = Array.from(charsByOwner.keys()).filter(
          (id) => id !== activeCampaign.ownerId && !knownIds.has(id)
        );

        setPlayerRows([
          ...members.map((m) => ({ profileId: m.profileId, displayName: m.displayName, joinedAt: m.joinedAt, characters: charsByOwner.get(m.profileId) ?? [] })),
          ...orphanOwnerIds.map((id) => ({ profileId: id, displayName: null, joinedAt: null, characters: charsByOwner.get(id) ?? [] })),
        ]);
        // PG del GM (owner_profile_id = GM) marcati disponibili - esclusi di
        // proposito da playerRows sopra, che raggruppa solo per membro non-GM.
        setAvailablePremades(
          characters
            .filter((ch: any) => ch.owner_profile_id === activeCampaign.ownerId && ch.available_for_players)
            .map(toCharacterSummary)
        );
        setGmDisplayName(memberNamesData.ownerDisplayName ?? null);
        setGmAvatarUrl(memberNamesData.ownerAvatarUrl ?? null);
      } catch (err) {
        console.error('Errore nel caricamento della sezione Players:', err);
      } finally {
        if (!cancelled) setPlayersLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  // session?.user?.id, non session intero: la libreria Supabase riemette un
  // nuovo riferimento di sessione ad ogni ritorno in foreground della tab
  // (vedi campaignChannel.ts/GoTrueClient - _recoverAndRefresh chiama
  // sempre _notifyAllSubscribers anche a token non vicino a scadenza), anche
  // senza un vero cambio di utente. Con l'oggetto intero in dipendenza,
  // setPlayersLoaded(false) qui sopra faceva lampeggiare la sezione
  // Personaggi e rifare due fetch ad ogni cambio di tab, senza che nulla
  // fosse davvero cambiato.
  }, [activeCampaign?.id, activeCampaign?.ownerId, session?.user?.id, playersReloadToken]);

  // Sezione "NPCs": solo per il GM - i PNG nascosti ai giocatori non devono
  // arrivare al browser di un giocatore (nemmeno solo per essere filtrati
  // client-side, come accade altrove in SessionCharactersPanel.tsx).
  useEffect(() => {
    if (!isOwner || !activeCampaign?.id) {
      setNpcs([]);
      setNpcsLoaded(false);
      return;
    }
    let cancelled = false;
    setNpcsLoaded(false);

    loadNPCs(activeCampaign.id)
      .then((loaded) => {
        if (cancelled) return;
        setNpcs(loaded);
      })
      .catch((err) => {
        console.error('Errore nel caricamento dei PNG:', err);
      })
      .finally(() => {
        if (!cancelled) setNpcsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOwner, activeCampaign?.id]);

  // Sezione "Mostri": stessa regola di sicurezza degli NPC - solo per il GM,
  // Monster ha lo stesso campo visibleToPlayers di NPC (entitiesService.ts).
  useEffect(() => {
    if (!isOwner || !activeCampaign?.id) {
      setMonsters([]);
      setMonstersLoaded(false);
      return;
    }
    let cancelled = false;
    setMonstersLoaded(false);

    loadMonsters(activeCampaign.id)
      .then((loaded) => {
        if (cancelled) return;
        setMonsters(loaded);
      })
      .catch((err) => {
        console.error('Errore nel caricamento dei mostri:', err);
      })
      .finally(() => {
        if (!cancelled) setMonstersLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOwner, activeCampaign?.id]);

  // Cartelle: 'premade' caricate per chiunque veda la sezione Precompilati
  // (GM e giocatori, sola lettura per questi ultimi - canAccessFolders lato
  // server ammette anche i membri in lettura), 'npc'/'monster' solo per il
  // GM, stessa regola di sicurezza delle sezioni PNG/Mostri sopra (mai
  // richieste per un giocatore). 'character' non piu' caricato: i PG
  // normali sono tornati al comportamento pre-cartelle.
  useEffect(() => {
    // Cambio campagna (o logout) riporta ogni sezione alla radice - restare
    // "drillati" dentro un id di una campagna precedente non avrebbe senso.
    setPremadeCurrentFolderId(null);
    setNpcCurrentFolderId(null);
    setMonsterCurrentFolderId(null);
    if (!activeCampaign?.id || !session) {
      setPremadeFolders([]);
      setNpcFolders([]);
      setMonsterFolders([]);
      return;
    }
    let cancelled = false;
    const accessToken = session.access_token;
    const campaignId = activeCampaign.id;

    const load = (entityType: FolderEntityType, setter: (f: Folder[]) => void) =>
      loadFolders(campaignId, entityType, SERVER_BASE, accessToken)
        .then((loaded) => { if (!cancelled) setter(loaded); })
        .catch((err) => console.error(`Errore caricamento cartelle ${entityType}:`, err));

    load('premade', setPremadeFolders);
    if (isOwner) {
      load('npc', setNpcFolders);
      load('monster', setMonsterFolders);
    } else {
      setNpcFolders([]);
      setMonsterFolders([]);
    }

    return () => {
      cancelled = true;
    };
  // session?.user?.id, non session intero: stesso motivo del blocco Players
  // qui sopra - un nuovo riferimento di sessione (senza un vero cambio di
  // utente) ad ogni ritorno in foreground della tab faceva scattare
  // setPremadeCurrentFolderId(null)/setNpcCurrentFolderId(null)/
  // setMonsterCurrentFolderId(null) qui sopra, riportando bruscamente alla
  // radice qualunque drill-down aperto senza che campagna o utente fossero
  // davvero cambiati.
  }, [activeCampaign?.id, session?.user?.id, isOwner]);

  // Canale campaign:{id} condiviso (src/services/realtime/campaignChannel.ts):
  // CampaignHome non è l'unico consumer di questo topic (SessionCharactersPanel,
  // SessionNotesPanel e useEntityTabs lo usano anche loro quando montati
  // insieme, dentro SessionRightSidebar) - prima di questo hook ciascuno apriva
  // il proprio supabase.channel() per lo stesso topic in modo scoordinato,
  // causando collisioni reali (canale chiuso da sotto i piedi di un altro
  // consumer, errore "cannot add X callbacks... after subscribe()" - bug
  // trovato e diagnosticato dal vivo il 2026-07-20). Qui un solo punto
  // possiede davvero il canale, con un solo retry condiviso.
  const { isReady: channelReady, track, untrack, send } = useCampaignChannel(activeCampaign?.id ?? null, {
    onBroadcast: {
      session_change: (msg) => {
        const active = msg?.payload?.active;
        if (typeof active === 'boolean') {
          setLocalSessionActive(active);
        }
      },
      members_change: () => {
        setPlayersReloadToken((t) => t + 1);
      },
    },
    onPresenceSync: (state) => {
      const online = Object.values(state).some((presences: any) =>
        presences.some((p: any) => p.role === 'gm')
      );
      setGmOnline(online);
    },
  });

  useEffect(() => {
    if (!channelReady || !characterLookupDone) return;
    if (isOwner) {
      void track({ role: 'gm', online_at: new Date().toISOString() });
    } else if (ownCharacterId) {
      void track({ role: 'player', characterId: ownCharacterId, online_at: new Date().toISOString() });
    }
    return () => {
      if (isOwner || ownCharacterId) void untrack();
    };
  }, [channelReady, characterLookupDone, isOwner, ownCharacterId, track, untrack]);

  const handleToggleSession = async () => {
    if (!activeCampaign?.id) return;
    setIsToggling(true);
    const nextActive = !sessionActive;
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ active: nextActive }),
      });

      setLocalSessionActive(nextActive);
      setAutoClosedNotice(false);

      if (channelReady) {
        try {
          await send('session_change', { active: nextActive });
        } catch (err) {
          console.error('Errore invio broadcast session_change:', err);
        }
      }

      await refreshCampaigns();
    } catch (err) {
      console.error('Errore cambio stato sessione:', err);
    } finally {
      setIsToggling(false);
    }
  };

  const handleInvitePlayers = async () => {
    if (!activeCampaign) return;
    if (!activeCampaign.inviteCode) {
      // Caso raro: campagne create prima dell'introduzione del codice
      // invito. Lo genera ora - il campo si popola al prossimo render,
      // un secondo click copia il codice appena creato.
      await generateInviteCode(activeCampaign.id);
      await refreshCampaigns();
      return;
    }
    await navigator.clipboard.writeText(activeCampaign.inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  };

  const handleEditCampaign = async (data: CampaignCreateInput) => {
    if (!activeCampaign) return;
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateCampaign(activeCampaign.id, data);
      setShowEditForm(false);
    } catch (err) {
      setEditError(String(err));
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!activeCampaign) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCampaign(activeCampaign.id);
      setConfirmDeleteOpen(false);
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const compatibleCopyTargets = (char: PlayerCharacterSummary | null) => {
    if (!char || !activeCampaign) return [];
    // campagne possedute + a cui si partecipa: chi copia non e' sempre il
    // GM (un giocatore che copia il proprio PG usera' tipicamente una
    // campagna a cui partecipa, non una che possiede).
    const ids = new Set<string>();
    return [...campaigns, ...joinedCampaigns].filter((c) => {
      if (ids.has(c.id) || c.id === activeCampaign.id) return false;
      ids.add(c.id);
      return isRulesetCompatible(char.ruleset, activeCampaign.ruleset, c.ruleset);
    });
  };

  const handleConfirmCopyCharacter = async () => {
    if (!copyDialogChar || !copyTargetCampaignId) return;
    setIsCopyingChar(true);
    setCopyCharError(null);
    try {
      await copyCharacterToCampaign(copyDialogChar.id, copyTargetCampaignId, copyDialogChar.ownerProfileId);
      setCopyDialogChar(null);
      setCopyTargetCampaignId(null);
    } catch (err) {
      setCopyCharError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCopyingChar(false);
    }
  };

  const handleConfirmRemovePlayer = async () => {
    if (!removePlayerTarget || !activeCampaign || !session) return;
    setIsRemovingPlayer(true);
    setRemovePlayerError(null);
    try {
      const accessToken = session.access_token;
      const res = await fetch(`${SERVER_BASE}/campaigns/${activeCampaign.id}/remove-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ playerProfileId: removePlayerTarget.profileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la rimozione del giocatore');
      setRemovePlayerTarget(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      setRemovePlayerError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRemovingPlayer(false);
    }
  };

  // ─── Menu ⋮ PG/precompilati: handler condivisi tra playerRows e availablePremades ───

  // Duplica crea sempre una riga nuova posseduta da chi clicca (mai
  // l'originale) - sicuro indipendentemente da chi possiede il PG di
  // partenza, nessun branch isMine necessario qui (a differenza di
  // Modifica/Elimina sotto).
  const handleDuplicateCharacterCard = async (id: string) => {
    if (!user?.id) return;
    try {
      await duplicateCharacter(id, user.id);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore duplicazione personaggio:', err);
    }
  };

  // "Modifica" pesca la riga grezza (non la summary, troppo leggera per
  // precompilare il wizard) e la mappa con mapRowToCharacter.
  const handleOpenEditCharacter = (id: string) => {
    const raw = charactersRaw.find((r) => r.id === id);
    if (!raw) return;
    setEditingCharacter(mapRowToCharacter(raw));
  };

  // Stesso pattern isMine di PlayerCharacters.tsx (persistCharacter): il
  // wizard salva sempre con ownerProfileId potenzialmente diverso da chi
  // sta modificando - se il GM sta modificando il PG di un giocatore serve
  // passare da saveCharacterAsGm (server, preserva la proprieta'), non da
  // saveCharacter diretto (sposterebbe la proprieta' al GM).
  const handleSaveEditedCharacter = async (character: Character & { player: string; notes: string }) => {
    if (!activeCampaign || !session || !user?.id) return;
    const ownerProfileId = (editingCharacter as any)?.ownerProfileId as string | undefined;
    const isMine = !ownerProfileId || ownerProfileId === user.id;
    try {
      if (isMine) {
        await saveCharacterToSupabase(activeCampaign.id, character, user.id);
      } else {
        await saveCharacterAsGm(activeCampaign.id, character.id, character, SERVER_BASE, session.access_token);
      }
      setEditingCharacter(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore salvataggio personaggio:', err);
    }
  };

  const handleConfirmDeleteCharacter = async () => {
    if (!deleteCharTarget || !activeCampaign || !session) return;
    setIsDeletingChar(true);
    try {
      const isMine = deleteCharTarget.ownerProfileId === user?.id;
      if (isMine) {
        await deleteCharacter(deleteCharTarget.id);
      } else {
        await deleteCharacterAsGm(activeCampaign.id, deleteCharTarget.id, SERVER_BASE, session.access_token);
      }
      setDeleteCharTarget(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore eliminazione personaggio:', err);
    } finally {
      setIsDeletingChar(false);
    }
  };

  // Sempre self-service: la voce non viene mai offerta al GM (vedi
  // costruzione degli item piu' sotto), solo al giocatore che possiede
  // attualmente il PG.
  const handleConfirmReleaseCharacter = async () => {
    if (!releaseCharTarget) return;
    setIsReleasingChar(true);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await releaseCharacter(releaseCharTarget.id, SERVER_BASE, accessToken);
      setReleaseCharTarget(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore rilascio personaggio:', err);
    } finally {
      setIsReleasingChar(false);
    }
  };

  const handleConfirmUnassignCharacter = async () => {
    if (!unassignCharTarget || !session) return;
    setIsUnassigningChar(true);
    try {
      await unassignCharacterFromCampaign(unassignCharTarget.id, SERVER_BASE, session.access_token);
      setUnassignCharTarget(null);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore rimozione personaggio dalla campagna:', err);
    } finally {
      setIsUnassigningChar(false);
    }
  };

  // Toggle "Disponibile per i giocatori" - solo sui precompilati del GM,
  // update ottimistico locale (stesso schema di MyCharactersPage.tsx),
  // rollback su errore.
  const handleToggleCharacterAvailable = async (ch: PlayerCharacterSummary) => {
    const nextAvailable = !ch.availableForPlayers;
    setAvailablePremades((prev) => prev.map((c) => (c.id === ch.id ? { ...c, availableForPlayers: nextAvailable } : c)));
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      await setCharacterAvailableForPlayers(ch.id, nextAvailable, SERVER_BASE, accessToken);
      if (!nextAvailable) setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore aggiornamento disponibilità personaggio:', err);
      setAvailablePremades((prev) => prev.map((c) => (c.id === ch.id ? ch : c)));
    }
  };

  // ─── Menu ⋮ PNG/Mostri (sempre del GM, nessun branch isMine) ───

  const handleDuplicateEntityCard = async (kind: 'npc' | 'monster', id: string) => {
    try {
      if (kind === 'npc') {
        const duplicated = await duplicateNPC(id);
        setNpcs((prev) => [...prev, duplicated]);
      } else {
        const duplicated = await duplicateMonster(id);
        setMonsters((prev) => [...prev, duplicated]);
      }
    } catch (err) {
      console.error('Errore duplicazione:', err);
    }
  };

  const compatibleCopyEntityTargets = () => {
    if (!copyEntityDialog || !activeCampaign) return [];
    const ids = new Set<string>();
    return [...campaigns, ...joinedCampaigns].filter((c) => {
      if (ids.has(c.id) || c.id === activeCampaign.id) return false;
      ids.add(c.id);
      return isRulesetCompatible(copyEntityDialog.ruleset, activeCampaign.ruleset, c.ruleset);
    });
  };

  const handleConfirmCopyEntity = async () => {
    if (!copyEntityDialog || !copyEntityTargetId || !user?.id) return;
    setIsCopyingEntity(true);
    setCopyEntityError(null);
    try {
      if (copyEntityDialog.kind === 'npc') {
        await copyNPCToCampaign(copyEntityDialog.id, copyEntityTargetId, user.id);
      } else {
        await copyMonsterToCampaign(copyEntityDialog.id, copyEntityTargetId, user.id);
      }
      setCopyEntityDialog(null);
      setCopyEntityTargetId(null);
    } catch (err) {
      setCopyEntityError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCopyingEntity(false);
    }
  };

  const handleConfirmUnassignEntity = async () => {
    if (!unassignEntityTarget) return;
    setIsUnassigningEntity(true);
    try {
      if (unassignEntityTarget.kind === 'npc') {
        await unassignNPCFromCampaign(unassignEntityTarget.id);
        setNpcs((prev) => prev.filter((n) => n.id !== unassignEntityTarget.id));
      } else {
        await unassignMonsterFromCampaign(unassignEntityTarget.id);
        setMonsters((prev) => prev.filter((m) => m.id !== unassignEntityTarget.id));
      }
      setUnassignEntityTarget(null);
    } catch (err) {
      console.error('Errore rimozione dalla campagna:', err);
    } finally {
      setIsUnassigningEntity(false);
    }
  };

  const handleConfirmDeleteEntity = async () => {
    if (!deleteEntityTarget) return;
    setIsDeletingEntity(true);
    try {
      if (deleteEntityTarget.kind === 'npc') {
        await deleteNPC(deleteEntityTarget.id);
        setNpcs((prev) => prev.filter((n) => n.id !== deleteEntityTarget.id));
      } else {
        await deleteMonster(deleteEntityTarget.id);
        setMonsters((prev) => prev.filter((m) => m.id !== deleteEntityTarget.id));
      }
      setDeleteEntityTarget(null);
    } catch (err) {
      console.error('Errore eliminazione:', err);
    } finally {
      setIsDeletingEntity(false);
    }
  };

  // ─── Cartelle: azioni condivise dalle 4 sezioni ───
  // Un'unica implementazione parametrizzata su entityType/folders/setFolders
  // invece di 4 copie quasi identiche - solo la persistenza finale (quale
  // servizio chiamare) cambia da sezione a sezione, e resta nei rispettivi
  // onMoveCard passati a ciascuna istanza di useFolderDragDrop piu' sotto.

  const handleCreateFolder = async (
    entityType: FolderEntityType,
    setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
    parentFolderId: string | null,
  ) => {
    if (!activeCampaign || !session) return;
    try {
      const folder = await createFolder(activeCampaign.id, entityType, 'Nuova cartella', SERVER_BASE, session.access_token, parentFolderId);
      setFolders((prev) => [...prev, folder]);
      // Entra subito in rinomina, stesso pattern di handleAddCustomTab in
      // useEntityTabs.ts: crea e passa direttamente al nome invece di
      // lasciare "Nuova cartella" come placeholder da rinominare dopo.
      setRenamingFolderId(folder.id);
      setRenameFolderDraft('Nuova cartella');
    } catch (err) {
      console.error('Errore creazione cartella:', err);
    }
  };

  const handleCommitFolderRename = async (folder: Folder, setFolders: React.Dispatch<React.SetStateAction<Folder[]>>) => {
    const name = renameFolderDraft.trim();
    setRenamingFolderId(null);
    if (!name || name === folder.name || !session) return;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name } : f)));
    try {
      await renameFolder(folder.id, name, SERVER_BASE, session.access_token);
    } catch (err) {
      console.error('Errore rinomina cartella:', err);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
    }
  };

  // Stesso schema di handleCommitFolderRename - update ottimistico, chiama
  // il service, rollback su errore. setFolders catturato direttamente nella
  // chiusura al momento dell'apertura (onOpenIconPicker in FolderRow), non
  // risolto con uno switch su entityType al commit - stesso stile gia'
  // usato per onCommitRename qui sopra.
  const handleSelectFolderIcon = async (iconId: string | null) => {
    const target = iconPickerTarget;
    setIconPickerTarget(null);
    if (!target || !session) return;
    const { folder, setFolders } = target;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, icon: iconId } : f)));
    try {
      await setFolderIcon(folder.id, iconId, SERVER_BASE, session.access_token);
    } catch (err) {
      console.error('Errore impostazione icona cartella:', err);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
    }
  };

  // Riordina solo tra i fratelli del nodo trascinato (stesso parentFolderId,
  // incluso il caso radice/null) - non l'intero elenco piatto come nella
  // versione Fase 2: da Fase 4 l'hook non calcola piu' da solo l'array
  // riordinato (non conosce le relazioni di parentela), passa solo
  // (draggedId, beforeId) grezzi - il chiamante trova i fratelli e chiama
  // reorderIds su quel sottoinsieme.
  const handleReorderFolders = async (
    folders: Folder[],
    draggedId: string,
    beforeId: string | null,
    setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
  ) => {
    if (!session) return;
    const dragged = folders.find((f) => f.id === draggedId);
    if (!dragged) return;
    const siblingIds = folders.filter((f) => f.parentFolderId === dragged.parentFolderId).map((f) => f.id);
    const reorderedSiblingIds = reorderIds(siblingIds, draggedId, beforeId);
    const positionById = new Map(reorderedSiblingIds.map((id, idx) => [id, idx]));
    const byId = new Map(folders.map((f) => [f.id, f]));

    setFolders((prev) => prev.map((f) => (positionById.has(f.id) ? { ...f, position: positionById.get(f.id)! } : f)));

    await Promise.all(
      reorderedSiblingIds.map((id) => {
        const original = byId.get(id);
        const newPosition = positionById.get(id)!;
        if (original && original.position === newPosition) return null;
        return reorderFolder(id, newPosition, SERVER_BASE, session.access_token)
          .catch((err) => console.error('Errore riordino cartella:', err));
      })
    );
  };

  // Annida una cartella dentro un'altra o la promuove a radice (null) -
  // update ottimistico + rollback su errore, stesso schema di
  // handleMoveNpcFolder poco sotto. Il trigger check_folder_hierarchy lato
  // DB e' l'unica vera difesa contro cicli/profondita'/tipo incoerente -
  // qui si assume il caso comune (spostamento valido) e si ripristina solo
  // se il server rifiuta.
  // "Sposta di un livello": se si rilascia una cartella esattamente sopra
  // l'header della cartella che gia' la contiene (newParentFolderId coincide
  // col parentFolderId attuale), non e' un no-op - si promuove al genitore
  // DI QUEL genitore (un livello piu' in alto), altrimenti trascinare una
  // sotto-cartella sul proprio genitore non avrebbe mai alcun effetto
  // visibile. Se il genitore era gia' una radice (parentFolderId null),
  // "un livello piu' in alto" coincide con "diventa radice" (stesso
  // risultato del drop sulla striscia "Senza cartella") - comportamento
  // coerente, non un secondo no-op silenzioso.
  const handleNestFolder = async (
    folders: Folder[],
    folderId: string,
    newParentFolderId: string | null,
    setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
  ) => {
    if (!session) return;
    const original = folders.find((f) => f.id === folderId);
    if (!original) return;
    let resolvedParentId = newParentFolderId;
    if (newParentFolderId !== null && newParentFolderId === original.parentFolderId) {
      const currentParent = folders.find((f) => f.id === newParentFolderId);
      resolvedParentId = currentParent?.parentFolderId ?? null;
    }
    // Stessa validazione usata per il colore verde/rosso durante il drag
    // (computeFolderRowDropState/isValidFolderNestTarget) - guardiano finale
    // prima della richiesta: se il bersaglio risolto violerebbe ciclo/
    // profondita', il trigger DB lo rifiuterebbe comunque, quindi non si
    // tenta nemmeno l'update ottimistico.
    if (resolvedParentId !== null) {
      const foldersById = new Map(folders.map((f) => [f.id, f]));
      if (!isValidFolderNestTarget(folderId, resolvedParentId, foldersById)) return;
    }
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, parentFolderId: resolvedParentId } : f)));
    try {
      await setFolderParent(folderId, resolvedParentId, SERVER_BASE, session.access_token);
    } catch (err) {
      console.error('Errore spostamento cartella:', err);
      setFolders((prev) => prev.map((f) => (f.id === folderId ? original : f)));
    }
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deleteFolderTarget || !session || !activeCampaign) return;
    setIsDeletingFolder(true);
    try {
      if (deleteFolderCascadeContent) {
        // Eliminazione a cascata: tocca piu' tabelle sul server in un colpo
        // solo (vedi deleteFolderCascade/route dedicata) - per un'operazione
        // distruttiva multi-tabella e' piu' semplice e piu' sicuro ricaricare
        // la sezione da zero che ricostruire a mano quali righe locali
        // rimuovere (a differenza del ramo non-cascade sotto, dove
        // l'aggiornamento locale mirato resta appropriato).
        await deleteFolderCascade(deleteFolderTarget.id, SERVER_BASE, session.access_token);
        const accessToken = session.access_token;
        const campaignId = activeCampaign.id;
        switch (deleteFolderTarget.entityType) {
          case 'premade':
            setPremadeFolders(await loadFolders(campaignId, 'premade', SERVER_BASE, accessToken));
            setPlayersReloadToken((t) => t + 1);
            break;
          case 'npc':
            setNpcFolders(await loadFolders(campaignId, 'npc', SERVER_BASE, accessToken));
            setNpcs(await loadNPCs(campaignId));
            break;
          case 'monster':
            setMonsterFolders(await loadFolders(campaignId, 'monster', SERVER_BASE, accessToken));
            setMonsters(await loadMonsters(campaignId));
            break;
        }
      } else {
        await deleteFolder(deleteFolderTarget.id, SERVER_BASE, session.access_token);
        const clearFolder = <T extends { id: string; folderId?: string | null }>(list: T[]) =>
          list.map((item) => (item.folderId === deleteFolderTarget.id ? { ...item, folderId: null } : item));
        // Il DB orfanizza automaticamente le sotto-cartelle dirette (parent_
        // folder_id ... on delete set null, supabase-add-nested-folders.sql)
        // ma lo stato client no - senza questo, restavano invisibili (il loro
        // parentFolderId punta a un id ormai rimosso dall'array locale, finche'
        // non arriva un reload completo).
        const reparentOrphans = (list: Folder[]) =>
          list.map((f) => (f.parentFolderId === deleteFolderTarget.id ? { ...f, parentFolderId: null } : f));
        // Nessun case 'character': la sezione Personaggi non crea piu'
        // cartelle di quel tipo, questo target non e' piu' raggiungibile da
        // questa UI (eventuali cartelle 'character' residue dai test restano
        // nel DB, senza piu' un percorso per eliminarle da qui).
        switch (deleteFolderTarget.entityType) {
          case 'premade':
            setPremadeFolders((prev) => reparentOrphans(prev.filter((f) => f.id !== deleteFolderTarget.id)));
            setAvailablePremades((prev) => clearFolder(prev));
            break;
          case 'npc':
            setNpcFolders((prev) => reparentOrphans(prev.filter((f) => f.id !== deleteFolderTarget.id)));
            setNpcs((prev) => clearFolder(prev));
            break;
          case 'monster':
            setMonsterFolders((prev) => reparentOrphans(prev.filter((f) => f.id !== deleteFolderTarget.id)));
            setMonsters((prev) => clearFolder(prev));
            break;
        }
      }
      setDeleteFolderTarget(null);
    } catch (err) {
      console.error('Errore eliminazione cartella:', err);
    } finally {
      setIsDeletingFolder(false);
    }
  };

  // PG/Precompilati: endpoint stretto dedicato (POST /characters/:id/folder)
  // - PUT /campaigns/:id/characters/:id (saveCharacterAsGm) fa un update
  // integrale con default hardcoded sui campi non passati e distruggerebbe
  // cornice/token/sheet_data se richiamato con solo folderId (vedi commento
  // sul server). Aggiorna playerRows/availablePremades via bump del token di
  // reload esistente invece di un update ottimistico locale: il PG spostato
  // potrebbe non essere nell'array giusto (es. draggato da Precompilati a
  // Personaggi non e' un caso reale oggi, ma un refetch resta piu' semplice
  // e sicuro di due update ottimistici paralleli su due liste diverse).
  // "Sposta di un livello" (vedi commento gemello su handleNestFolder): se
  // il PG e' rilasciato esattamente sulla cartella che gia' lo contiene,
  // si promuove al genitore di quella cartella invece di un no-op. Cerca
  // tra playerRows e availablePremades insieme: un PG puo' comparire in
  // uno solo dei due, non serve sapere qui in quale.
  const handleMoveCharacterFolder = async (characterId: string, folderId: string | null) => {
    if (!session) return;
    let resolvedFolderId = folderId;
    if (folderId !== null) {
      const current = playerRows.flatMap((row) => row.characters).find((c) => c.id === characterId)
        ?? availablePremades.find((c) => c.id === characterId);
      if (current?.folderId === folderId) {
        const targetFolder = premadeFolders.find((f) => f.id === folderId);
        resolvedFolderId = targetFolder?.parentFolderId ?? null;
      }
    }
    try {
      await setCharacterFolder(characterId, resolvedFolderId, SERVER_BASE, session.access_token);
      setPlayersReloadToken((t) => t + 1);
    } catch (err) {
      console.error('Errore assegnazione cartella personaggio:', err);
    }
  };

  // PNG/Mostri: gia' owned per intero dal GM, nessun rischio di scrivere su
  // un PG altrui - update ottimistico + rollback su errore, stesso schema di
  // handleToggleCharacterAvailable poco sotto. saveNPC/saveMonster fanno un
  // round-trip sull'oggetto intero (non un update parziale), quindi passare
  // lo spread completo con solo folderId cambiato e' sicuro.
  const handleMoveNpcFolder = async (npcId: string, folderId: string | null) => {
    const npc = npcs.find((n) => n.id === npcId);
    if (!npc || !activeCampaign) return;
    // "Sposta di un livello" (vedi commento su handleNestFolder): rilasciato
    // sulla propria cartella attuale -> promuovi al genitore di quella.
    let resolvedFolderId = folderId;
    if (folderId !== null && npc.folderId === folderId) {
      resolvedFolderId = npcFolders.find((f) => f.id === folderId)?.parentFolderId ?? null;
    }
    const updated = { ...npc, folderId: resolvedFolderId };
    setNpcs((prev) => prev.map((n) => (n.id === npcId ? updated : n)));
    try {
      await saveNPC(activeCampaign.id, updated);
    } catch (err) {
      console.error('Errore assegnazione cartella PNG:', err);
      setNpcs((prev) => prev.map((n) => (n.id === npcId ? npc : n)));
    }
  };

  const handleMoveMonsterFolder = async (monsterId: string, folderId: string | null) => {
    const monster = monsters.find((m) => m.id === monsterId);
    if (!monster || !activeCampaign) return;
    let resolvedFolderId = folderId;
    if (folderId !== null && monster.folderId === folderId) {
      resolvedFolderId = monsterFolders.find((f) => f.id === folderId)?.parentFolderId ?? null;
    }
    const updated = { ...monster, folderId: resolvedFolderId };
    setMonsters((prev) => prev.map((m) => (m.id === monsterId ? updated : m)));
    try {
      await saveMonster(activeCampaign.id, updated);
    } catch (err) {
      console.error('Errore assegnazione cartella mostro:', err);
      setMonsters((prev) => prev.map((m) => (m.id === monsterId ? monster : m)));
    }
  };

  // Le 3 sezioni con cartelle (Precompilati/PNG/Mostri - Personaggi tornato
  // al comportamento pre-cartelle) condividono lo stesso containerRef (un
  // solo grid flat, vedi il commento sul markup piu' sotto) - ogni istanza
  // filtra i propri target di drop tramite entityType, senza contaminarsi a
  // vicenda pur osservando tutte lo stesso DOM (vedi il commento su
  // resolveFolderDropTarget in useFolderDragDrop.ts).
  const foldersContainerRef = useRef<HTMLDivElement | null>(null);
  const premadeFolderDnd = useFolderDragDrop({
    canEdit: isOwner,
    entityType: 'premade',
    folderIds: premadeFolders.map((f) => f.id),
    onReorderFolders: (draggedId, beforeId) => handleReorderFolders(premadeFolders, draggedId, beforeId, setPremadeFolders),
    onMoveCard: handleMoveCharacterFolder,
    onNestFolder: (folderId, newParentFolderId) => handleNestFolder(premadeFolders, folderId, newParentFolderId, setPremadeFolders),
    containerRef: foldersContainerRef,
  });
  const npcFolderDnd = useFolderDragDrop({
    canEdit: isOwner,
    entityType: 'npc',
    folderIds: npcFolders.map((f) => f.id),
    onReorderFolders: (draggedId, beforeId) => handleReorderFolders(npcFolders, draggedId, beforeId, setNpcFolders),
    onMoveCard: handleMoveNpcFolder,
    onNestFolder: (folderId, newParentFolderId) => handleNestFolder(npcFolders, folderId, newParentFolderId, setNpcFolders),
    containerRef: foldersContainerRef,
  });
  const monsterFolderDnd = useFolderDragDrop({
    canEdit: isOwner,
    entityType: 'monster',
    folderIds: monsterFolders.map((f) => f.id),
    onReorderFolders: (draggedId, beforeId) => handleReorderFolders(monsterFolders, draggedId, beforeId, setMonsterFolders),
    onMoveCard: handleMoveMonsterFolder,
    onNestFolder: (folderId, newParentFolderId) => handleNestFolder(monsterFolders, folderId, newParentFolderId, setMonsterFolders),
    containerRef: foldersContainerRef,
  });

  // Costruisce le voci del menu ⋮ di un PG - condivisa tra playerRows (di un
  // giocatore, row valorizzato) e availablePremades (del GM, row assente).
  // Chiamata solo quando il menu e' comunque visibile (isOwner || isSelfOwned,
  // vedi cornerAction sulle card), quindi Modifica/Duplica/Copia/Rimuovi/
  // Elimina sono sempre incluse - cambiano solo Disponibile per i giocatori
  // (solo GM sul proprio precompilato) e Rilascia al GM (solo il giocatore
  // proprietario, mai il GM) e Rimuovi il giocatore (solo su playerRows).
  const buildCharacterMenuItems = (ch: PlayerCharacterSummary, row: PlayerRow | null) => {
    const isSelfOwned = ch.ownerProfileId === user?.id;
    const items: EntityKebabMenuItem[] = [
      {
        key: 'edit',
        icon: <Pencil className="h-4 w-4" />,
        label: 'Modifica',
        onClick: () => handleOpenEditCharacter(ch.id),
      },
      {
        key: 'duplicate',
        icon: <CopyPlus className="h-4 w-4" />,
        label: 'Duplica',
        onClick: () => handleDuplicateCharacterCard(ch.id),
      },
    ];

    if (isOwner && isSelfOwned) {
      items.push({
        key: 'available-for-players',
        icon: <UserCog className="h-4 w-4" />,
        label: 'Disponibile per i giocatori',
        onClick: () => handleToggleCharacterAvailable(ch),
        keepOpenAfterClick: true,
        trailing: <Switch checked={ch.availableForPlayers} className="pointer-events-none" />,
      });
    }

    items.push({
      key: 'copy',
      icon: <Copy className="h-4 w-4" />,
      label: "Copia in un'altra campagna",
      onClick: () => setCopyDialogChar(ch),
    });

    if (!isOwner && isSelfOwned && ch.claimableOrigin && ch.originalOwnerProfileId != null && ch.ownerProfileId !== ch.originalOwnerProfileId) {
      items.push({
        key: 'release',
        icon: <Undo2 className="h-4 w-4" />,
        label: 'Rilascia al GM',
        onClick: () => setReleaseCharTarget(ch),
      });
    }

    // "Elimina" solo su un PG che possiedi davvero (il GM sul proprio
    // precompilato, o il giocatore sul proprio PG) - mai al GM su un PG di
    // un giocatore: non e' suo, non deve poterlo eliminare (ne' con
    // deleteCharacter ne' con deleteCharacterAsGm). "Rimuovi giocatore" sotto
    // resta lo strumento corretto per il GM su un PG altrui.
    if (isSelfOwned) {
      items.push({
        key: 'delete',
        icon: <Trash2 className="h-4 w-4" />,
        label: 'Elimina',
        onClick: () => setDeleteCharTarget(ch),
        danger: true,
      });
    }

    // Due ampiezze distinte, entrambe solo GM (mai al giocatore proprietario):
    // "Rimuovi dalla campagna" tocca solo questo PG (il giocatore resta
    // membro con eventuali altri suoi PG); "Rimuovi giocatore" e' il
    // sovrainsieme che rimuove tutti i PG del giocatore in questa campagna
    // piu' la membership.
    if (isOwner) {
      items.push({
        key: 'unassign',
        icon: <UserMinus className="h-4 w-4" />,
        label: 'Rimuovi dalla campagna',
        onClick: () => setUnassignCharTarget(ch),
      });
    }

    if (isOwner && row) {
      items.push({
        key: 'remove-player',
        icon: <Users className="h-4 w-4" />,
        label: 'Rimuovi giocatore',
        onClick: () => setRemovePlayerTarget(row),
        danger: true,
      });
    }

    return items;
  };

  const buildEntityMenuItems = (kind: 'npc' | 'monster', entity: NPC | Monster) => {
    const items: EntityKebabMenuItem[] = [
      {
        key: 'duplicate',
        icon: <CopyPlus className="h-4 w-4" />,
        label: 'Duplica',
        onClick: () => handleDuplicateEntityCard(kind, entity.id),
      },
      {
        key: 'copy',
        icon: <Copy className="h-4 w-4" />,
        label: "Copia in un'altra campagna",
        onClick: () => setCopyEntityDialog({ kind, id: entity.id, name: entity.name || '', ruleset: entity.ruleset ?? null }),
      },
      {
        key: 'unassign',
        icon: <UserMinus className="h-4 w-4" />,
        label: 'Rimuovi dalla campagna',
        onClick: () => setUnassignEntityTarget({ kind, id: entity.id, name: entity.name || '' }),
      },
      {
        key: 'delete',
        icon: <Trash2 className="h-4 w-4" />,
        label: 'Elimina',
        onClick: () => setDeleteEntityTarget({ kind, id: entity.id, name: entity.name || '' }),
        danger: true,
      },
    ];
    return items;
  };

  const gmInitial = (gmDisplayName ?? 'G').trim().charAt(0).toUpperCase() || 'G';
  // Le sezioni PNG/Mostri sono visibili solo al GM (i PNG/Mostri nascosti
  // vanno solo a chi gestisce la campagna) e solo quando c'e' davvero
  // qualcosa da mostrare - stessa condizione gia' usata per i due blocchi
  // piu' sotto nella griglia, ora centralizzata qui perche' serve anche allo
  // spaziatore di colonna 1 subito sotto.
  const npcSectionVisible = isOwner && npcsLoaded && npcs.length > 0;
  const monsterSectionVisible = isOwner && monstersLoaded && monsters.length > 0;

  // Colonna 1 (GM/Note) non ha equivalente di FolderSectionHeader: ogni
  // sezione della griglia di colonna 2 ha ora sempre un header in cima
  // (Personaggi/'all' incluso, icona+etichetta senza pulsante) tranne quando
  // PNG/Mostri non hanno nulla da mostrare (npcSectionVisible/
  // monsterSectionVisible false, il blocco non renderizza nulla) - la card
  // GM partirebbe altrimenti piu' in alto della prima card reale. Spaziatore
  // compensa esattamente quell'offset - altezza header, ora fissa a 32px
  // (min-h-8 in FolderSectionHeader) sia con pulsante "Nuova cartella" sia
  // senza, cosi' non scatta piu' passando da una sezione all'altra - + gap-4
  // della griglia (16px) - gap-3 di questa colonna (12px, aggiunto
  // automaticamente dopo lo spaziatore) = 32px, sempre uguale quando l'header
  // e' presente.
  const activeSectionHeaderSpacerClass = (() => {
    if (activeQuickFilter === 'npc') return npcSectionVisible ? 'h-8' : null;
    if (activeQuickFilter === 'monster') return monsterSectionVisible ? 'h-8' : null;
    return 'h-8'; // premades / all / pg -> header sempre presente, altezza fissa uniforme
  })();

  // Lookup per id + percorso radice→corrente per sezione, usati da
  // FolderRow/FolderBreadcrumb/renderFolderedSection e dal calcolo del
  // limite di annidamento sotto - ricalcolati ad ogni render (gli array di
  // cartelle sono piccoli, nessuna necessita' di memoizzazione qui).
  const premadeFoldersById = new Map(premadeFolders.map((f) => [f.id, f]));
  const npcFoldersById = new Map(npcFolders.map((f) => [f.id, f]));
  const monsterFoldersById = new Map(monsterFolders.map((f) => [f.id, f]));
  const premadeFolderPath = getFolderPath(premadeCurrentFolderId, premadeFoldersById);
  const npcFolderPath = getFolderPath(npcCurrentFolderId, npcFoldersById);
  const monsterFolderPath = getFolderPath(monsterCurrentFolderId, monsterFoldersById);
  const premadeCreateDisabledReason =
    getFolderDepth(premadeCurrentFolderId, premadeFoldersById) >= MAX_FOLDER_DEPTH
      ? 'Limite di 5 livelli di annidamento raggiunto' : null;
  const npcCreateDisabledReason =
    getFolderDepth(npcCurrentFolderId, npcFoldersById) >= MAX_FOLDER_DEPTH
      ? 'Limite di 5 livelli di annidamento raggiunto' : null;
  const monsterCreateDisabledReason =
    getFolderDepth(monsterCurrentFolderId, monsterFoldersById) >= MAX_FOLDER_DEPTH
      ? 'Limite di 5 livelli di annidamento raggiunto' : null;

  // Conteggio del contenuto della cartella da eliminare, per il checkbox di
  // eliminazione a cascata nel dialog sotto - null se la cartella e' vuota
  // (in quel caso il checkbox non ha senso, vedi extraContent piu' sotto).
  const deleteFolderContents = (() => {
    if (!deleteFolderTarget) return null;
    let counts: { itemCount: number; folderCount: number };
    let itemLabel: string;
    switch (deleteFolderTarget.entityType) {
      case 'premade':
        counts = countFolderContentsRecursive(deleteFolderTarget.id, premadeFolders, availablePremades);
        itemLabel = 'Precompilati';
        break;
      case 'npc':
        counts = countFolderContentsRecursive(deleteFolderTarget.id, npcFolders, npcs);
        itemLabel = 'PNG';
        break;
      case 'monster':
        counts = countFolderContentsRecursive(deleteFolderTarget.id, monsterFolders, monsters);
        itemLabel = 'Mostri';
        break;
      default:
        return null;
    }
    if (counts.itemCount + counts.folderCount === 0) return null;
    return { ...counts, itemLabel };
  })();

  const handleCoverUpdate = (patch: CampaignCoverPatch) => {
    if (!activeCampaign) return;
    void updateCampaign(activeCampaign.id, patch);
  };

  // ─── Render delle card, estratti in funzioni riusabili tra il loop dentro
  // una cartella e quello delle card sciolte (renderFolderedSection sotto) -
  // stesso identico JSX gia' in uso prima dell'introduzione delle cartelle,
  // solo spostato da inline a funzione per essere chiamato da due punti.
  const renderCharacterCard = (ch: PlayerCharacterSummary, row: PlayerRow) => (
    <EntityCard
      key={ch.id}
      variant="grid"
      name={ch.name}
      subtitle={ch.styleViaggio}
      secondaryText={ch.description}
      onClick={() => onOpenSessionEntity('pg', ch.id)}
      photoUrl={ch.portraitUrl}
      photoSourceUrl={ch.portraitSourceUrl}
      photoCropArea={ch.portraitCropArea}
      tokenColor={ch.tokenColor}
      tokenBackgroundColor={ch.tokenBackgroundColor}
      tokenBorderStyle={ch.tokenBorderStyle}
      tokenBorderThickness={ch.tokenBorderThickness}
      tokenBorderVisible={ch.tokenBorderVisible}
      tokenBorderLabel={ch.tokenBorderLabel}
      cornerAction={
        isOwner || ch.ownerProfileId === user?.id ? (
          <EntityKebabMenu
            colors={menuColors}
            buttonClassName={photoCornerButtonClass}
            items={buildCharacterMenuItems(ch, row)}
            footer={
              <div className="px-2 py-1.5 text-xs" style={{ color: menuColors.text, opacity: 0.7 }}>
                {ch.createdAt && (
                  <div>Creato il {new Date(ch.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                )}
                {row.joinedAt && (
                  <div>Unito alla campagna il {new Date(row.joinedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                )}
              </div>
            }
          />
        ) : undefined
      }
    >
      <div className="flex items-center gap-1.5 truncate text-[11px] text-[var(--dash-accent-2)]">
        {ch.ownerAvatarUrl ? (
          <img src={ch.ownerAvatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--dash-accent)] text-[8px] font-semibold text-[var(--dash-text-strong)]">
            {(row.displayName ?? '?').trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
        <span className="truncate">{row.displayName ?? 'Sconosciuto'}</span>
      </div>
    </EntityCard>
  );

  const renderPremadeCard = (ch: PlayerCharacterSummary) => (
    <EntityCard
      key={ch.id}
      variant="grid"
      name={ch.name}
      subtitle={ch.styleViaggio}
      secondaryText={ch.description}
      onClick={() => onOpenSessionEntity('pg', ch.id)}
      photoUrl={ch.portraitUrl}
      photoSourceUrl={ch.portraitSourceUrl}
      photoCropArea={ch.portraitCropArea}
      tokenColor={ch.tokenColor}
      tokenBackgroundColor={ch.tokenBackgroundColor}
      tokenBorderStyle={ch.tokenBorderStyle}
      tokenBorderThickness={ch.tokenBorderThickness}
      tokenBorderVisible={ch.tokenBorderVisible}
      tokenBorderLabel={ch.tokenBorderLabel}
      cornerAction={
        isOwner ? (
          <EntityKebabMenu
            colors={menuColors}
            buttonClassName={photoCornerButtonClass}
            items={buildCharacterMenuItems(ch, null)}
          />
        ) : undefined
      }
    />
  );

  const renderNpcCard = (npc: NPC) => (
    <EntityCard
      key={npc.id}
      variant="grid"
      name={npc.name || 'PNG senza nome'}
      subtitle={npc.role || 'PNG'}
      onClick={() => onOpenSessionEntity('png', npc.id)}
      photoUrl={npc.portraitImageUrl}
      photoSourceUrl={npc.portraitSourceImageUrl}
      photoCropArea={npc.portraitCropArea}
      tokenColor={npc.tokenColor}
      tokenBackgroundColor={npc.tokenBackgroundColor}
      tokenBorderStyle={npc.tokenBorderStyle}
      tokenBorderThickness={npc.tokenBorderThickness}
      tokenBorderVisible={npc.tokenBorderVisible}
      tokenBorderLabel={npc.tokenBorderLabel}
      hiddenBadge={!npc.visibleToPlayers}
      cornerAction={
        isOwner ? (
          <EntityKebabMenu
            colors={menuColors}
            buttonClassName={photoCornerButtonClass}
            items={buildEntityMenuItems('npc', npc)}
            footer={
              <div className="px-2 py-1.5 text-xs" style={{ color: menuColors.text, opacity: 0.7 }}>
                {npc.createdAt && (
                  <div>Creato il {new Date(npc.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                )}
              </div>
            }
          />
        ) : undefined
      }
    />
  );

  const renderMonsterCard = (monster: Monster) => (
    <EntityCard
      key={monster.id}
      variant="grid"
      name={monster.name || 'Mostro senza nome'}
      onClick={() => onOpenSessionEntity('mostro', monster.id)}
      photoUrl={monster.portraitImageUrl}
      photoSourceUrl={monster.portraitSourceImageUrl}
      photoCropArea={monster.portraitCropArea}
      tokenColor={monster.tokenColor}
      tokenBackgroundColor={monster.tokenBackgroundColor}
      tokenBorderStyle={monster.tokenBorderStyle}
      tokenBorderThickness={monster.tokenBorderThickness}
      tokenBorderVisible={monster.tokenBorderVisible}
      tokenBorderLabel={monster.tokenBorderLabel}
      hiddenBadge={!monster.visibleToPlayers}
      cornerAction={
        isOwner ? (
          <EntityKebabMenu
            colors={menuColors}
            buttonClassName={photoCornerButtonClass}
            items={buildEntityMenuItems('monster', monster)}
            footer={
              <div className="px-2 py-1.5 text-xs" style={{ color: menuColors.text, opacity: 0.7 }}>
                {monster.createdAt && (
                  <div>Creato il {new Date(monster.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                )}
              </div>
            }
          />
        ) : undefined
      }
    />
  );

  // Card minimali per il ghost di drag (DragGhost) - solo foto/nome/
  // sottotitolo, niente cornerAction/badge/footer: in un ghost non
  // cliccabile (pointer-events:none sull'antenato) il menu ⋮ non avrebbe
  // senso ed e' solo rumore visivo.
  const renderPremadeGhostCard = (ch: PlayerCharacterSummary) => (
    <EntityCard
      variant="grid"
      name={ch.name}
      subtitle={ch.styleViaggio}
      photoUrl={ch.portraitUrl}
      photoSourceUrl={ch.portraitSourceUrl}
      photoCropArea={ch.portraitCropArea}
      tokenColor={ch.tokenColor}
      tokenBackgroundColor={ch.tokenBackgroundColor}
      tokenBorderStyle={ch.tokenBorderStyle}
      tokenBorderThickness={ch.tokenBorderThickness}
      tokenBorderVisible={ch.tokenBorderVisible}
      tokenBorderLabel={ch.tokenBorderLabel}
    />
  );

  const renderNpcGhostCard = (npc: NPC) => (
    <EntityCard
      variant="grid"
      name={npc.name || 'PNG senza nome'}
      subtitle={npc.role || 'PNG'}
      photoUrl={npc.portraitImageUrl}
      photoSourceUrl={npc.portraitSourceImageUrl}
      photoCropArea={npc.portraitCropArea}
      tokenColor={npc.tokenColor}
      tokenBackgroundColor={npc.tokenBackgroundColor}
      tokenBorderStyle={npc.tokenBorderStyle}
      tokenBorderThickness={npc.tokenBorderThickness}
      tokenBorderVisible={npc.tokenBorderVisible}
      tokenBorderLabel={npc.tokenBorderLabel}
    />
  );

  const renderMonsterGhostCard = (monster: Monster) => (
    <EntityCard
      variant="grid"
      name={monster.name || 'Mostro senza nome'}
      photoUrl={monster.portraitImageUrl}
      photoSourceUrl={monster.portraitSourceImageUrl}
      photoCropArea={monster.portraitCropArea}
      tokenColor={monster.tokenColor}
      tokenBackgroundColor={monster.tokenBackgroundColor}
      tokenBorderStyle={monster.tokenBorderStyle}
      tokenBorderThickness={monster.tokenBorderThickness}
      tokenBorderVisible={monster.tokenBorderVisible}
      tokenBorderLabel={monster.tokenBorderLabel}
    />
  );

  // Conteggio ricorsivo (sotto-cartelle+card annidate incluse), scomposto
  // per tipo - usato sia per il badge "(n)" sulla riga cartella (solo
  // itemCount, con la vista drill-down che nasconde il contenuto finche' non
  // ci si entra un "(0)" su una cartella che in realta' contiene nipoti
  // sarebbe fuorviante) sia per il messaggio di eliminazione a cascata
  // (entrambi i conteggi, per un avviso tipo "3 PNG e 2 sotto-cartelle").
  function countFolderContentsRecursive(
    folderId: string,
    folders: Folder[],
    items: { folderId?: string | null }[],
  ): { itemCount: number; folderCount: number } {
    const directItems = items.filter((it) => it.folderId === folderId).length;
    const childFolders = folders.filter((f) => f.parentFolderId === folderId);
    return childFolders.reduce((acc, child) => {
      const sub = countFolderContentsRecursive(child.id, folders, items);
      return { itemCount: acc.itemCount + sub.itemCount, folderCount: acc.folderCount + sub.folderCount + 1 };
    }, { itemCount: directItems, folderCount: 0 });
  }

  // Un solo livello alla volta (drill-down, vedi FolderBreadcrumb per la
  // navigazione) - solo le sotto-cartelle dirette e le card dirette di
  // nav.currentFolderId, mai l'intero sottoalbero. Le card sciolte (senza
  // cartella) sono assorbite qui: prima erano un blocco duplicato dopo ogni
  // chiamata in ciascuna delle 3 sezioni, ora sono semplicemente le
  // directItems quando si e' alla radice (currentFolderId === null).
  function renderFolderedSection<T extends { id: string; folderId?: string | null }>(
    entityType: FolderEntityType,
    folders: Folder[],
    setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
    dnd: typeof premadeFolderDnd,
    items: T[],
    renderCard: (item: T) => React.ReactNode,
    nav: { currentFolderId: string | null; setCurrentFolderId: (id: string | null) => void; foldersById: Map<string, Folder> },
  ) {
    const { currentFolderId, foldersById } = nav;
    const childFolders = folders
      .filter((f) => f.parentFolderId === currentFolderId)
      .sort((a, b) => a.position - b.position);
    const directItems = items.filter((it) => (it.folderId ?? null) === currentFolderId);

    return (
      <>
        {childFolders.map((folder) => {
          const counts = countFolderContentsRecursive(folder.id, folders, items);
          return (
          <FolderRow
            key={folder.id}
            folder={folder}
            onEnter={() => nav.setCurrentFolderId(folder.id)}
            count={counts.itemCount}
            subfolderCount={counts.folderCount}
            canEdit={isOwner}
            isRenaming={renamingFolderId === folder.id}
            renameDraft={renameFolderDraft}
            onRenameDraftChange={setRenameFolderDraft}
            onStartRename={() => { setRenamingFolderId(folder.id); setRenameFolderDraft(folder.name); }}
            onCommitRename={() => handleCommitFolderRename(folder, setFolders)}
            onCancelRename={() => setRenamingFolderId(null)}
            onRequestDelete={() => { setDeleteFolderTarget(folder); setDeleteFolderCascadeContent(false); }}
            onOpenIconPicker={() => setIconPickerTarget({ folder, setFolders })}
            onPointerDown={(e) => dnd.handlePointerDown(e, { kind: 'folder', id: folder.id })}
            dropState={computeFolderRowDropState(dnd, folder, foldersById)}
            isDimmed={dnd.draggedItem?.kind === 'folder' && dnd.draggedItem.id === folder.id}
          />
          );
        })}
        {directItems.map((it) => (
          <div
            key={it.id}
            className={`${isOwner ? 'cursor-grab active:cursor-grabbing' : ''} ${
              dnd.draggedItem?.kind === 'card' && dnd.draggedItem.id === it.id ? 'opacity-40' : ''
            }`}
            onPointerDown={(e) => dnd.handlePointerDown(e, { kind: 'card', id: it.id })}
          >
            {renderCard(it)}
          </div>
        ))}
        {currentFolderId === null && childFolders.length > 0 && (
          <UnfiledDropZone entityType={entityType} isDropActive={dnd.dropTarget?.type === 'unfiled'} />
        )}
      </>
    );
  }

  // Vista "Tutti": tutte le card della sezione (a qualunque profondita' di
  // cartella), ordinate alfabeticamente invece che navigabili per cartella -
  // niente FolderRow/breadcrumb/drag qui, il filtro dedicato resta l'unico
  // posto dove le cartelle si vedono e si organizzano (renderFolderedSection
  // sopra). Stesso comparator di MyCharactersPage.tsx (sort by name, 'it',
  // sensitivity 'base'). Nessun wrapper attorno a renderCard: i render*Card
  // impostano gia' key={item.id} sull'EntityCard restituita.
  function renderFlatSection<T extends { id: string; name: string }>(
    items: T[],
    renderCard: (item: T) => React.ReactNode,
  ) {
    return [...items]
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' }))
      .map(renderCard);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto text-left select-none">
      <div className="relative">
        {activeCampaign ? (
          <CampaignCoverEditor campaign={activeCampaign} canEdit={isOwner} onUpdate={handleCoverUpdate} />
        ) : (
          <div className="h-60 w-full shrink-0 bg-[var(--dash-panel)]" />
        )}

        {/* Riga pulsanti sessione + pillole quick-filter sovrapposta al
            banner, non sotto - stessa griglia 320px/1fr E stesso gap-6 della
            sezione contenuti qui sotto (md:grid-cols-[320px_1fr]) cosi' le
            due righe restano allineate sia verticalmente sia orizzontalmente
            (un gap-3 qui, diverso dal gap-6 sotto, aveva spostato di 12px la
            colonna 2 - da qui il disallineamento del titolo "Personaggi"
            rispetto a "PNG"/"Mostri" piu' sotto nella griglia delle card).
            absolute (non contribuisce all'altezza del contenitore relative,
            che resta quella del solo banner) - z-40, sopra tutto cio' che
            c'e' nel banner (max z-30 li' dentro).

            bottom-2 (non top-[88%]): un ancoraggio percentuale dall'alto è
            una frazione dell'altezza REALE del contenitore, che pero' non è
            costante - h-60 fisso (240px) senza immagine, aspect-[3.8/1]
            variabile con la larghezza pagina (es. ~368px) con immagine. Lo
            stesso 88% produceva quindi un residuo diverso in pixel tra il
            fondo della riga e il fondo del banner nei due casi, e il pt-4
            del contenuto sotto si sommava sopra un residuo già diverso -
            da qui la distanza incoerente segnalata. Un ancoraggio fisso dal
            basso rende quel residuo costante indipendentemente dall'altezza
            del contenitore, in entrambi i rami. */}
        {playersLoaded && (
          <div className="absolute inset-x-0 bottom-2 z-40 grid grid-cols-1 gap-6 px-8 md:grid-cols-[320px_1fr]">
            <div className="flex flex-col gap-3">
              {isOwner && (
                <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleToggleSession}
                  disabled={isToggling}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    sessionActive
                      ? 'border-red-800 bg-red-900/40 text-red-200 hover:bg-red-900/60'
                      : 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]'
                  }`}
                >
                  {isToggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : sessionActive ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {sessionActive ? 'Termina' : 'Avvia sessione'}
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
                    >
                      {inviteCopied ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
                      {inviteCopied ? 'Copiato!' : 'Invita giocatori'}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-56 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-text)]"
                  >
                    <DropdownMenuItem
                      onSelect={handleInvitePlayers}
                      className="text-[var(--dash-text)] focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]"
                    >
                      <KeyRound className="h-4 w-4" /> Copia codice invito
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setShowInviteByNameModal(true)}
                      className="text-[var(--dash-text)] focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]"
                    >
                      <Users className="h-4 w-4" /> Invita per nome…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {activeCampaign && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
                        aria-label="Menu campagna"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-64 border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-text)]"
                    >
                      <DropdownMenuItem
                        onSelect={() => setShowEditForm(true)}
                        className="text-[var(--dash-text)] focus:bg-[var(--dash-surface-2)] focus:text-[var(--dash-text-strong)]"
                      >
                        <Pencil className="h-4 w-4" /> Impostazioni Campagna
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="text-[var(--dash-text)]">
                        <Copy className="h-4 w-4" /> Duplica Campagna
                        <span className="ml-auto text-[10px] text-[var(--dash-muted)]">Prossimamente</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="text-[var(--dash-text)]">
                        <UserCog className="h-4 w-4" /> Seleziona nuovo Game Master
                        <span className="ml-auto text-[10px] text-[var(--dash-muted)]">Prossimamente</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="text-[var(--dash-text)]">
                        <FileDown className="h-4 w-4" /> Esporta le note
                        <span className="ml-auto text-[10px] text-[var(--dash-muted)]">Prossimamente</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[var(--dash-border-soft)]" />
                      <DropdownMenuItem
                        onSelect={() => setConfirmDeleteOpen(true)}
                        className="text-[var(--dash-danger-text)] focus:bg-[var(--dash-danger-bg)] focus:text-[var(--dash-danger-text)]"
                      >
                        <Trash2 className="h-4 w-4" /> Cancella campagna
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[var(--dash-border-soft)]" />
                      <div className="px-2 py-1.5 text-xs text-[var(--dash-muted)]">
                        Creata da {gmDisplayName ?? 'Game Master'} il{' '}
                        {new Date(activeCampaign.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setActiveQuickFilter('all')} className={pillClass(activeQuickFilter === 'all')}>
                <LayoutGrid className="h-3.5 w-3.5" /> Tutti
              </button>
              <button type="button" onClick={() => setActiveQuickFilter('pg')} className={pillClass(activeQuickFilter === 'pg')}>
                <Users className="h-3.5 w-3.5" /> Personaggi
              </button>
              <button type="button" onClick={() => setActiveQuickFilter('premades')} className={pillClass(activeQuickFilter === 'premades')}>
                <Package className="h-3.5 w-3.5" /> Precompilati
              </button>
              <button type="button" onClick={() => setActiveQuickFilter('npc')} className={pillClass(activeQuickFilter === 'npc')}>
                <Ghost className="h-3.5 w-3.5" /> PNG
              </button>
              <button type="button" onClick={() => setActiveQuickFilter('monster')} className={pillClass(activeQuickFilter === 'monster')}>
                <Skull className="h-3.5 w-3.5" /> Mostri
              </button>
            </div>
          </div>
        )}
      </div>

      {/* pt-4: spazio tra la fine del banner/riga pulsanti overlay
          (top-[88%] li' sopra) e l'inizio di questa griglia - "Personaggi"
          (prime card, subito qui sotto) non ha un header in griglia con
          margine proprio come "PNG"/"Mostri" (mt-2 + gap-4 interno,
          invariato) piu' sotto. pt-12, pt-8, pt-6, pt-4 e pt-2 (round
          precedenti) lasciavano ancora una fascia vuota eccessiva sotto la
          riga pulsanti - pt-1 e' meno del valore originale del contenitore
          (pt-6), a compensare lo spazio gia' presente sotto la riga
          overlay del banner (ora bottom-2, altezza-indipendente). */}
      <div className="flex flex-1 flex-col gap-6 p-8 pt-1">
      {playersLoaded && (
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-[320px_1fr]">
          {/* Colonna 1: card GM compatta (non il riquadro verticale con
              portrait grande) - niente "truncate" sul nome, il testo va a
              capo se serve invece di tagliarsi a un carattere come nelle
              versioni precedenti confinate in una colonna troppo stretta.
              La riga pulsanti sessione che stava qui è ora sovrapposta al
              banner qui sopra (stessa griglia 320px/1fr), non più qui. */}
          <div className="flex flex-col gap-3">
            {activeSectionHeaderSpacerClass && (
              <div className={activeSectionHeaderSpacerClass} />
            )}
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-3">
              {gmAvatarUrl ? (
                <img
                  src={gmAvatarUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--dash-accent)] text-sm font-semibold text-[var(--dash-text-strong)]">
                  {gmInitial}
                </span>
              )}
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="break-words text-sm font-medium text-[var(--dash-text-strong)]">{gmDisplayName ?? 'Game Master'}</span>
                <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--dash-accent-2)]">
                  GM
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--dash-text-strong)]">Note di campagna</h3>
              <CampaignNotesPanel
                campaignId={activeCampaign.id}
                accessToken={session?.access_token}
                canEdit={isOwner}
                savedTabOrder={activeCampaign.tabOrder}
                onPersistTabOrder={(order) => updateCampaign(activeCampaign.id, { tabOrder: order })}
              />
            </div>
          </div>

          {/* Colonna 2+3: la riga titolo+pillole che stava qui è ora
              sovrapposta al banner qui sopra (stessa griglia 320px/1fr),
              non più qui - resta solo la griglia delle card. */}
          <div className="flex flex-col gap-3">

          {/* sempre esattamente 2 card per riga (grid-cols-2, non auto-fill)
              - le due colonne 1fr si espandono per riempire tutto lo spazio
              a destra della colonna 1, non restano piccole. minmax(200px,1fr)
              invece del semplice 1fr: stesso numero di colonne garantito, ma
              con un minimo protetto che evita la stessa classe di bug di
              troncamento vista finora se lo schermo e' stretto. */}
          <div ref={foldersContainerRef} className="grid grid-cols-[repeat(2,minmax(200px,1fr))] content-start gap-4">
            {/* Personaggi: tornato al comportamento pre-cartelle (nessuna
                cartella, nessuna icona "crea cartella", card sciolte come
                nella Fase 2 originale) - un eventuale folder_id residuo su
                un PG (da test interni) e' ignorato qui, non causa errori:
                il PG compare comunque nella lista piatta, il campo resta
                semplicemente inutilizzato per questa sezione. */}
            {(activeQuickFilter === 'all' || activeQuickFilter === 'pg') && (
              <>
                <FolderSectionHeader icon={Users} label="Personaggi" isOwner={isOwner} />
                {playerRows.map((row) =>
                  row.characters.length > 0 ? (
                    row.characters.map((ch) => renderCharacterCard(ch, row))
                  ) : (
                    <EntityCard
                      key={row.profileId}
                      variant="grid"
                      name={row.displayName ?? 'Giocatore'}
                      badge={
                        <span className="inline-flex items-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--dash-muted)]">
                          Nessun personaggio
                        </span>
                      }
                    />
                  )
                )}
              </>
            )}

            {activeQuickFilter === 'premades' && (
              <>
                <FolderSectionHeader
                  icon={Package} label="Precompilati" isOwner={isOwner}
                  onCreateFolder={() => handleCreateFolder('premade', setPremadeFolders, premadeCurrentFolderId)}
                  disabledReason={premadeCreateDisabledReason}
                />
                {premadeFolderPath.length > 0 && (
                  <FolderBreadcrumb
                    sectionLabel="Precompilati" path={premadeFolderPath} entityType="premade"
                    dropTarget={premadeFolderDnd.dropTarget} onNavigate={setPremadeCurrentFolderId}
                  />
                )}
                {renderFolderedSection('premade', premadeFolders, setPremadeFolders, premadeFolderDnd, availablePremades, renderPremadeCard, {
                  currentFolderId: premadeCurrentFolderId, setCurrentFolderId: setPremadeCurrentFolderId, foldersById: premadeFoldersById,
                })}
                {availablePremades.length === 0 && (
                  <div className="col-span-2 rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-5 py-8 text-center">
                    <Package className="mx-auto mb-3 h-10 w-10 text-[var(--dash-muted)]" />
                    <div className="text-xs uppercase tracking-[0.16em] text-[var(--dash-accent-2)]">Nessun personaggio precompilato disponibile</div>
                    <p className="mt-2 text-xs text-[var(--dash-muted)]">
                      Marca un PG come "Disponibile per i giocatori" dal menu ⋮ in Personaggi per farlo comparire qui.
                    </p>
                  </div>
                )}
              </>
            )}

            {(activeQuickFilter === 'all' || activeQuickFilter === 'npc') && npcSectionVisible && (
              <>
                {activeQuickFilter === 'npc' ? (
                  <FolderSectionHeader
                    icon={Ghost} label="PNG" isOwner={isOwner}
                    onCreateFolder={() => handleCreateFolder('npc', setNpcFolders, npcCurrentFolderId)}
                    disabledReason={npcCreateDisabledReason}
                  />
                ) : (
                  <FolderSectionHeader icon={Ghost} label="PNG" isOwner={isOwner} />
                )}
                {activeQuickFilter === 'npc' && npcFolderPath.length > 0 && (
                  <FolderBreadcrumb
                    sectionLabel="PNG" path={npcFolderPath} entityType="npc"
                    dropTarget={npcFolderDnd.dropTarget} onNavigate={setNpcCurrentFolderId}
                  />
                )}
                {activeQuickFilter === 'npc'
                  ? renderFolderedSection('npc', npcFolders, setNpcFolders, npcFolderDnd, npcs, renderNpcCard, {
                      currentFolderId: npcCurrentFolderId, setCurrentFolderId: setNpcCurrentFolderId, foldersById: npcFoldersById,
                    })
                  : renderFlatSection(npcs, renderNpcCard)}
              </>
            )}

            {(activeQuickFilter === 'all' || activeQuickFilter === 'monster') && monsterSectionVisible && (
              <>
                {activeQuickFilter === 'monster' ? (
                  <FolderSectionHeader
                    icon={Skull} label="Mostri" isOwner={isOwner}
                    onCreateFolder={() => handleCreateFolder('monster', setMonsterFolders, monsterCurrentFolderId)}
                    disabledReason={monsterCreateDisabledReason}
                  />
                ) : (
                  <FolderSectionHeader icon={Skull} label="Mostri" isOwner={isOwner} />
                )}
                {activeQuickFilter === 'monster' && monsterFolderPath.length > 0 && (
                  <FolderBreadcrumb
                    sectionLabel="Mostri" path={monsterFolderPath} entityType="monster"
                    dropTarget={monsterFolderDnd.dropTarget} onNavigate={setMonsterCurrentFolderId}
                  />
                )}
                {activeQuickFilter === 'monster'
                  ? renderFolderedSection('monster', monsterFolders, setMonsterFolders, monsterFolderDnd, monsters, renderMonsterCard, {
                      currentFolderId: monsterCurrentFolderId, setCurrentFolderId: setMonsterCurrentFolderId, foldersById: monsterFoldersById,
                    })
                  : renderFlatSection(monsters, renderMonsterCard)}
              </>
            )}
          </div>
          </div>
        </div>
      )}

      <DragGhost dnd={premadeFolderDnd} folders={premadeFolders} items={availablePremades} renderCard={renderPremadeGhostCard} />
      <DragGhost dnd={npcFolderDnd} folders={npcFolders} items={npcs} renderCard={renderNpcGhostCard} />
      <DragGhost dnd={monsterFolderDnd} folders={monsterFolders} items={monsters} renderCard={renderMonsterGhostCard} />

      {copyDialogChar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-semibold text-[var(--dash-text-strong)]">Copia in un'altra campagna</h3>
            <p className="mb-4 text-sm text-[var(--dash-muted)]">
              "{copyDialogChar.name}" verrà copiato (l'originale resta qui) nella campagna scelta, con lo stesso proprietario.
            </p>
            {copyCharError && (
              <div className="mb-3 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {copyCharError}
              </div>
            )}
            {compatibleCopyTargets(copyDialogChar).length === 0 ? (
              <p className="mb-4 text-sm text-[var(--dash-muted)]">Nessun'altra tua campagna compatibile per ruleset.</p>
            ) : (
              <div className="mb-4 flex flex-col gap-1.5">
                {compatibleCopyTargets(copyDialogChar).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCopyTargetCampaignId(c.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      copyTargetCampaignId === c.id
                        ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 text-[var(--dash-text-strong)]'
                        : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCopyDialogChar(null); setCopyTargetCampaignId(null); setCopyCharError(null); }}
                disabled={isCopyingChar}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmCopyCharacter}
                disabled={!copyTargetCampaignId || isCopyingChar}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)] disabled:opacity-50"
              >
                {isCopyingChar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Copia
              </button>
            </div>
          </div>
        </div>
      )}


      {removePlayerTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-2 font-semibold text-[var(--dash-text-strong)]">Rimuovere il giocatore dalla campagna?</h3>
            <p className="mb-3 text-sm text-[var(--dash-muted)]">
              {removePlayerTarget.displayName ?? 'Il giocatore'} e tutti i suoi personaggi verranno rimossi da questa campagna. L'account e i personaggi restano intatti, semplicemente non parteciperanno più qui.
            </p>
            {removePlayerError && (
              <div className="mb-3 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {removePlayerError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemovePlayerTarget(null)}
                disabled={isRemovingPlayer}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmRemovePlayer}
                disabled={isRemovingPlayer}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm font-semibold text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-border)]"
              >
                {isRemovingPlayer && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Rimuovi
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCharacter && (
        <CharacterCreationWizard
          onClose={() => setEditingCharacter(null)}
          onAdd={handleSaveEditedCharacter}
          existingCharacters={charactersRaw.filter((r) => r.id !== editingCharacter.id).map((r) => ({ id: r.id, name: r.name }))}
          initialCharacter={editingCharacter}
        />
      )}

      {deleteCharTarget && (
        <ConfirmDialog
          title="Eliminare questo personaggio?"
          message={`"${deleteCharTarget.name}" e tutti i suoi dati verranno eliminati definitivamente. Questa azione non è reversibile.`}
          confirmLabel="Elimina"
          onConfirm={handleConfirmDeleteCharacter}
          onCancel={() => setDeleteCharTarget(null)}
        />
      )}

      {releaseCharTarget && (
        <ConfirmDialog
          title="Rilasciare questo personaggio?"
          message={`"${releaseCharTarget.name}" tornerà al GM e sarà di nuovo disponibile per altri giocatori. Tutte le statistiche e le tab restano intatte.`}
          confirmLabel="Rilascia"
          danger={false}
          onConfirm={handleConfirmReleaseCharacter}
          onCancel={() => setReleaseCharTarget(null)}
        />
      )}

      {unassignCharTarget && (
        <ConfirmDialog
          title="Rimuovere il personaggio dalla campagna?"
          message={`"${unassignCharTarget.name}" non verrà eliminato: resterà nel database del giocatore, semplicemente non farà più parte di questa campagna.`}
          confirmLabel="Rimuovi"
          danger={false}
          onConfirm={handleConfirmUnassignCharacter}
          onCancel={() => setUnassignCharTarget(null)}
        />
      )}

      {iconPickerTarget && (
        <FolderIconPicker
          selectedIconId={iconPickerTarget.folder.icon}
          onSelect={handleSelectFolderIcon}
          onClose={() => setIconPickerTarget(null)}
        />
      )}

      {deleteFolderTarget && (
        <ConfirmDialog
          title="Eliminare questa cartella?"
          message={
            deleteFolderCascadeContent
              ? `"${deleteFolderTarget.name}" e tutto il suo contenuto verranno eliminati definitivamente. Questa azione non è reversibile.`
              : `"${deleteFolderTarget.name}" verrà eliminata. Le card al suo interno non vengono eliminate: torneranno semplicemente senza cartella.`
          }
          confirmLabel={deleteFolderCascadeContent ? 'Elimina tutto' : 'Elimina'}
          extraContent={deleteFolderContents && (
            <label className="flex items-start gap-2 text-sm text-[var(--dash-text)]">
              <input
                type="checkbox"
                checked={deleteFolderCascadeContent}
                onChange={(e) => setDeleteFolderCascadeContent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Elimina anche il contenuto: {deleteFolderContents.itemCount} {deleteFolderContents.itemLabel}
                {deleteFolderContents.folderCount > 0 && ` e ${deleteFolderContents.folderCount} sotto-cartell${deleteFolderContents.folderCount === 1 ? 'a' : 'e'}`}
                {' '}verranno eliminati definitivamente.
              </span>
            </label>
          )}
          onConfirm={handleConfirmDeleteFolder}
          onCancel={() => setDeleteFolderTarget(null)}
        />
      )}

      {copyEntityDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-semibold text-[var(--dash-text-strong)]">Copia in un'altra campagna</h3>
            <p className="mb-4 text-sm text-[var(--dash-muted)]">
              "{copyEntityDialog.name}" verrà copiato (l'originale resta qui) nella campagna scelta.
            </p>
            {copyEntityError && (
              <div className="mb-3 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {copyEntityError}
              </div>
            )}
            {compatibleCopyEntityTargets().length === 0 ? (
              <p className="mb-4 text-sm text-[var(--dash-muted)]">Nessun'altra tua campagna compatibile per ruleset.</p>
            ) : (
              <div className="mb-4 flex flex-col gap-1.5">
                {compatibleCopyEntityTargets().map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCopyEntityTargetId(c.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      copyEntityTargetId === c.id
                        ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/15 text-[var(--dash-text-strong)]'
                        : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCopyEntityDialog(null); setCopyEntityTargetId(null); setCopyEntityError(null); }}
                disabled={isCopyingEntity}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmCopyEntity}
                disabled={!copyEntityTargetId || isCopyingEntity}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)] disabled:opacity-50"
              >
                {isCopyingEntity && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Copia
              </button>
            </div>
          </div>
        </div>
      )}

      {unassignEntityTarget && (
        <ConfirmDialog
          title="Rimuovere dalla campagna?"
          message={`"${unassignEntityTarget.name}" non verrà eliminato: resterà nel database, semplicemente non farà più parte di questa campagna.`}
          confirmLabel="Rimuovi"
          onConfirm={handleConfirmUnassignEntity}
          onCancel={() => setUnassignEntityTarget(null)}
        />
      )}

      {deleteEntityTarget && (
        <ConfirmDialog
          title="Eliminare definitivamente?"
          message={`"${deleteEntityTarget.name}" verrà eliminato definitivamente. Questa azione non è reversibile.`}
          confirmLabel="Elimina"
          onConfirm={handleConfirmDeleteEntity}
          onCancel={() => setDeleteEntityTarget(null)}
        />
      )}

      {showInviteByNameModal && activeCampaign && (
        <InviteByNameModal
          campaignId={activeCampaign.id}
          onClose={() => setShowInviteByNameModal(false)}
        />
      )}

      {showEditForm && activeCampaign && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-[var(--dash-text-strong)]">Impostazioni Campagna</h3>
            {editError && (
              <div className="mb-4 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {editError}
              </div>
            )}
            <CampaignForm
              initial={activeCampaign}
              onSave={handleEditCampaign}
              onCancel={() => { setShowEditForm(false); setEditError(null); }}
              isSubmitting={isSubmittingEdit}
            />
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-2 font-semibold text-[var(--dash-text-strong)]">Elimina campagna</h3>
            <p className="mb-3 text-sm text-[var(--dash-muted)]">
              Questa azione è irreversibile. Tutti i dati della campagna nel server saranno eliminati.
            </p>
            {deleteError && (
              <div className="mb-3 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)]">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={isDeleting}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleDeleteCampaign}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm font-semibold text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-border)]"
              >
                {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {autoClosedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-800 bg-amber-900/30 px-4 py-2 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          La sessione precedente era rimasta attiva da più di un'ora senza attività ed è stata chiusa automaticamente.
        </div>
      )}

      {!isOwner && (
        <div className="flex flex-col items-center gap-3 text-center">
          {!sessionActive ? (
            <p className="text-sm text-[var(--dash-muted)]">
              In attesa che il Game Master avvii la sessione di gioco...
            </p>
          ) : gmOnline ? (
            <p className="text-sm text-[var(--dash-accent-2)]">
              Sessione in corso — pronta per giocare.
            </p>
          ) : (
            <p className="text-sm text-[var(--dash-muted)]">
              Sessione in pausa: il Game Master si è momentaneamente disconnesso. Attendi il suo ritorno.
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
