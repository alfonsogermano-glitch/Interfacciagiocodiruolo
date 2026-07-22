import { type FolderEntityType } from '../../../services/supabase/foldersService';
import { UNFILED_DROP_ID } from '../session/shared/useFolderDragDrop';

// Striscia "Senza cartella": bersaglio esplicito per togliere una card da
// una cartella (invece di rendere tutta l'area sparsa delle card sciolte un
// hit-target implicito, che avrebbe richiesto di avvolgerle in un unico div
// e romperebbe il flusso a griglia condiviso - vedi piano Fase 2). Mostrata
// solo se la sezione ha almeno una cartella: con zero cartelle tutte le card
// sono gia' banalmente "sciolte", nessun'etichetta serve.
// (Fase 7 aveva aggiunto una zona gemella dentro le cartelle stesse
// ("Rimuovi da questa cartella") - rimossa: il drag sul breadcrumb copre la
// stessa necessita' in modo piu' naturale, senza un elemento dedicato in piu'.)
export function UnfiledDropZone({ entityType, isDropActive }: { entityType: FolderEntityType; isDropActive: boolean }) {
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
