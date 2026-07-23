import { useState } from 'react';
import { Trash2, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { type Folder } from '../../../services/supabase/foldersService';
import { getFolderIconComponent } from './folderIconCatalog';

// Quante scorciatoie a discendenti mostrare prima di "+N altre" (righe 2
// wrap ragionevoli anche con parecchi discendenti) - vedi FolderRow sotto.
// Default per il grid a 2 colonne di CampaignHome (~200px+ per colonna) -
// SessionCharactersPanel.tsx (Fase 4, colonna fissa 256px) passa un valore
// ridotto tramite la prop sotto, altrimenti 10 scorciatoie in wrap
// occuperebbero piu' righe di quante ne valga la pena in cosi' poco spazio.
const DEFAULT_MAX_VISIBLE_DESCENDANT_SHORTCUTS = 10;

// Riga di una singola cartella (drill-down: click = entra dentro, il
// contenuto della cartella sostituisce la vista invece di espandersi sotto -
// vedi FolderBreadcrumb per la navigazione di ritorno). data-folder-id +
// data-folder-entity-type sono gli hook per useFolderDragDrop - vedi il
// commento su resolveFolderDropTarget in useFolderDragDrop.ts per il perche'
// serve anche l'entity-type (le 4 sezioni condividono lo stesso containerRef).
// Rinomina inline al click sul nome: stesso pattern di renamingTabId/
// renameDraft in useEntityTabs.ts (autoFocus, Enter conferma, Escape annulla,
// blur conferma).
export function FolderRow({
  folder, onEnter, count, descendantFolders, onNavigateTo, canEdit, isRenaming, renameDraft, onRenameDraftChange,
  onStartRename, onCommitRename, onCancelRename, onRequestDelete, onOpenIconPicker, onPointerDown, dropState, isDimmed,
  maxVisibleDescendantShortcuts = DEFAULT_MAX_VISIBLE_DESCENDANT_SHORTCUTS,
}: {
  folder: Folder;
  /** Naviga dentro la cartella (drill-down) - visibile/utilizzabile anche
   *  da chi non puo' modificare (sola lettura puo' comunque sfogliare). */
  onEnter: () => void;
  count: number;
  /** Tutti i discendenti (a qualunque profondita', pre-order) - vedi
   *  getDescendantFolders in foldersService.ts. Riga di scorciatoie sotto
   *  al nome, assente se vuoto (cartella senza sotto-cartelle, la
   *  maggioranza). */
  descendantFolders: Folder[];
  /** Salta direttamente a un discendente (stesso setCurrentFolderId gia'
   *  usato da onEnter per il drill-down normale) - il breadcrumb si
   *  ricostruisce da solo al render successivo (getFolderPath non
   *  distingue un salto diretto da una navigazione sequenziale). */
  onNavigateTo: (folderId: string) => void;
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
  /** Vero mentre e' proprio questa cartella a essere trascinata (valorizzato
   *  solo dopo la soglia di movimento DRAG_THRESHOLD_PX, non al semplice
   *  mousedown) - guida sia l'attenuazione (opacity-40, stesso valore gia'
   *  usato per le tab in EntityTabBar.tsx) sia il cursore "grabbing": legato
   *  allo stato reale del drag invece di :active (che scattava anche per un
   *  click semplice, prima ancora di sapere se sarebbe diventato un drag). */
  isDimmed: boolean;
  /** Tetto scorciatoie a discendenti prima di "+N altre" - vedi il commento
   *  sulla costante di default sopra. */
  maxVisibleDescendantShortcuts?: number;
}) {
  // Solo UI, transitorio - nessun altro consumer ne ha bisogno, non serve
  // sollevarlo al genitore (si azzera comunque quando questa riga smonta,
  // es. dopo un salto che cambia la vista corrente).
  const [expanded, setExpanded] = useState(false);
  const visibleDescendants = expanded ? descendantFolders : descendantFolders.slice(0, maxVisibleDescendantShortcuts);
  const hiddenCount = descendantFolders.length - visibleDescendants.length;

  return (
    <div
      data-folder-id={folder.id}
      data-folder-entity-type={folder.entityType}
      onPointerDown={canEdit ? onPointerDown : undefined}
      // onEnter sull'intero contenitore (non solo sulla riga 1): con la
      // riga 2 delle scorciatoie ai discendenti, un click nella meta'
      // inferiore della cartella non apriva piu' nulla, perche' onEnter era
      // agganciato solo al <button> della riga 1. Ogni bersaglio piu'
      // specifico (icona -> cambia icona, nome -> rinomina, elimina,
      // icone/"+N altre" delle scorciatoie) ferma la risalita con
      // stopPropagation - vedi i rispettivi onClick sotto - cosi' resta
      // distinto invece di aprire anche la cartella.
      onClick={onEnter}
      className={`group col-span-2 flex flex-col gap-1 rounded-xl border px-3 py-2 transition-colors ${
        dropState === 'valid'
          ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/10'
          : dropState === 'invalid'
          ? 'border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)]'
          : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)]'
      } ${isDimmed ? 'cursor-grabbing opacity-40' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {(() => {
            const Icon = getFolderIconComponent(folder.icon);
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
        </div>
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
      {descendantFolders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pl-6">
          {visibleDescendants.map((d) => {
            const DescIcon = getFolderIconComponent(d.icon);
            return (
              <Tooltip key={d.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-no-drag
                    onClick={(e) => { e.stopPropagation(); onNavigateTo(d.id); }}
                    className="rounded p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-accent-2)]"
                  >
                    <DescIcon className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{d.name}</TooltipContent>
              </Tooltip>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              data-no-drag
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              className="text-[11px] text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text-strong)]"
            >
              +{hiddenCount} altre
            </button>
          )}
          {expanded && descendantFolders.length > maxVisibleDescendantShortcuts && (
            <button
              type="button"
              data-no-drag
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              className="text-[11px] text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text-strong)]"
            >
              Mostra meno
            </button>
          )}
        </div>
      )}
    </div>
  );
}
