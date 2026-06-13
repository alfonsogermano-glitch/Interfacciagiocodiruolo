import type { ReactNode } from 'react';

export type CustomEntry = {
  id: string;
  name: string;
  description: string;
};

export function Badge({
  children,
  icon
}: {
  children: ReactNode;
  icon?: ReactNode;
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
  icon?: ReactNode;
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
