import { FolderPlus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

// Riga in cima a ciascuna delle 4 sezioni della griglia: icona+etichetta
// (era gia' presente per PNG/Mostri come <h2 col-span-2>, ma solo quando
// activeQuickFilter === 'all' - qui invece sempre visibile e uniformata
// anche a Personaggi/Precompilati, che prima non avevano alcuna
// intestazione) + pulsante "Nuova cartella", solo GM (le cartelle sono
// gestite solo dal GM, visibili identiche a tutti - vedi piano Fase 2).
export function FolderSectionHeader({
  icon: Icon, label, isOwner, onCreateFolder, disabledReason = null,
}: {
  icon: typeof FolderPlus;
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
    // stesso spaziatore costante in colonna 1 (vedi activeSectionHeaderSpacerClass
    // in CampaignHome.tsx) elimina il salto invece di ammorbidirlo con una
    // transizione.
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
