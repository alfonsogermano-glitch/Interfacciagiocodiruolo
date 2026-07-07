import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff } from 'lucide-react';

const TOKEN_SIZE = 64;

export function DraggablePortrait({
  url,
  fallbackIcon,
  size = 56,
  draggable,
  onDragStart,
  hiddenFromPlayers = false,
  hiddenBadgePosition = 'top-right',
}: {
  url?: string;
  fallbackIcon: React.ReactNode;
  size?: number;
  draggable: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  hiddenFromPlayers?: boolean;
  hiddenBadgePosition?: 'center' | 'top-right';
}) {
  const dragGhostRef = useRef<HTMLImageElement | null>(null);

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (url && dragGhostRef.current) {
          e.dataTransfer.setDragImage(dragGhostRef.current, TOKEN_SIZE / 2, TOKEN_SIZE / 2);
        }
        onDragStart?.(e);
      }}
      className={`group relative shrink-0 overflow-hidden rounded-md border-2 border-[var(--dash-accent)] bg-[var(--dash-input)] ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">{fallbackIcon}</div>
      )}
      {draggable && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
        >
          <div className="overflow-hidden rounded-full border-2 border-[var(--dash-accent)]" style={{ width: TOKEN_SIZE, height: TOKEN_SIZE }}>
            {url ? (
              <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--dash-input)]">{fallbackIcon}</div>
            )}
          </div>
        </div>
      )}
      {hiddenFromPlayers && (
        <div
          className={`pointer-events-none absolute flex items-center justify-center rounded-full bg-black/70 ${
            hiddenBadgePosition === 'center' ? 'inset-0 m-auto h-5 w-5' : 'right-0.5 top-0.5 h-5 w-5'
          }`}
        >
          <EyeOff className="h-3 w-3 text-white" />
        </div>
      )}
      {url && draggable && createPortal(
        <img
          ref={dragGhostRef}
          src={url}
          alt=""
          draggable={false}
          style={{
            position: 'fixed',
            left: -9999,
            top: -9999,
            width: TOKEN_SIZE,
            height: TOKEN_SIZE,
            borderRadius: '9999px',
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
        />,
        document.body
      )}
    </div>
  );
}
