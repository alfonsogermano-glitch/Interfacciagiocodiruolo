import type { CustomEntry } from './monstersTypes';

function svgToDataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const MONSTER_CATALOG_CARD_BACKGROUNDS: Record<string, string> = {
  stregone: 'url("/monster-backgrounds/stregone.png")',
  'tempra stellare': 'url("/monster-backgrounds/tempra-stellare.jpg")',
  terrificante: 'url("/monster-backgrounds/terrificante.jpg")',
  vampirismo: 'url("/monster-backgrounds/vampirismo.jpg")',
  'mutare aspetto': 'url("/monster-backgrounds/mutare-aspetto.jpg")',
  'stridore infernale': 'url("/monster-backgrounds/stridore-infernale.jpg")',
  rigenerazione: 'url("/monster-backgrounds/rigenerazione.jpg")',
  afferrare: 'url("/monster-backgrounds/afferrare.jpg")',
  incantesimi: 'url("/monster-backgrounds/incantesimi.jpg")',
  'balzo dimensionale': 'url("/monster-backgrounds/balzo-dimensionale.jpg")',
  'vista onnisciente': 'url("/monster-backgrounds/vista-onnisciente.jpg")',
  dominazione: 'url("/monster-backgrounds/dominazione.jpg")',
  'fetore nauseabondo': 'url("/monster-backgrounds/fetore-nauseabondo.jpg")',
  'indurre cecità': 'url("/monster-backgrounds/indurre-cecita.jpg")',
  'indurre cecita': 'url("/monster-backgrounds/indurre-cecita.jpg")',
  volante: 'url("/monster-backgrounds/volante.jpg")',
  armato: 'url("/monster-backgrounds/armato.jpg")',
  colossale: 'url("/monster-backgrounds/colossale.jpg")',
  sfuggente: 'url("/monster-backgrounds/sfuggente.jpg")',
};

const MONSTER_CATALOG_CARD_BACKGROUND_STYLES: Record<string, { backgroundPosition?: string; backgroundSize?: string }> = {
  stregone: {
    backgroundPosition: 'center 30%',
    backgroundSize: 'cover'
  },
  'tempra stellare': {
    backgroundPosition: '66% 18%',
    backgroundSize: 'cover'
  },
  terrificante: {
    backgroundPosition: 'center center',
    backgroundSize: 'cover'
  },
  vampirismo: {
    backgroundPosition: 'center 20%',
    backgroundSize: 'cover'
  },
  'mutare aspetto': {
    backgroundPosition: 'center 30%',
    backgroundSize: 'cover'
  },
  'stridore infernale': {
    backgroundPosition: 'center 30%',
    backgroundSize: 'cover'
  },
  rigenerazione: {
    backgroundPosition: 'center 10%',
    backgroundSize: 'cover'
  },
  afferrare: {
    backgroundPosition: '50% 50%',
    backgroundSize: 'cover'
  },
  incantesimi: {
    backgroundPosition: '50% 50%',
    backgroundSize: 'cover'
  },
  'balzo dimensionale': {
    backgroundPosition: '50% 50%',
    backgroundSize: 'cover'
  },
  'vista onnisciente': {
    backgroundPosition: '50% 50%',
    backgroundSize: 'cover'
  },
  dominazione: {
    backgroundPosition: '50% 22%',
    backgroundSize: 'cover'
  },
  'fetore nauseabondo': {
    backgroundPosition: '38% 50%',
    backgroundSize: 'cover'
  },
  'indurre cecità': {
    backgroundPosition: '50% 50%',
    backgroundSize: 'cover'
  },
  'indurre cecita': {
    backgroundPosition: '50% 50%',
    backgroundSize: 'cover'
  },
  'volante': {
    backgroundPosition: '50% 50%',
    backgroundSize: 'cover'
  },
  'armato': {
    backgroundPosition: '56% 50%',
    backgroundSize: 'cover'
  },
  'colossale': {
    backgroundPosition: '52% 43%',
    backgroundSize: 'cover'
  },
  'sfuggente': {
    backgroundPosition: '72% 46%',
    backgroundSize: 'cover'
  }
};

function getMonsterCatalogCardBackground(item: { id: string; name: string }): string | undefined {
  const normalizedId = item.id.toLowerCase();
  const normalizedName = item.name.toLowerCase();

  return MONSTER_CATALOG_CARD_BACKGROUNDS[normalizedId] ??
    MONSTER_CATALOG_CARD_BACKGROUNDS[normalizedName];
}

function getMonsterCatalogCardBackgroundStyle(item: { id: string; name: string }) {
  const normalizedId = item.id.toLowerCase();
  const normalizedName = item.name.toLowerCase();

  return MONSTER_CATALOG_CARD_BACKGROUND_STYLES[normalizedId] ??
    MONSTER_CATALOG_CARD_BACKGROUND_STYLES[normalizedName] ??
    {};
}

