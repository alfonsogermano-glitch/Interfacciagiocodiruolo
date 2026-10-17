import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { startNoteBrowser } from './note-browser-driver.mjs';

const baseUrl = process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187';
const reactUrl = new URL('/@id/react', baseUrl).href;
const reactDomUrl = new URL('/@id/react-dom', baseUrl).href;

const bundle = await build({
  entryPoints: ['src/app/components/session/MapViewport.tsx'],
  bundle: true, format: 'esm', platform: 'browser', write: false,
  plugins: [{ name: 'map-viewport-browser', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'sw-react' }));
    builder.onLoad({ filter: /.*/, namespace: 'sw-react' }, () => ({
      contents: `import React from '${reactUrl}'; export default React; export const {Children,Component,PureComponent,Fragment,StrictMode,Suspense,cloneElement,createContext,createElement,createRef,forwardRef,isValidElement,lazy,memo,startTransition,use,useCallback,useContext,useDebugValue,useDeferredValue,useEffect,useId,useImperativeHandle,useInsertionEffect,useLayoutEffect,useMemo,useReducer,useRef,useState,useSyncExternalStore,useTransition,version}=React;`, loader: 'js',
    }));
    builder.onResolve({ filter: /^react\/jsx-(?:dev-)?runtime$/ }, () => ({ path: 'jsx', namespace: 'sw-jsx' }));
    builder.onLoad({ filter: /.*/, namespace: 'sw-jsx' }, () => ({
      contents: `import React from '${reactUrl}'; export const Fragment=React.Fragment; export function jsx(type,props,key){const p=Object.assign({},props);if(key!==undefined&&p.key===undefined)p.key=key;return React.createElement(type,p)} export const jsxs=jsx; export const jsxDEV=jsx;`, loader: 'js',
    }));
    builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: new URL(`/@id/${args.path}`, baseUrl).href, external: true }));
  } }],
});

