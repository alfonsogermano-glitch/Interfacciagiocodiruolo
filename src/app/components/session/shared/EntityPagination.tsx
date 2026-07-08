// Paginazione client-side generica, estratta da MonstersManager.tsx
// (archivePage/archivePageSize/archiveTotalPages) - stessa logica esatta,
// nessuna dipendenza da campagna. Riusabile da qualunque lista gia' caricata
// in memoria (PG/PNG/Mostri di MyCharactersPage.tsx, e in futuro anche
// MonstersManager.tsx stesso).
export const PAGE_SIZE_OPTIONS = [6, 9, 12, 18, 24] as const;

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = items.length === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(items.length, startIndex + pageSize);

  return {
    pageItems: items.slice(startIndex, endIndex),
    totalPages,
    safePage,
    startIndex,
    endIndex,
  };
}

interface EntityPaginationProps {
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  totalPages: number;
  startIndex: number; // 0-based, inclusivo
  endIndex: number; // 0-based, esclusivo
  totalItems: number;
  itemLabelPlural: string; // "personaggi" / "PNG" / "mostri"
}

export function EntityPagination({
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalPages,
  startIndex,
  endIndex,
  totalItems,
  itemLabelPlural,
}: EntityPaginationProps) {
  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]/90 px-4 py-3 text-sm text-[var(--dash-muted)] shadow-xl shadow-black/10 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <span>Mostra</span>

        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-[var(--dash-text)] outline-none hover:border-[var(--dash-accent)]"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>

        <span>per pagina</span>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] transition-colors hover:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Pagina precedente"
        >
          ‹
        </button>

        {Array.from({ length: totalPages }, (_, index) => index + 1)
          .filter((p) => {
            if (totalPages <= 5) return true;
            if (p === 1 || p === totalPages) return true;
            return Math.abs(p - page) <= 1;
          })
          .map((p, index, pages) => {
            const previousPage = pages[index - 1];
            const showGap = previousPage !== undefined && p - previousPage > 1;

            return (
              <span key={p} className="flex items-center gap-2">
                {showGap && <span className="px-1 text-[var(--dash-muted)]">…</span>}

                <button
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-3 transition-colors ${
                    page === p
                      ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                      : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-muted)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text)]'
                  }`}
                >
                  {p}
                </button>
              </span>
            );
          })}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] transition-colors hover:border-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Pagina successiva"
        >
          ›
        </button>
      </div>

      <div className="text-right text-[var(--dash-muted)]">
        {startIndex + 1}–{endIndex} di {totalItems} {itemLabelPlural}
      </div>
    </div>
  );
}
