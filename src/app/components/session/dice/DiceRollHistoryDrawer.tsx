import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Dices, Trash2, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { useDiceSession } from './DiceSessionContext';
import { DiceRollHistoryCard } from './DiceRollHistoryCard';
import { Dice3DOverlay } from './Dice3DOverlay';

const SCROLLBAR_TRACK_INSET_PX = 4;
const MIN_SCROLLBAR_THUMB_PX = 28;

interface DiceHistoryScrollbarState {
  visible: boolean;
  thumbHeight: number;
  thumbTop: number;
}

interface DiceHistoryScrollbarDragState {
  pointerId: number;
  startY: number;
  startScrollTop: number;
}

export function DiceRollHistoryDrawer() {
  const {
    rolls,
    reroll,
    clearLocalHistory,
    historyOpen,
    setHistoryOpen,
    animationsEnabled,
    setAnimationsEnabled,
  } = useDiceSession();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const scrollbarDragRef = useRef<DiceHistoryScrollbarDragState | null>(null);
  const [scrollbar, setScrollbar] = useState<DiceHistoryScrollbarState>({
    visible: false,
    thumbHeight: MIN_SCROLLBAR_THUMB_PX,
    thumbTop: 0,
  });

  const syncScrollbar = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const visible = scrollContainer.scrollHeight > scrollContainer.clientHeight;
    if (!visible) {
      setScrollbar((previous) => (
        previous.visible || previous.thumbTop !== 0
          ? { visible: false, thumbHeight: MIN_SCROLLBAR_THUMB_PX, thumbTop: 0 }
          : previous
      ));
      return;
    }

    const trackHeight = Math.max(
      0,
      scrollContainer.clientHeight - (SCROLLBAR_TRACK_INSET_PX * 2),
    );
    const thumbHeight = Math.min(
      trackHeight,
      Math.max(
        MIN_SCROLLBAR_THUMB_PX,
        trackHeight * (scrollContainer.clientHeight / scrollContainer.scrollHeight),
      ),
    );
    const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = maxScrollTop > 0
      ? (scrollContainer.scrollTop / maxScrollTop) * maxThumbTop
      : 0;

    setScrollbar((previous) => {
      const next = { visible: true, thumbHeight, thumbTop };
      if (
        previous.visible === next.visible
        && Math.abs(previous.thumbHeight - next.thumbHeight) < 0.5
        && Math.abs(previous.thumbTop - next.thumbTop) < 0.5
      ) {
        return previous;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!historyOpen) return;

    const frame = requestAnimationFrame(() => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      syncScrollbar();
    });

    return () => cancelAnimationFrame(frame);
  }, [historyOpen, rolls.length]);

  useEffect(() => {
    if (!historyOpen) return;

    const scrollContainer = scrollContainerRef.current;
    const scrollContent = scrollContentRef.current;
    if (!scrollContainer) return;

    const observer = new ResizeObserver(syncScrollbar);
    observer.observe(scrollContainer);
    if (scrollContent) observer.observe(scrollContent);

    const frame = requestAnimationFrame(syncScrollbar);
    window.addEventListener('resize', syncScrollbar);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', syncScrollbar);
      observer.disconnect();
    };
  }, [historyOpen, rolls.length, syncScrollbar]);

  const handleScrollbarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !scrollbar.visible) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollbarDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: scrollContainer.scrollTop,
    };
  };

  const handleScrollbarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = scrollbarDragRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !scrollContainer) return;

    const trackHeight = Math.max(
      0,
      scrollContainer.clientHeight - (SCROLLBAR_TRACK_INSET_PX * 2),
    );
    const maxThumbTravel = Math.max(0, trackHeight - scrollbar.thumbHeight);
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    if (maxThumbTravel === 0 || maxScrollTop === 0) return;

    const scrollDelta = ((event.clientY - drag.startY) / maxThumbTravel) * maxScrollTop;
    scrollContainer.scrollTop = Math.min(
      maxScrollTop,
      Math.max(0, drag.startScrollTop + scrollDelta),
    );
  };

  const stopScrollbarDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = scrollbarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scrollbarDragRef.current = null;
  };

  const drawer = !historyOpen ? (
    <button
      type="button"
      data-dice-history-toggle
      onClick={() => setHistoryOpen(true)}
      aria-label="Mostra storico tiri"
      className="fixed bottom-5 left-28 z-[940] flex h-11 w-11 items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] shadow-xl transition-transform hover:scale-105"
    >
      <Dices className="h-5 w-5" />
    </button>
  ) : (
    <section
      data-dice-history-drawer
      className="fixed bottom-5 left-28 z-[940] flex max-h-[58vh] w-fit min-w-[18rem] max-w-[min(24rem,calc(100vw-8rem))] flex-col overflow-hidden rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 shadow-2xl backdrop-blur-md"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--dash-border)] px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--dash-text-strong)]">
          <Dices className="h-3.5 w-3.5 text-[var(--dash-accent)]" />
          Tiri
          {rolls.length > 0 && (
            <span className="rounded-full bg-[var(--dash-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--dash-muted)]">
              {rolls.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-dice-3d-toggle
                aria-pressed={animationsEnabled}
                onClick={() => setAnimationsEnabled(!animationsEnabled)}
                className={`rounded-md px-1.5 py-1 text-[10px] font-semibold transition-colors ${
                  animationsEnabled
                    ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                    : 'bg-[var(--dash-surface-2)] text-[var(--dash-muted)]'
                }`}
              >
                3D {animationsEnabled ? 'ON' : 'OFF'}
              </button>
            </TooltipTrigger>
            <TooltipContent>Animazione dadi 3D</TooltipContent>
          </Tooltip>
          <button
            type="button"
            data-dice-history-clear
            onClick={clearLocalHistory}
            disabled={rolls.length === 0}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(false)}
            aria-label="Nascondi storico tiri"
            className="rounded-md p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollContainerRef}
          data-dice-history-scroll
          onScroll={syncScrollbar}
          className="min-h-0 flex-1 overflow-y-auto p-1.5 pr-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div ref={scrollContentRef}>
            {rolls.length === 0 ? (
              <div className="flex min-h-20 flex-col items-center justify-center text-center text-xs text-[var(--dash-muted)]">
                <Dices className="mb-1.5 h-5 w-5 opacity-50" />
                Nessun tiro effettuato in questa sessione.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {rolls.map((result) => (
                  <DiceRollHistoryCard
                    key={result.id}
                    result={result}
                    onReroll={() => { reroll(result.id); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {scrollbar.visible && (
          <div
            data-dice-history-scrollbar-track
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 right-1 top-1 w-2 rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-input)]/95 shadow-inner"
          >
            <div
              data-dice-history-scrollbar-thumb
              onPointerDown={handleScrollbarPointerDown}
              onPointerMove={handleScrollbarPointerMove}
              onPointerUp={stopScrollbarDrag}
              onPointerCancel={stopScrollbarDrag}
              className="pointer-events-auto absolute left-0.5 right-0.5 top-0 touch-none rounded-full bg-[var(--dash-accent)] shadow-md transition-[background-color] hover:bg-[var(--dash-accent-hover)]"
              style={{
                height: `${scrollbar.thumbHeight}px`,
                transform: `translateY(${scrollbar.thumbTop}px)`,
              }}
            />
          </div>
        )}
      </div>
    </section>
  );

  return (
    <>
      <Dice3DOverlay />
      {drawer}
    </>
  );
}
