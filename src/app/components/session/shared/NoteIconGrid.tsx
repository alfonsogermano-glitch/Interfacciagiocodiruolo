import { createElement, useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import { Search, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { ICON_CATEGORIES } from './tiptapIconData';
import { ICON_DATA, ICON_META } from './tiptapIconData';
import {
  NOTE_ICON_RECENTS_STORAGE_KEY,
  readRecentIconNames,
  recordRecentIconName,
  searchNoteIcons,
} from './noteIconCatalogUtils';

interface NoteIconGridProps {
  onChoose: (name: string) => void;
  selectedName?: string | null;
  onRemove?: () => void;
}

interface NoteIconGlyphProps extends SVGProps<SVGSVGElement> {
  name: string;
}

const RECENTS_EVENT = 'hollowgate:note-recent-icons-changed';
const CATALOG_ENTRIES = ICON_CATEGORIES.flatMap((section) =>
  section.icons.map((name) => ICON_META[name]).filter(Boolean),
);
const VALID_ICON_NAMES = new Set(CATALOG_ENTRIES.map((icon) => icon.name));

export function NoteIconGlyph({ name, ...svgProps }: NoteIconGlyphProps) {
  const primitives = ICON_DATA[name];
  if (!primitives) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon-name={name}
      data-note-icon-glyph="true"
      {...svgProps}
    >
      {primitives.map(([tag, attrs], index) =>
        createElement(tag, { ...attrs, key: `${name}-${index}` }),
      )}
    </svg>
  );
}

// Adapter di compatibilità per i consumer titolo già esistenti (NoteListRow).
// Non è una registry curata: ogni componente viene derivato on-demand dagli
// stessi raw SVG di ICON_DATA, quindi non duplica più il catalogo Lucide.
type CatalogIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const NOTE_ICON_COMPONENTS = new Proxy(
  {} as Record<string, CatalogIconComponent>,
  {
    get(_target, property) {
      if (typeof property !== 'string' || !ICON_DATA[property]) return undefined;
      const CatalogIcon: CatalogIconComponent = (props) => (
        <NoteIconGlyph name={property} {...props} />
      );
      return CatalogIcon;
    },
  },
);

export function NoteIconGrid({ onChoose, selectedName = null, onRemove }: NoteIconGridProps) {
  const [query, setQuery] = useState('');
  const [recentNames, setRecentNames] = useState<string[]>(() =>
    readRecentIconNames(VALID_ICON_NAMES),
  );

  const searchResults = useMemo(
    () => searchNoteIcons(CATALOG_ENTRIES, query),
    [query],
  );
  const hasSearch = query.trim().length > 0;

  useEffect(() => {
    const refresh = () => setRecentNames(readRecentIconNames(VALID_ICON_NAMES));
    const onStorage = (event: StorageEvent) => {
      if (event.key === NOTE_ICON_RECENTS_STORAGE_KEY) refresh();
    };
    const onRecentChange = (event: Event) => {
      const detail = (event as CustomEvent<string[]>).detail;
      setRecentNames(Array.isArray(detail) ? detail : readRecentIconNames(VALID_ICON_NAMES));
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(RECENTS_EVENT, onRecentChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(RECENTS_EVENT, onRecentChange);
    };
  }, []);

  const choose = (name: string) => {
    const next = recordRecentIconName(name, VALID_ICON_NAMES);
    setRecentNames(next);
    window.dispatchEvent(new CustomEvent<string[]>(RECENTS_EVENT, { detail: next }));
    onChoose(name);
  };

  const renderIconButton = (name: string) => {
    const meta = ICON_META[name];
    if (!meta || !ICON_DATA[name]) return null;

    const isSelected = selectedName === name;
    return (
      <Tooltip key={name}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-note-icon-button="true"
            onClick={() => choose(name)}
            aria-label={meta.label}
            aria-pressed={isSelected}
            data-note-icon-name={name}
            className={`flex h-8 w-8 items-center justify-center rounded-md border text-[var(--dash-text-strong)] transition-colors ${
              isSelected
                ? 'border-[var(--dash-accent)] bg-[var(--dash-accent)]/15'
                : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] hover:bg-[var(--dash-surface-2)]'
            }`}
          >
            <NoteIconGlyph name={name} className="h-4 w-4 text-[var(--dash-text-strong)]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4} className="z-[10000]">{meta.label}</TooltipContent>
      </Tooltip>
    );
  };

  const recentIcons = recentNames.filter((name) => ICON_META[name] && ICON_DATA[name]);

  return (
    <div className="tiptap-icon-popover-scroll flex max-h-80 min-h-0 flex-col gap-2 overflow-y-auto">
      <div className="relative shrink-0">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dash-muted)]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca icona..."
          aria-label="Cerca icona"
          data-note-icon-search="true"
          className="h-8 w-full rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] pl-8 pr-2 text-xs text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-muted)] focus:border-[var(--dash-accent)]"
        />
      </div>

      {selectedName && onRemove && (
        <button
          type="button"
          data-note-icon-remove="true"
          onClick={onRemove}
          className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 text-xs text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
        >
          <X className="h-3.5 w-3.5" />
          Rimuovi icona
        </button>
      )}

      {hasSearch ? (
        <div data-note-icon-results="true">
          <div
            data-note-icon-category-header="true"
            className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-muted)]"
          >
            Risultati
          </div>
          {searchResults.length > 0 ? (
            <div data-note-icon-grid="true" className="grid grid-cols-6 gap-1.5">
              {searchResults.map((icon) => renderIconButton(icon.name))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--dash-border-soft)] px-2 py-3 text-center text-xs text-[var(--dash-muted)]">
              Nessuna icona trovata.
            </div>
          )}
        </div>
      ) : (
        <>
          {recentIcons.length > 0 && (
            <div data-note-icon-category="true" data-note-icon-recents="true">
              <div
                data-note-icon-category-header="true"
                className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-muted)]"
              >
                Recenti
              </div>
              <div data-note-icon-grid="true" className="grid grid-cols-6 gap-1.5">
                {recentIcons.map(renderIconButton)}
              </div>
            </div>
          )}

          {ICON_CATEGORIES.map((section) => (
            <div key={section.label} data-note-icon-category="true">
              <div
                data-note-icon-category-header="true"
                className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-muted)]"
              >
                {section.label}
              </div>
              <div data-note-icon-grid="true" className="grid grid-cols-6 gap-1.5">
                {section.icons.map(renderIconButton)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
