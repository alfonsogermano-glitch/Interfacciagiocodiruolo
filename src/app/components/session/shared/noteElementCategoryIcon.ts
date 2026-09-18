import { ICON_DATA, type IconPrimitive } from './tiptapIconData';

export type NoteElementCategoryIcon = 'Dices' | 'Cog';

const COG_ICON = [
  ['path', { d: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z' }],
  ['path', { d: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z' }],
  ['path', { d: 'M12 2v2' }],
  ['path', { d: 'M12 22v-2' }],
  ['path', { d: 'm17 20.66-1-1.73' }],
  ['path', { d: 'M11 10.27 7 3.34' }],
  ['path', { d: 'm20.66 17-1.73-1' }],
  ['path', { d: 'M3.34 7l1.73 1' }],
  ['path', { d: 'M14 12h8' }],
  ['path', { d: 'M2 12h2' }],
  ['path', { d: 'm20.66 7-1.73 1' }],
  ['path', { d: 'm3.34 17 1.73-1' }],
  ['path', { d: 'm17 3.34-1 1.73' }],
  ['path', { d: 'm11 13.73-4 6.93' }],
] as const satisfies readonly IconPrimitive[];

const CATEGORY_ICONS: Record<NoteElementCategoryIcon, readonly IconPrimitive[]> = {
  Dices: ICON_DATA.Dices,
  Cog: COG_ICON,
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildNoteElementCategoryIcon(iconName: NoteElementCategoryIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.noteElementCategoryIcon = iconName;
  Object.assign(svg.style, {
    position: 'absolute',
    left: iconName === 'Cog' ? '-0.22em' : '-0.12em',
    bottom: '-0.3em',
    width: '1.7em',
    height: '1.7em',
    color: 'var(--dash-accent-2)',
    opacity: '0.5',
    pointerEvents: 'none',
    zIndex: 0,
  });
  for (const [tag, attrs] of CATEGORY_ICONS[iconName]) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, String(value));
    svg.appendChild(child);
  }
  return svg;
}
