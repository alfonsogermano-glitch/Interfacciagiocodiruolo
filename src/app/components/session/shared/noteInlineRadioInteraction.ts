export const INLINE_CONTROL_HIT_SLOP = 4;

interface InlineControlBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function isPointInsideInlineControlHitArea(
  rect: InlineControlBounds,
  clientX: number,
  clientY: number,
  slop = INLINE_CONTROL_HIT_SLOP,
): boolean {
  return clientX >= rect.left - slop
    && clientX <= rect.right + slop
    && clientY >= rect.top - slop
    && clientY <= rect.bottom + slop;
}

const CONTROL_SELECTOR = '.tiptap-inline-radio-widget, .tiptap-inline-checkbox-widget';
const STYLE_ID = 'hollowgate-inline-control-interaction-style';
const INSTALL_FLAG = 'hollowgateInlineControlInteraction';

function directControlFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest(CONTROL_SELECTOR);
  return control instanceof HTMLElement ? control : null;
}

function findControlNearPoint(root: ParentNode, clientX: number, clientY: number): HTMLElement | null {
  for (const candidate of Array.from(root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))) {
    if (isPointInsideInlineControlHitArea(candidate.getBoundingClientRect(), clientX, clientY)) return candidate;
  }
  return null;
}

function controlRootForTarget(target: EventTarget | null): ParentNode {
  if (target instanceof Element) return target.closest('.tiptap-content') ?? document;
  return document;
}

function installInlineControlInteraction() {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset[INSTALL_FLAG] === 'true') return;
  document.documentElement.dataset[INSTALL_FLAG] = 'true';

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.tiptap-inline-radio-widget[data-inline-control-hover="true"]::after,
.tiptap-inline-checkbox-widget[data-inline-control-hover="true"]::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: inherit;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dash-accent) 34%, transparent);
  pointer-events: none;
}
`;
    document.head.appendChild(style);
  }

  let hoveredControl: HTMLElement | null = null;
  let suppressVirtualClick: { x: number; y: number; until: number } | null = null;

  const setHoveredControl = (control: HTMLElement | null) => {
    if (hoveredControl === control) return;
    if (hoveredControl) delete hoveredControl.dataset.inlineControlHover;
    hoveredControl = control;
    if (hoveredControl) hoveredControl.dataset.inlineControlHover = 'true';
  };

  document.addEventListener('mousemove', (event) => {
    const directControl = directControlFromTarget(event.target);
    const control = directControl ?? findControlNearPoint(
      controlRootForTarget(event.target),
      event.clientX,
      event.clientY,
    );
    setHoveredControl(control);
  }, true);

  document.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const directControl = directControlFromTarget(event.target);
    const control = directControl ?? findControlNearPoint(
      controlRootForTarget(event.target),
      event.clientX,
      event.clientY,
    );
    if (!control || control.dataset.interactive !== 'true') return;

    event.preventDefault();
    event.stopPropagation();

    // Sul controllo reale lasciamo che il successivo click nativo attivi il
    // widget. Nell'alone esteso invece attiviamo esplicitamente lo stesso
    // elemento e sopprimiamo il click sul testo che arriverebbe al rilascio.
    if (!directControl) {
      control.click();
      suppressVirtualClick = {
        x: event.clientX,
        y: event.clientY,
        until: Date.now() + 700,
      };
    }
  }, true);

  document.addEventListener('click', (event) => {
    if (!suppressVirtualClick) return;
    const pending = suppressVirtualClick;
    if (Date.now() > pending.until) {
      suppressVirtualClick = null;
      return;
    }
    if (directControlFromTarget(event.target)) return;
    const mouseEvent = event as MouseEvent;
    if (Math.abs(mouseEvent.clientX - pending.x) > 8 || Math.abs(mouseEvent.clientY - pending.y) > 8) return;
    suppressVirtualClick = null;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

if (typeof document !== 'undefined') installInlineControlInteraction();
