// Script one-off/dev-time (NON eseguito da "npm run build" - vedi
// package.json, nessuna voce "scripts" lo richiama) per generare
// src/app/components/session/shared/tiptapIconData.ts a partire dai path
// SVG grezzi di lucide-react.
//
// Perche' non un import a runtime: ogni icona lucide-react e' costruita da
// createLucideIcon(name, iconNode) dove iconNode e' un array [tag, attrs][]
// di primitive SVG grezze, esportato come "__iconNode" (named export) SOLO
// nel file interno di build node_modules/lucide-react/dist/esm/icons/
// <kebab-name>.js - nessun .d.ts lo accompagna (non e' un path
// contrattuale/pubblico, potrebbe riorganizzarsi a un futuro bump di
// versione di lucide-react). Il nodo TipTap "inlineIcon"
// (tiptapInlineIcon.ts) e' un atom renderizzato via renderHTML puro
// (nessuna ReactNodeViewRenderer, vedi commento li') e ha bisogno solo di
// questi array grezzi, non dei componenti React - copiarli UNA VOLTA in un
// nostro file dati, indipendente dalla struttura interna di lucide-react,
// evita quella dipendenza fragile a runtime.
//
// Uso: node scripts/extract-lucide-icons.mjs
// Rigenera tiptapIconData.ts da zero - va rilanciato a mano se il subset di
// icone cambia (aggiungere/togliere un nome da ICON_CATEGORIES sotto).

import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LUCIDE_ICONS_DIR = path.join(__dirname, '..', 'node_modules', 'lucide-react', 'dist', 'esm', 'icons');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'app', 'components', 'session', 'shared', 'tiptapIconData.ts');

// Sottoinsieme curato confermato dall'utente (60 icone, 7 categorie) - vedi
// piano approvato. L'ordine dentro ogni categoria e' quello con cui
// appariranno nella griglia del Popover (RichTextEditor.tsx, IconPicker).
const ICON_CATEGORIES = [
  { label: 'Combattimento', icons: ['Sword', 'Swords', 'Shield', 'Target', 'Crosshair', 'Skull', 'Bomb', 'Zap', 'Flame', 'Biohazard'] },
  { label: 'Magia', icons: ['Sparkles', 'Wand', 'Ghost', 'Eye', 'Moon', 'Sun', 'Feather', 'Scroll', 'Radiation', 'Snowflake'] },
  { label: 'Esplorazione', icons: ['Compass', 'Map', 'MapPin', 'Mountain', 'Tent', 'Footprints', 'Anchor', 'Ship', 'Route', 'Signpost'] },
  { label: 'Persone', icons: ['User', 'Users', 'Crown', 'GraduationCap', 'Drama', 'Briefcase'] },
  { label: 'Oggetti', icons: ['Key', 'Gem', 'Coins', 'Pickaxe', 'FlaskConical', 'Pill', 'Syringe', 'Dice6', 'BookOpen'] },
  { label: 'Luoghi', icons: ['Castle', 'Church', 'Landmark', 'DoorOpen', 'Home', 'Store', 'Trees'] },
  { label: 'Varie', icons: ['Activity', 'Bell', 'Brain', 'Star', 'Heart', 'Music', 'Theater', 'Newspaper'] },
];

// lucide-react rinomina alcune icone nel tempo mantenendo un export
// retrocompatibile con il vecchio nome (es. Home -> House, verificato dal
// vivo: lucide-react.js riesporta "Home" da "./icons/house.js") - il file
// fisico su disco usa gia' il nome NUOVO. Mappa esplicita solo per questi
// casi, non una regola generale (rischierebbe di mascherare un nome
// davvero sbagliato/inesistente invece di far fallire lo script).
const KEBAB_OVERRIDES = { Home: 'house' };

function toKebabCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

const allNames = ICON_CATEGORIES.flatMap((c) => c.icons);
const iconData = {};
const missing = [];

for (const name of allNames) {
  const kebab = KEBAB_OVERRIDES[name] ?? toKebabCase(name);
  const filePath = path.join(LUCIDE_ICONS_DIR, `${kebab}.js`);
  let mod;
  try {
    // import() reale del modulo ESM (non lettura+regex+eval del testo
    // sorgente) - piu' robusto: se lucide-react cambiasse formattazione
    // interna (a parita' di export __iconNode) continuerebbe a funzionare,
    // dato che passa dal vero resolver dei moduli invece che da un pattern
    // testuale sul codice sorgente.
    mod = await import(pathToFileURL(filePath).href);
  } catch {
    missing.push(`${name} -> ${kebab}.js (file non trovato/non importabile)`);
    continue;
  }
  if (!Array.isArray(mod.__iconNode)) {
    missing.push(`${name} -> ${kebab}.js (nessun export __iconNode)`);
    continue;
  }
  // "key" e' solo la key React di riconciliazione delle liste, inutile
  // fuori da React - scartata qui invece che a runtime nel nodo TipTap.
  iconData[name] = mod.__iconNode.map(([tag, attrs]) => {
    const { key, ...rest } = attrs;
    return [tag, rest];
  });
}

if (missing.length > 0) {
  console.error('Icone non estratte:\n' + missing.join('\n'));
  process.exit(1);
}

const header = `// File GENERATO da scripts/extract-lucide-icons.mjs - non modificare a mano.
// Rilanciare lo script per rigenerarlo se il subset di icone cambia.
// Contiene i path SVG grezzi (array [tag, attrs][], stesso formato interno
// di lucide-react) per il sottoinsieme curato di icone del picker inline
// nell'editor note (RichTextEditor.tsx/tiptapInlineIcon.ts) - copiati una
// volta da node_modules/lucide-react per non dipendere a runtime dalla sua
// struttura interna di file (non contrattuale, vedi commento nello script).

export type IconPrimitive = [string, Record<string, string | number>];

export const ICON_CATEGORIES: { label: string; icons: string[] }[] = ${JSON.stringify(ICON_CATEGORIES, null, 2)};

export const DEFAULT_ICON_NAME = 'Star';

export const ICON_DATA: Record<string, IconPrimitive[]> = ${JSON.stringify(iconData, null, 2)};
`;

writeFileSync(OUTPUT_FILE, header, 'utf8');
console.log(`Generato ${OUTPUT_FILE} (${allNames.length} icone, ${Object.values(iconData).reduce((n, a) => n + a.length, 0)} primitive SVG totali).`);
