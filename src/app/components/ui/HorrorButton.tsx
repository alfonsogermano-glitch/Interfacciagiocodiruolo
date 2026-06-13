import type { ButtonHTMLAttributes, ReactNode } from 'react';

type HorrorButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type HorrorButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: HorrorButtonVariant;
};

const variantClasses: Record<HorrorButtonVariant, string> = {
  primary:
    'border-[var(--dash-accent)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]',
  secondary:
    'border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]',
  danger:
    'border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-hover)]',
  ghost:
    'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] hover:bg-[var(--dash-panel)] hover:text-[var(--dash-text-strong)]'
};

export function HorrorButton({
  children,
  variant = 'primary',
  className = '',
  ...props
}: HorrorButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
}