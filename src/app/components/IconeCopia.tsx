import { createLucideIcon } from 'lucide-react';

// Copia/Duplica con ordine DOM custom: il quadrato dietro (path a L) viene
// PRIMA e quello davanti (rect) DOPO - in SVG l'ordine di disegno e'
// l'ordine DOM, quindi cosi' il davanti occlude SEMPRE il dietro (nessuna
// sovrapposizione fastidiosa quando uno dei due si riempie: il dietro si
// vede solo nella sua parte visibile). Le linee del + di copy-plus vengono
// ultime: il + resta sopra entrambi i quadrati e inverte il colore in fase
// con l'animazione (src/styles/index.css - copyFrontSwap/copyBackSwap/
// copyMarkSwap). Stesse geometrie di lucide-react, stesse classi CSS.
export const Copy = createLucideIcon('copy', [
  ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
]);

export const CopyPlus = createLucideIcon('copy-plus', [
  ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
  ['line', { x1: '15', x2: '15', y1: '12', y2: '18' }],
  ['line', { x1: '12', x2: '18', y1: '15', y2: '15' }],
]);
