export const INLINE_RADIO_HIT_SLOP = 4;

interface InlineRadioBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function isPointInsideInlineRadioHitArea(
  rect: InlineRadioBounds,
  clientX: number,
  clientY: number,
  slop = INLINE_RADIO_HIT_SLOP,
): boolean {
  return clientX >= rect.left - slop
    && clientX <= rect.right + slop
    && clientY >= rect.top - slop
    && clientY <= rect.bottom + slop;
}

const RADIO_SELECTOR = '.tiptap-inline-radio-widget';
const STYLE_ID = 'hollowgate-inline-radio-interaction-style';
const INSTALL_FLAG = 'hollowgateInlineRadioInteraction';

function directRadioFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const radio = target.closest(RADIO_SELECTOR);
  return radio instanceof HTMLElement ? radio : null;
}

function findRadioNearPoint(root: ParentNode, clientX: number, clientY: number): HTMLElement | null {
  for (const candidate of Array.from(root.querySelectorAll<HTMLElement>(RADIO_SELECTOR))) {
    if (isPointInsideInlineRadioHitArea(candidate.getBoundingClientRect(), clientX, clientY)) return candidate;
  }
  return null;
}

function radioRootForTarget(target: EventTarget | null): ParentNode {
  if (target instanceof Element) return target.closest('.tiptap-content') ?? document;
  return document;
}

function installInlineRadioInteraction() {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset[INSTALL_FLAG] === 'true') return;
  document.documentElement.dataset[INSTALL_FLAG] = 'true';

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.tiptap-inline-radio-widget[data-radio-hover="true"]::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dash-accent) 34%, transparent);
  pointer-events: none;
}
`;
    document.head.appendChild(style);
  }

  let hoveredRadio: HTMLElement | null = null;
  let suppressVirtualClick: { x: number; y: number; until: number } | null = null;

  const setHoveredRadio = (radio: HTMLElement | null) => {
    if (hoveredRadio === radio) return;
    if (hoveredRadio) delete hoveredRadio.dataset.radioHover;
    hoveredRadio = radio;
    if (hoveredRadio) hoveredRadio.dataset.radioHover = 'true';
  };

  document.addEventListener('mousemove', (event) => {
    const directRadio = directRadioFromTarget(event.target);
    const radio = directRadio ?? findRadioNearPoint(
      radioRootForTarget(event.target),
      event.clientX,
      event.clientY,
    );
    setHoveredRadio(radio);
  }, true);

  document.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const directRadio = directRadioFromTarget(event.target);
    const radio = directRadio ?? findRadioNearPoint(
      radioRootForTarget(event.target),
      event.clientX,
      event.clientY,
    );
    if (!radio || radio.dataset.interactive !== 'true') return;

    event.preventDefault();
    event.stopPropagation();

    // Sul cerchio reale lasciamo che il successivo click nativo attivi il
    // widget. Nell'alone esteso invece attiviamo esplicitamente lo stesso
    // elemento e sopprimiamo il click sul testo che arriverebbe al rilascio.
    if (!directRadio) {
      radio.click();
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
    if (directRadioFromTarget(event.target)) return;
    const mouseEvent = event as MouseEvent;
    if (Math.abs(mouseEvent.clientX - pending.x) > 8 || Math.abs(mouseEvent.clientY - pending.y) > 8) return;
    suppressVirtualClick = null;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

if (typeof document !== 'undefined') installInlineRadioInteraction();
