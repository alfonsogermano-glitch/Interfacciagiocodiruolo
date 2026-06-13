import type { ReactNode } from 'react';

type HorrorCardProps = {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'dark' | 'danger' | 'highlight';
};

const variantClasses = {
  default: 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)]',
  dark: 'border-[var(--dash-border-soft)] bg-[var(--dash-panel)]',
  danger: 'border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)]',
  highlight: 'border-[var(--dash-accent)] bg-[var(--dash-panel)]'
};

export function HorrorCard({
  children,
  className = '',
  variant = 'default'
}: HorrorCardProps) {
  return (
    <div
      className={`rounded-2xl border ${variantClasses[variant]} ${className}`}
    >
      {children}
    </div>
  );
}