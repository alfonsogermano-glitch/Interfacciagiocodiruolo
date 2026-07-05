import { useEffect } from 'react';
import { PALETTE_COLORS, DEFAULT_PALETTE_COLORS, type PaletteId } from '../ui/paletteColors';

function getCurrentPaletteColors() {
  const el = document.querySelector('[data-dashboard-palette]');
  const palette = el?.getAttribute('data-dashboard-palette') as PaletteId | null;
  return palette && PALETTE_COLORS[palette] ? PALETTE_COLORS[palette] : DEFAULT_PALETTE_COLORS;
}

// Deve combaciare con la larghezza reale della barra icone (w-16 = 4rem)
const SESSION_SIDEBAR_WIDTH = '4rem';

interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthClassName?: string;
}

export function SlideOverPanel({ isOpen, onClose, children, widthClassName = 'w-full max-w-5xl' }: SlideOverPanelProps) {
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
      className={`fixed top-12 bottom-0 z-[900] flex flex-col shadow-2xl transition-transform duration-300 ease-out ${widthClassName}`}
      style={{
        right: SESSION_SIDEBAR_WIDTH,
        width: undefined,
        backgroundColor: `${colors.panel}ee`,
        borderLeft: `1px solid ${colors.border}`,
        backdropFilter: 'blur(6px)',
        pointerEvents: isOpen ? 'auto' : 'none',
        transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% + 4rem))',
      }}
    >
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
