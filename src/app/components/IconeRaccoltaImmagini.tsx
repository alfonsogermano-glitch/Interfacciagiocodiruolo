import { createLucideIcon } from 'lucide-react';

// Riquadro posteriore chiuso e disegnato prima di quello frontale:
// il riempimento alternato non attraversa i dettagli della fotografia.
export const Images = createLucideIcon('images', [
  ['rect', { x: '2', y: '8', width: '14', height: '14', rx: '2', className: 'collection-back' }],
  ['rect', { x: '8', y: '2', width: '14', height: '14', rx: '2', className: 'collection-front' }],
  ['circle', { cx: '12', cy: '6', r: '1', className: 'collection-mark' }],
  ['path', { d: 'm8 12 3-3 5 5 3-3 3 3', className: 'collection-mark' }],
]);
