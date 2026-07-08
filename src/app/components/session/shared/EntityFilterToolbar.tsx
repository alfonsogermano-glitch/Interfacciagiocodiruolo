import type { ReactNode } from 'react';
import { Search, LayoutGrid, List } from 'lucide-react';

// Ricerca/ordinamento/vista genuinamente riusabili tra contesti diversi
// (indagati confrontando MonstersManager.tsx con MyCharactersPage.tsx): i
// filtri legati a campagna/ambito/avventura restano invece specifici di
// ciascun contesto e vanno passati come `children`, non qui.
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
  // Filtri/pill specifici del contesto chiamante (es. assegnato/non assegnato
  // a una campagna), renderizzati nella stessa riga tra ordinamento e vista.
  children?: ReactNode;
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
}: EntityFilterToolbarProps) {
  return (
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
  );
}
