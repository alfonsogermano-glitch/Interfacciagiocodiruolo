import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from '../../ui/portal-container';
import { NoteIconGrid } from '../shared/NoteIconGrid';

const PICKER_WIDTH = 320;
const PICKER_MARGIN = 12;
const PICKER_GAP = 8;
const PICKER_ESTIMATED_HEIGHT = 360;

interface DiceLibraryIconPickerProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  itemName: string;
  selectedName: string | null;
  onChoose: (iconName: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}

export function DiceLibraryIconPicker({
  open,
  anchorRef,
  itemName,
  selectedName,
  onChoose,
  onRemove,
  onClose,
}: DiceLibraryIconPickerProps) {
  const [position, setPosition] = useState({ top: PICKER_MARGIN, left: PICKER_MARGIN });
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const portalContainer = usePortalContainer();

  const updatePosition = useCallback(() => {
    const trigger = anchorRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const maxLeft = Math.max(PICKER_MARGIN, window.innerWidth - PICKER_WIDTH - PICKER_MARGIN);
    const preferredLeft = rect.left - PICKER_WIDTH - PICKER_GAP;
    const fallbackRight = rect.right + PICKER_GAP;
    const left = preferredLeft >= PICKER_MARGIN ? preferredLeft : Math.min(maxLeft, fallbackRight);
    const maxTop = Math.max(PICKER_MARGIN, window.innerHeight - PICKER_ESTIMATED_HEIGHT - PICKER_MARGIN);
    const top = Math.min(Math.max(PICKER_MARGIN, rect.top), maxTop);
    setPosition({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (pickerRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleReposition = () => updatePosition();

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [anchorRef, onClose, open, updatePosition]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={pickerRef}
      data-dice-icon-picker
      role="dialog"
      aria-label={`Scegli icona per ${itemName}`}
      style={{ top: position.top, left: position.left }}
      className="fixed z-[1100] w-80 max-w-[calc(100vw-1.5rem)] rounded-md border border-[var(--dash-border)] bg-[var(--dash-panel)] p-3 text-[var(--dash-text)] shadow-md"
    >
      <NoteIconGrid selectedName={selectedName} onChoose={onChoose} onRemove={onRemove} />
    </div>,
    portalContainer ?? document.body,
  );
}
