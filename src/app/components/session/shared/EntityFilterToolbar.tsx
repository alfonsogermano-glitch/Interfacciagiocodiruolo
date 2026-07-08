import type { ReactNode } from 'react';
import { Search, LayoutGrid, List, ListFilter } from 'lucide-react';

// Ricerca/ordinamento/vista/toggle-filtri genuinamente riusabili tra
// contesti diversi (indagati confrontando MonstersManager.tsx con
// MyCharactersPage.tsx): il *contenuto* dei filtri (campagna/avventura/tag)
// resta invece specifico di ciascun contesto chiamante e va passato come
// `children`/`filtersPanel`, non definito qui.
export type SortMode = 'recent' | 'oldest' | 'updated' | 'name' | 'name-desc';
export type ViewMode = 'grid' | 'list';

interface EntityFilterToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  sort: SortMode;
  onSortChange: (mode: SortMode) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  // Filtri/pill rapidi specifici del contesto chiamante (es. assegnato/non
  // assegnato a una campagna), renderizzati nella stessa riga tra
  // ordinamento e pulsante Filtri.
  children?: ReactNode;
  // Pannello "Filtri avanzati" (contenuto specifico del contesto, es. select
  // Campagna/Avventura). Se omesso, il pulsante "Filtri" non viene mostrato.
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
  filtersPanel?: ReactNode;
}

export function EntityFilterToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Cerca...',
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
  children,
  filtersOpen,
  onToggleFilters,
  filtersPanel,
}: EntityFilterToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dash-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-48 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] py-1.5 pl-8 pr-3 text-xs text-[var(--dash-text)] outline-none transition-colors focus:border-[var(--dash-accent)]"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
          className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-3 py-1.5 text-xs text-[var(--dash-text)]"
        >
          <option value="recent">Ordina: Più recenti</option>
          <option value="oldest">Ordina: Meno recenti</option>
          <option value="updated">Ordina: Ultima modifica</option>
          <option value="name">Ordina: Nome (A-Z)</option>
          <option value="name-desc">Ordina: Nome (Z-A)</option>
        </select>

        {children}

        {filtersPanel && onToggleFilters && (
          <button
            type="button"
            onClick={onToggleFilters}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              filtersOpen
                ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
            }`}
          >
            <ListFilter className="h-3.5 w-3.5" />
            Filtri
          </button>
        )}

        <div className="ml-auto flex gap-1 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-1">
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            aria-label="Vista a griglia"
            title="Vista a griglia"
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            aria-label="Vista a lista"
            title="Vista a lista"
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filtersOpen && filtersPanel && (
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/95 p-4 shadow-xl shadow-black/10">
          <div className="mb-3 text-xs uppercase tracking-[0.14em] text-[var(--dash-accent-2)]">
            Filtri avanzati
          </div>
          {filtersPanel}
        </div>
      )}
    </div>
  );
}
