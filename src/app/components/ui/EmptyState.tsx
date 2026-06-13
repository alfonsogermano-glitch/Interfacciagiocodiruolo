import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = ''
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-10 text-center ${className}`}
    >
      {icon && (
        <div className="mx-auto mb-4 flex justify-center text-[var(--dash-muted)]">
          {icon}
        </div>
      )}

      <h3 className="text-lg font-semibold text-[var(--dash-text-strong)]">
        {title}
      </h3>

      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--dash-muted)]">
          {description}
        </p>
      )}

      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}