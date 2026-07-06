import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface EntityKebabMenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface EntityKebabMenuColors {
  panel: string;
  border: string;
  text: string;
}

interface EntityKebabMenuProps {
  items: EntityKebabMenuItem[];
  colors: EntityKebabMenuColors;
  footer?: React.ReactNode;
  buttonClassName?: string;
  menuWidthClassName?: string;
  menuWidthPx?: number;
}

export function EntityKebabMenu({
  items,
  colors,
  footer,
  buttonClassName = 'flex h-8 w-8 items-center justify-center rounded-lg text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]',
  menuWidthClassName = 'w-60',
  menuWidthPx = 240,
}: EntityKebabMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Chiude il menu al click fuori
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          if (open) { setOpen(false); return; }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setPosition({ top: rect.bottom + 4, left: rect.right - menuWidthPx });
          setOpen(true);
        }}
        className={buttonClassName}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && position && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            backgroundColor: colors.panel,
            border: `1px solid ${colors.border}`,
          }}
          className={`z-[1000] ${menuWidthClassName} rounded-xl p-1.5 shadow-2xl`}
        >
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => { item.onClick(); setOpen(false); }}
              style={{ color: item.danger ? undefined : colors.text }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-opacity hover:opacity-75 ${item.danger ? 'text-red-300' : ''}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
          {footer}
        </div>,
        document.body
      )}
    </div>
  );
}
