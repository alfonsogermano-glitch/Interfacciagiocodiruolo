import { AlertTriangle } from 'lucide-react';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Contenuto opzionale tra il testo e i pulsanti (es. una checkbox per
   *  un'opzione distruttiva aggiuntiva) - undefined di default, quindi
   *  nessun impatto sugli usi esistenti che non lo passano. */
  extraContent?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  danger = true,
  extraContent,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const colors = getCurrentPaletteColors();

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: colors.panel,
          border: `1px solid ${colors.border}`,
        }}
        className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: danger ? '#f1a3a3' : colors.text }} />
          <h3 className="text-base font-semibold" style={{ color: colors.text }}>{title}</h3>
        </div>
        <p className="mb-5 text-sm leading-relaxed" style={{ color: colors.text, opacity: 0.85 }}>
          {message}
        </p>
        {extraContent && <div className="mb-5">{extraContent}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            style={{ border: `1px solid ${colors.border}`, color: colors.text }}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              backgroundColor: danger ? '#6e2f2f' : colors.border,
              color: '#f1d3d3',
            }}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