const source = bundle.outputFiles[0].text;
const browser = await startNoteBrowser();
try {
  const result = await browser.evaluate(async (source, reactDomUrl) => {
    const react = await import('/@id/react');
    const h = (react.default || react).createElement;
    const dom = await import(reactDomUrl);
    const { createRoot } = dom.default || dom;

    const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const { MapViewport } = await import(moduleUrl); URL.revokeObjectURL(moduleUrl);

    const GRID = { visible: true, type: 'square', lineStyle: 'solid', color: '#38bdf8', opacity: 0, snap: false, squareSnapMode: 'half-step', distance: 5, unit: 'Metri', cellSize: 100 };
    const KEYS = ['blinded', 'charmed', 'grappled', 'deafened', 'poisoned', 'exhausted', 'incapacitated', 'invisible', 'petrified', 'paralyzed', 'unconscious', 'prone', 'bloodied', 'frightened', 'stunned', 'restrained'];
    const NAMES = { blinded: 'Accecato', charmed: 'Affascinato', grappled: 'Afferrato', deafened: 'Assordato', poisoned: 'Avvelenato', exhausted: 'Esausto', incapacitated: 'Incapacitato', invisible: 'Invisibile', petrified: 'Pietrificato', paralyzed: 'Paralizzato', unconscious: 'Privo di sensi', prone: 'Prono', bloodied: 'Sanguinante', frightened: 'Spaventato', stunned: 'Stordito', restrained: 'Trattenuto' };

    const makeToken = (id, x, keys) => ({
      id, entityKind: 'pg', entityId: id, name: id, x, y: 60, size: 120,
      createdAt: id, updatedAt: id,
      conditions: keys.map((key, i) => ({ id: `${id}-${i}`, name: NAMES[key] ?? key, standardKey: key })),
    });

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:600px';
    document.body.appendChild(host);
    createRoot(host).render(h(MapViewport, {
      mapId: 'map-centering', isOwner: true, mapPlacement: { x: 0, y: 0, locked: true },
      gridSettings: GRID,
      mapTokens: [makeToken('one', 40, ['blinded']), makeToken('few', 360, ['blinded', 'prone', 'stunned']), makeToken('many', 680, KEYS)],
    }, h('div', { style: { width: 900, height: 400, background: '#123' } })));
    await new Promise(resolve => setTimeout(resolve, 900));

    // Baricentro dell'ink: disegna ogni icona su un canvas e pesa i pixel non trasparenti.
    const inkCentroid = async icon => {
      const rect = icon.getBoundingClientRect();
      const size = 96;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, size, size);
      const image = new Image();
      if (icon.tagName === 'IMG') {
        image.src = icon.currentSrc || icon.src;
        await image.decode().catch(() => {});
        // simula object-fit: contain dentro il rettangolo dell'elemento
        const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
        const w = image.naturalWidth * scale;
        const hgt = image.naturalHeight * scale;
        ctx.drawImage(image, (size - w) / 2, (size - hgt) / 2, w, hgt);
      } else {
        const svg = new XMLSerializer().serializeToString(icon);
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await image.decode().catch(() => {});
        const scale = Math.min(size / rect.width, size / rect.height);
        const w = rect.width * scale;
        const hgt = rect.height * scale;
        ctx.drawImage(image, (size - w) / 2, (size - hgt) / 2, w, hgt);
      }
      const { data } = ctx.getImageData(0, 0, size, size);
      let mass = 0, sx = 0, sy = 0;
      let minX = size, maxX = -1, minY = size, maxY = -1;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const a = data[(y * size + x) * 4 + 3];
          if (a > 40) {
            mass += a; sx += a * x; sy += a * y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (!mass) return { mass: 0 };
      return { mass, cx: sx / mass, cy: sy / mass, size, bbox: { minX, maxX, minY, maxY } };
    };

    const rows = [];
    for (const button of host.querySelectorAll('button[aria-label^="Token"]')) {
      const selector = 'span.rounded-full[class*="bg-slate-800/95"]';
      const count = button.querySelectorAll(selector).length;
      const badgeSize = button.querySelector(selector)?.getBoundingClientRect().width ?? 0;
      for (const badge of button.querySelectorAll(selector)) {
        const icon = badge.firstElementChild?.firstElementChild ?? badge.firstElementChild;
        if (!icon) continue;
        const ink = await inkCentroid(icon);
        const rect = icon.getBoundingClientRect();
        const b = badge.getBoundingClientRect();
        // centro geometrico icona vs badge
        const boxDx = (rect.left + rect.width / 2) - (b.left + b.width / 2);
        const boxDy = (rect.top + rect.height / 2) - (b.top + b.height / 2);
        // baricentro ink vs centro badge (px CSS)
        let inkDx = null, inkDy = null, bboxDx = null, bboxDy = null;
        if (ink.mass) {
          const pxPerCanvas = rect.width / ink.size;
          inkDx = Math.round((((ink.cx + 0.5) - ink.size / 2) * pxPerCanvas + boxDx) * 100) / 100;
          inkDy = Math.round((((ink.cy + 0.5) - ink.size / 2) * pxPerCanvas + boxDy) * 100) / 100;
          const bboxCx = (ink.bbox.minX + ink.bbox.maxX + 1) / 2;
          const bboxCy = (ink.bbox.minY + ink.bbox.maxY + 1) / 2;
          bboxDx = Math.round(((bboxCx - ink.size / 2) * pxPerCanvas + boxDx) * 100) / 100;
          bboxDy = Math.round(((bboxCy - ink.size / 2) * pxPerCanvas + boxDy) * 100) / 100;
        }
        const src = icon.tagName === 'IMG' ? icon.getAttribute('src') : (icon.getAttribute('class') || icon.tagName);
        rows.push({
          count, badgeW: Math.round(badgeSize * 10) / 10, src,
          boxDx: Math.round(boxDx * 100) / 100, boxDy: Math.round(boxDy * 100) / 100,
          inkDx, inkDy, bboxDx, bboxDy,
        });
      }
    }
    return rows;
  }, source, reactDomUrl);

  const byCount = new Map();
  for (const row of result) {
    if (!byCount.has(row.count)) byCount.set(row.count, []);
    byCount.get(row.count).push(row);
  }
  for (const [count, rows] of [...byCount.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`\n=== ${count} condizioni (badge ${rows[0].badgeW}px) ===`);
    for (const row of rows) {
      const flag = row.bboxDx !== null && (Math.abs(row.bboxDx) > 0.8 || Math.abs(row.bboxDy) > 0.8) ? ' <-- OFF' : '';
      console.log(`  box=(${row.boxDx},${row.boxDy}) ink=(${row.inkDx},${row.inkDy}) bbox=(${row.bboxDx},${row.bboxDy}) ${String(row.src).slice(0, 58)}${flag}`);
    }
  }
  const off = result.filter(row => row.bboxDx !== null && (Math.abs(row.bboxDx) > 0.8 || Math.abs(row.bboxDy) > 0.8));
  console.log(`\nbbox fuori centro: ${off.length}/${result.length}`);
  assert.ok(result.length > 0, 'badge misurati');
  console.log('Condition ink: DONE');
} finally {
  await browser.close();
}
