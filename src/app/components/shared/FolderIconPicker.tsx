import { Folder, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { FOLDER_ICON_OPTIONS } from './folderIconCatalog';

/**
 * Modale "scegli un'icona": stessa struttura di ImageAssetPicker.tsx
 * (backdrop + pannello + griglia + onSelect/onClose), ma restilizzata con i
 * token var(--dash-*) gia' usati in tutto CampaignHome.tsx (non il
 * meccanismo getCurrentPaletteColors()/style inline di ImageAssetPicker,
 * che appartiene a un altro contesto di tema). Nessun fetch: il set di
 * icone e' curato/statico (folderIconCatalog.ts), niente stato di
 * caricamento.
 */
export function FolderIconPicker({
  selectedIconId, onSelect, onClose,
}: {
  selectedIconId: string | null;
  onSelect: (iconId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-[var(--dash-text-strong)]">Icona cartella</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-full p-1 text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text-strong)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-6 gap-2 overflow-y-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelect(null)}
                aria-label="Predefinita"
                className={`flex aspect-square items-center justify-center rounded-xl border transition-colors ${
                  selectedIconId === null
                    ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/10 text-[var(--dash-accent-2)]'
                    : 'border-[var(--dash-border-soft)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)]/60'
                }`}
              >
                <Folder className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Predefinita</TooltipContent>
          </Tooltip>
          {FOLDER_ICON_OPTIONS.map(({ id, icon: Icon, label }) => (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-label={label}
                  className={`flex aspect-square items-center justify-center rounded-xl border transition-colors ${
                    selectedIconId === id
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/10 text-[var(--dash-accent-2)]'
                      : 'border-[var(--dash-border-soft)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)]/60'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
