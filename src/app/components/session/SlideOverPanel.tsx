import { useEffect } from 'react';
import { X } from 'lucide-react';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  widthClassName?: string;
}

export function SlideOverPanel({ isOpen, onClose, title, children, widthClassName = 'w-full max-w-5xl' }: SlideOverPanelProps) {
  const colors = getCurrentPaletteColors();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-16 bottom-0 z-[900] flex justify-end transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className={`pointer-events-auto flex h-full flex-col shadow-2xl transition-transform duration-300 ease-out ${widthClassName} ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          backgroundColor: `${colors.panel}ee`,
          borderLeft: `1px solid ${colors.border}`,
          backdropFilter: 'blur(6px)',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        >
          <h2 className="text-lg font-semibold" style={{ color: colors.text }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-opacity hover:opacity-70"
            style={{ color: colors.text }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
