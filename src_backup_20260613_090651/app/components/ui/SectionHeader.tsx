import type { ReactNode } from 'react';

type SectionHeaderProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export function SectionHeader({
  title,
  description,
  icon,
  action
}: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-1 text-[var(--dash-accent-2)]">
            {icon}
          </div>
        )}

        <div>
          <h2 className="text-2xl font-semibold text-[var(--dash-text-strong)]">
            {title}
          </h2>

          {description && (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--dash-muted)]">
              {description}
            </p>
          )}
        </div>
      </div>

      {action}
    </div>
  );
}