export function CatalogSelectionBlock({
  title,
  items,
  selectedIds,
  onToggle,
  extraContent
}: {
  title: string;
  items: Array<{ id: string; name: string; description: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  extraContent?: (
    item: { id: string; name: string; description: string },
    selected: boolean
  ) => React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <h3 className="mb-3 text-[var(--dash-text)]">{title}</h3>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map(item => {
          const selected = selectedIds.includes(item.id);
          const backgroundImage = getMonsterCatalogCardBackground(item);
          const hasBackgroundImage = Boolean(backgroundImage);

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onToggle(item.id)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onToggle(item.id);
                }
              }}
              style={
                hasBackgroundImage
                  ? {
                      backgroundImage,
                      backgroundSize: getMonsterCatalogCardBackgroundStyle(item).backgroundSize ?? 'cover',
                      backgroundPosition: getMonsterCatalogCardBackgroundStyle(item).backgroundPosition ?? 'center',
                      backgroundRepeat: 'no-repeat'
                    }
                  : undefined
              }
              className={`relative min-h-[148px] cursor-pointer overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 ${
                selected
                  ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)] shadow-[0_0_22px_var(--dash-accent)] ring-1 ring-[var(--dash-accent)]/60'
                  : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)] hover:bg-[var(--dash-panel)] hover:shadow-[0_0_16px_var(--dash-accent)]/40'
              }`}
            >
              {hasBackgroundImage && (
                <>
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--dash-bg)_0%,transparent_120%)] opacity-75" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,var(--dash-bg)_150%)] opacity-45" />
                </>
              )}

              {selected && (
                <div className="absolute right-3 top-3 z-20 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] shadow-lg shadow-[var(--dash-accent)]/30">
                  ✓
                </div>
              )}

              <div className="relative z-10 flex min-w-0 items-start justify-between gap-2 pr-8">

                <div className="min-w-0 truncate font-medium text-[var(--dash-text-strong)] drop-shadow">
                  {item.name}
                </div>
              </div>

              <div
                className={`relative z-10 mt-2 line-clamp-3 text-sm leading-relaxed drop-shadow ${
                  selected ? 'text-[var(--dash-text)]' : 'text-[var(--dash-muted)]'
                }`}
              >
                {item.description}
              </div>

              {extraContent?.(item, selected) && (
                <div className="relative z-10">
                  {extraContent(item, selected)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CustomEntriesEditor({
  title,
  items,
  onAdd,
  onUpdate,
  onRemove
}: {
  title: string;
  items: CustomEntry[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<CustomEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const isIncompleteEntry = (entry: CustomEntry) => Boolean(entry.name.trim()) !== Boolean(entry.description.trim());

  return (
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
        <h3 className="text-[var(--dash-text)]">{title}</h3>
        <p className="mt-1 text-xs text-[var(--dash-muted)]">
          Nome e Descrizione sono obbligatori insieme: compila entrambi oppure lascia entrambi vuoti.
        </p>
      </div>

        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-3 py-1 text-xs text-[var(--dash-text-strong)]"
        >
          Aggiungi
        </button>
      </div>

      <div className="space-y-3">
        {items.map(item => {
          const incomplete = isIncompleteEntry(item);

          return (
            <div
              key={item.id}
              className={`rounded-lg border p-3 ${
                incomplete
                  ? 'border-[#d8837e] bg-[var(--dash-surface-2)]'
                  : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)]'
              }`}
            >
              <input
                type="text"
                value={item.name}
                onChange={e => onUpdate(item.id, { name: e.target.value })}
                placeholder="Nome"
                className={`mb-2 w-full rounded border bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)] ${
                  incomplete ? 'border-[#d8837e]' : 'border-[var(--dash-border)]'
                }`}
              />

              <textarea
                value={item.description}
                onChange={e => onUpdate(item.id, { description: e.target.value })}
                placeholder="Descrizione"
                className={`h-20 w-full resize-none rounded border bg-[var(--dash-input)] px-3 py-2 text-sm text-[var(--dash-text)] ${
                  incomplete ? 'border-[#d8837e]' : 'border-[var(--dash-border)]'
                }`}
              />

              {incomplete && (
                <p className="mt-2 text-xs text-[#d8837e]">
                  Compila anche {item.name.trim() ? 'la descrizione' : 'il nome'}, oppure svuota entrambi.
                </p>
              )}

              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="mt-2 text-xs text-[#d8b4b4] hover:text-[#f3dede]"
              >
                Rimuovi
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Badge({
  children,
  icon
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2 py-0.5 text-[var(--dash-text)]">
      {icon}
      {children}
    </span>
  );
}

export function Info({
  label,
  value,
  icon
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[var(--dash-text)]">{value}</div>
    </div>
  );
}

export function InfoBlock({
  title,
  value,
  danger = false
}: {
  title: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        danger
          ? 'border-[var(--dash-border)] bg-[#241111]'
          : 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)]'
      }`}
    >
      <h3 className="mb-2 text-[var(--dash-text)]">{title}</h3>
      <p className="text-[var(--dash-muted)]">{value}</p>
    </div>
  );
}

export function TagsBlock({
  title,
  officialItems,
  customItems
}: {
  title: string;
  officialItems: CustomEntry[];
  customItems: CustomEntry[];
}) {
  const allItems = [...officialItems, ...customItems].filter(item => item.name.trim());

  if (allItems.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <h3 className="mb-3 text-[var(--dash-text)]">{title}</h3>

      <div className="flex flex-wrap gap-2">
        {allItems.map(item => (
          <div key={item.id} className="group relative">
            <Badge>{item.name}</Badge>

            {item.description && (
              <div className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 hidden w-72 rounded-lg border border-[#6a452f] bg-[#221714] px-3 py-2 text-xs leading-relaxed text-[var(--dash-text-strong)] shadow-xl group-hover:block">
                {item.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}