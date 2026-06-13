import { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      // Posiziona il tooltip sopra l'elemento
      let x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      let y = triggerRect.top - tooltipRect.height - 8;

      // Gestisci il bordo sinistro dello schermo
      if (x < 8) x = 8;

      // Gestisci il bordo destro dello schermo
      if (x + tooltipRect.width > window.innerWidth - 8) {
        x = window.innerWidth - tooltipRect.width - 8;
      }

      // Se il tooltip va oltre il bordo superiore, mostralo sotto
      if (y < 8) {
        y = triggerRect.bottom + 8;
      }

      setPosition({ x, y });
    }
  }, [isVisible]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="relative cursor-help border-b border-dotted border-[#8b7355]"
      >
        {children}
      </span>
      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] bg-[#2a1a1a] border-2 border-[#8b1e1e] rounded-lg px-3 py-2 text-[#e8d4b8] text-sm shadow-lg max-w-xs pointer-events-none"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
