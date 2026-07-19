import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';

export interface EntityKebabMenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Riga non interattiva (stile attenuato, click ignorato) - usata per
   *  predisposizioni non ancora attive (es. "Richiedibile" in
   *  MyCharactersPage.tsx), non per stati di caricamento transitori. */
  disabled?: boolean;
  /** Controllo allineato a destra della label (es. uno Switch) - la riga
   *  resta comunque un singolo <button>, pensato per il caso disabled in
   *  cui il controllo stesso non è cliccabile. */
  trailing?: React.ReactNode;
  /** Tooltip stilizzato (componente condiviso Tooltip/TooltipTrigger/
   *  TooltipContent, palette-aware) - non un title= nativo. */
  tooltip?: string;
  /** Non chiude il menu dopo il click - per voci a comportamento toggle
   *  (es. uno Switch in trailing) dove l'utente si aspetta di vedere il
   *  cambio di stato invece che il menu sparire subito, o di poter
   *  ripetere l'azione senza riaprire il menu. Default false (comportamento
   *  invariato per tutte le altre voci: chiudi dopo il click). */
  keepOpenAfterClick?: boolean;
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
          {items.map(item => {
            // aria-disabled invece di disabled nativo: un <button disabled>
            // non emette eventi pointer/focus, quindi il TooltipTrigger di
            // Radix (che si basa su questi) non si attiverebbe mai al
            // passaggio del mouse - stesso motivo per cui qui il click va
            // ignorato in JS (item.disabled ? return) invece che dall'attributo.
            const button = (
              <button
                key={item.key}
                type="button"
                aria-disabled={item.disabled}
                onClick={() => { if (item.disabled) return; item.onClick(); if (!item.keepOpenAfterClick) setOpen(false); }}
                style={{ color: item.danger ? undefined : colors.text }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-opacity ${
                  item.disabled ? 'cursor-not-allowed opacity-50' : 'hover:opacity-75'
                } ${item.danger ? 'text-red-300' : ''}`}
              >
                {item.icon} {item.label}
                {item.trailing && <span className="ml-auto">{item.trailing}</span>}
              </button>
            );

            if (!item.tooltip) return button;

            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="left">{item.tooltip}</TooltipContent>
              </Tooltip>
            );
          })}
          {footer}
        </div>,
        document.body
      )}
    </div>
  );
}
