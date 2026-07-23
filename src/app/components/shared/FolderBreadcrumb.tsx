import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { type Folder, type FolderEntityType } from '../../../services/supabase/foldersService';
import { UNFILED_DROP_ID, type FolderDropTarget } from '../session/shared/useFolderDragDrop';

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
export function FolderBreadcrumb({
  sectionLabel, path, entityType, dropTarget, onNavigate, compact = false,
}: {
  sectionLabel: string;
  path: Folder[];
  entityType: FolderEntityType;
  dropTarget: FolderDropTarget | null;
  onNavigate: (folderId: string | null) => void;
  /** true = una sola riga senza wrap (colonna stretta, es.
   *  SessionCharactersPanel.tsx Fase 4): i segmenti non correnti si
   *  troncano a una larghezza fissa piccola, quello corrente (l'ultimo, in
   *  grassetto - dove ci si trova ora) prende lo spazio restante e resta
   *  sempre il piu' leggibile. Default false = comportamento invariato
   *  (flex-wrap, nessun troncamento) per CampaignHome.tsx. */
  compact?: boolean;
}) {
  return (
    <div className={`col-span-2 flex items-center gap-1 text-xs text-[var(--dash-muted)] ${compact ? 'flex-nowrap overflow-hidden' : 'flex-wrap'}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onNavigate(null)}
            data-folder-id={UNFILED_DROP_ID}
            data-folder-entity-type={entityType}
            data-folder-breadcrumb="true"
            className={`transition-colors ${compact ? 'shrink-0 truncate' : ''} ${
              isBreadcrumbDropActive(dropTarget, UNFILED_DROP_ID) ? 'text-[var(--dash-accent-2)]' : 'hover:text-[var(--dash-text-strong)]'
            }`}
            style={compact ? { maxWidth: 56 } : undefined}
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
              compact ? (isCurrent ? 'min-w-0 flex-1' : 'shrink-0') : ''
            } ${
              isCurrent
                ? 'font-semibold text-[var(--dash-text-strong)]'
                : isBreadcrumbDropActive(dropTarget, folder.id)
                ? 'text-[var(--dash-accent-2)]'
                : 'hover:text-[var(--dash-text-strong)]'
            }`}
            style={compact && !isCurrent ? { maxWidth: 56 } : undefined}
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
