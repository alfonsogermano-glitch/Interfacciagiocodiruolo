import type { ArchivioCheckboxState, ArchivioCheckboxSymbol } from './archivioCheckbox';

/** Both the picker and cell use the same strokes and intermediate artwork. */
export function ArchivioCheckboxSymbolView({ symbol, state, className }: {
  symbol: ArchivioCheckboxSymbol;
  state: ArchivioCheckboxState;
  className?: string;
}) {
  if (state === 0) return null;
  const full = state === 2;
  const fill = full ? 'currentColor' : 'none';
  let artwork;
  switch (symbol) {
    case 'x': artwork = <><path d="M6 18 18 6" />{full && <path d="m6 6 12 12" />}</>; break;
    case 'check': artwork = <path d={full ? 'm4 12 5 5L20 6' : 'm4 12 5 5'} />; break;
    case 'circle': artwork = <circle cx="12" cy="12" r="7" fill={fill} />; break;
    case 'triangle': artwork = <path d="M12 4 21 20H3Z" fill={fill} />; break;
    case 'square': artwork = <rect x="5" y="5" width="14" height="14" rx="1" fill={fill} />; break;
    case 'diamond': artwork = <path d="m12 3 9 9-9 9-9-9Z" fill={fill} />; break;
    case 'star': artwork = <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" fill={fill} />; break;
    case 'heart': artwork = <path d="M12 20 4.5 12.5C-1 7 7 1 12 7c5-6 13 0 7.5 5.5Z" fill={fill} />; break;
    case 'plus': artwork = <><path d="M5 12h14" />{full && <path d="M12 5v14" />}</>; break;
    case 'asterisk': artwork = <path d={full ? 'M12 4v16M5 8l14 8M5 16l14-8' : 'M12 4v16M4 12h16'} />; break;
    case 'flag': artwork = <><path d="M5 21V3" /><path d="M5 3h14l-3 5 3 5H5Z" fill={fill} /></>; break;
    case 'bolt': artwork = <path d="m14 2-11 12h8l-1 8 11-12h-8Z" fill={fill} />; break;
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} data-checkbox-symbol={symbol} data-checkbox-symbol-state={state}>{artwork}</svg>;
}
