import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { startNoteBrowser, sleep } from './note-browser-driver.mjs';

// Smoke test UI reale (Chromium) del dominio spaziale Capitolo/Scene:
// conversione Environment -> Capitolo/Scene, editor mappa del Capitolo,
// regioni sovrapponibili della Scena e navigazione legacy da archivi.
const modules = {
  entitiesService: `
const store = () => window.__CM.store;
export async function loadChapters(campaignId) { return store().chapters.filter(c => c.campaignId === campaignId); }
export async function loadEnvironments(campaignId) { return store().environments.filter(e => !e.campaignId || e.campaignId === campaignId); }
export async function loadScenes(campaignId) { return store().scenes.filter(s => s.campaignId === campaignId); }
const upsert = (rows, row) => { const i = rows.findIndex(r => r.id === row.id); if (i >= 0) rows[i] = row; else rows.push(row); };
export async function saveChapter(campaignId, chapter) {
  window.__CM.savedChapters.push(chapter);
  upsert(store().chapters, { ...chapter, campaignId });
}
export async function saveScene(campaignId, scene) {
  window.__CM.savedScenes.push(scene);
  upsert(store().scenes, { ...scene, campaignId });
}
export async function deleteChapter(id) { store().chapters = store().chapters.filter(c => c.id !== id); }
export async function deleteScene(campaignId, id) { store().scenes = store().scenes.filter(s => s.id !== id); }
export async function reorderScenes(campaignId, scenes) {
  store().scenes = store().scenes.filter(s => s.campaignId !== campaignId);
  store().scenes.push(...scenes);
  return scenes;
}
export async function loadEquipmentCatalog() { return []; }
`,
  sonner: `export const toast = { success() {}, error() {}, info() {}, warning() {}, message() {} };`,
};

const bundle = await build({
  entryPoints: ['src/app/components/gm/ChapterManager.tsx'], bundle: true, format: 'esm', platform: 'browser', write: false,
  jsx: 'transform', jsxFactory: '__TestReact.createElement', jsxFragment: '__TestReact.Fragment',
  banner: { js: `import __TestReact from '${new URL('/@id/react', process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href}';` },
  plugins: [{ name: 'chapters-spatial-browser', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'cm-react-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'cm-react-test' }, () => ({ contents: `import React from '${new URL('/@id/react', process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href}'; export default React; export const {Children,Component,PureComponent,Fragment,StrictMode,Suspense,cloneElement,createContext,createElement,createRef,forwardRef,isValidElement,lazy,memo,startTransition,use,useCallback,useContext,useDebugValue,useDeferredValue,useEffect,useId,useImperativeHandle,useInsertionEffect,useLayoutEffect,useMemo,useReducer,useRef,useState,useSyncExternalStore,useTransition,version}=React;`, loader: 'js' }));
    builder.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'react-dom', namespace: 'cm-react-dom-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'cm-react-dom-test' }, () => ({ contents: `import ReactDOM from '${new URL('/@id/react-dom', process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href}'; export default ReactDOM; export const {createPortal,flushSync}=ReactDOM;`, loader: 'js' }));
    builder.onResolve({ filter: /^react\/jsx-(?:dev-)?runtime$/ }, () => ({ path: 'jsx', namespace: 'cm-jsx-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'cm-jsx-test' }, () => ({ contents: `import React from '${new URL('/@id/react', process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href}'; export const Fragment=React.Fragment; export function jsx(type,props,key){const p=Object.assign({},props); if(key!==undefined && p.key===undefined) p.key=key; return React.createElement(type,p);} export const jsxs=jsx; export const jsxDEV=jsx;`, loader: 'js' }));
    builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (args) => ({ path: new URL(`/@id/${args.path}`, process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href, external: true }));
    builder.onResolve({ filter: /(entitiesService|^sonner$)/ }, (args) => ({ path: args.path.split('/').pop().replace(/^sonner$/, 'sonner'), namespace: 'cm-browser-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'cm-browser-test' }, (args) => ({ contents: modules[args.path], loader: 'js' }));
  } }],
});
const source = bundle.outputFiles[0].text;

// --- Verifiche statiche: niente piu' voce/rotta "Luoghi" e navigazioni legacy
//     dirette verso i Capitoli.
const sidebar = readFileSync('src/app/layout/GmSectionSidebar.tsx', 'utf8');
assert.ok(!/\{\s*id:\s*'environments'/.test(sidebar), 'la sidebar non deve piu avere la voce Luoghi/environments');
assert.ok(/id:\s*'chapters',\s*label:\s*'Capitoli'/.test(sidebar), 'la voce Capitoli resta attiva nella sidebar');
const app = readFileSync('src/app/App.tsx', 'utf8');
assert.ok(!app.includes('<EnvironmentManager'), 'App non monta piu EnvironmentManager');
assert.ok(app.includes("tabId === 'environments'"), 'tab legacy environments mappato su chapters');
for (const file of ['src/app/components/gm/MonstersManager.tsx', 'src/features/gm/pages/EquipmentCatalogPage.tsx']) {
  const content = readFileSync(file, 'utf8');
  assert.ok(!content.includes("tabId: 'environments'"),
    `${file} non deve navigare piu verso il tab environments`);
}

const browser = await startNoteBrowser();
try {
  await browser.evaluate(async (source) => {
    window.__CM = { logs: [] };
    const originalConsoleError = console.error;
    console.error = (...args) => { window.__CM.logs.push(args.map(value => String(value?.stack || value)).join(' ')); originalConsoleError(...args); };
    const campaignId = '20000000-0000-0000-0000-000000000001';
    const rootId = '7e347267-2e36-4a20-8ab6-be39aa866560';
    const childId = '9cbd05ec-6ab1-4c2a-91d2-44936ad5cd62';
    const secondRootId = '155353be-75f4-47c9-b9d6-fc500c279dae';
    const now = new Date().toISOString();
    const env = (id, name, parentLocationId, mapUrl) => ({
      id, campaignId, name, description: '', notes: '', atmosphere: '', imageUrl: null,
      mapUrl: mapUrl ?? null, features: [], hazards: [], npcsPresent: [],
      parentLocationId, chapterId: null, sortOrder: 0, createdAt: now, updatedAt: now,
    });
    Object.assign(window.__CM, {
      campaignId, rootId, childId, secondRootId, savedChapters: [], savedScenes: [],
      store: {
        chapters: [], scenes: [],
        environments: [
          env(rootId, 'Manicomio di Arkham', null, 'https://maps.example/manicomio.png'),
          env(childId, 'Camera 3', rootId),
          env(secondRootId, 'Dunwich', null),
        ],
      },
    });
    const react = await import('/@id/react');
    const h = (react.default || react).createElement;
    const dom = await import('/@id/react-dom/client');
    const { createRoot } = dom.default || dom;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:0;left:0;width:1440px;height:1000px;z-index:99999;overflow:auto;background:#1b1b1b;color:#eee;--dash-text:#ddd;--dash-text-strong:#fff;--dash-muted:#aaa;--dash-border:#666;--dash-border-soft:#555;--dash-panel:#252525;--dash-surface:#333;--dash-surface-2:#383838;--dash-input:#2a2a2a;--dash-accent:#d4aa68;--dash-accent-2:#caa76a;--dash-danger-border:#733;--dash-danger-bg:#3a1f1f;--dash-danger-text:#f99;--dash-danger-hover:#4a2a2a;--dash-sidebar-bg:#181818';
    document.body.appendChild(host);
    window.__CM.host = host;
    const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const { ChapterManager } = await import(moduleUrl);
    URL.revokeObjectURL(moduleUrl);
    const root = createRoot(host);
    window.__CM.render = (props = {}) => {
      try { root.render(h(ChapterManager, { campaignId, storageRefreshKey: 0, navigationTarget: null, ...props })); }
      catch (error) { window.__CM.renderError = String(error?.stack || error); }
    };
    window.addEventListener('error', event => { window.__CM.renderError = window.__CM.renderError || String(event.error?.stack || event.message); });
    window.__CM.render();
  }, source);

  const poll = async (fn, label, timeout = 8000) => {
    const started = Date.now();
    let value;
    while (Date.now() - started < timeout) {
      value = await browser.evaluate(fn);
      if (value) return value;
      await sleep(150);
    }
    const debug = await browser.evaluate(() => ({
      renderError: window.__CM?.renderError ?? null,
      logs: (window.__CM?.logs ?? []).slice(0, 5),
      html: (window.__CM?.host?.innerHTML ?? '').slice(0, 600),
    }));
    throw new Error(`Attesa non superata: ${label} (ultimo valore: ${JSON.stringify(value)})\n${JSON.stringify(debug, null, 2)}`);
  };
  const text = () => browser.evaluate(() => window.__CM.host.textContent);
  const scope = (expression) => `(() => { const host = window.__CM.host; ${expression} })()`;

  await poll(() => window.__CM.host.textContent.includes('Macro-luoghi e mappe della campagna'), 'intestazione Capitoli');

  // 1) Conversione client: radici -> Capitoli, discendenti -> Scene.
  const converted = await browser.evaluate(() => ({
    chapters: window.__CM.store.chapters.map(c => ({
      id: c.id, title: c.title, gridColumns: c.mapMetadata?.gridColumns,
      sourceEnvironment: c.sourceEnvironment?.id ?? null, mapUrl: c.mapUrl,
    })),
    scenes: window.__CM.store.scenes.map(s => ({
      id: s.id, title: s.title, chapterId: s.chapterId, environmentId: s.environmentId ?? null,
      regions: s.mapRegions.length, context: s.contextMetadata,
    })),
    environments: window.__CM.store.environments.length,
    savedChapters: window.__CM.savedChapters.length,
    savedScenes: window.__CM.savedScenes.length,
  }));
  assert.equal(converted.chapters.length, 2, 'le due radici diventano due Capitoli');
  assert.equal(converted.scenes.length, 1, 'il discendente diventa una Scena');
  assert.equal(converted.environments, 3, 'gli ambienti legacy restano intatti');
  const manicomio = converted.chapters.find(c => c.id === '7e347267-2e36-4a20-8ab6-be39aa866560');
  assert.ok(manicomio, 'la radice conserva lo stesso UUID come Capitolo');
  assert.equal(manicomio.title, 'Manicomio di Arkham');
  assert.equal(manicomio.gridColumns, 20, 'mapMetadata con valori canonici');
  assert.equal(manicomio.sourceEnvironment, '7e347267-2e36-4a20-8ab6-be39aa866560', 'marker sourceEnvironment');
  const camera = converted.scenes.find(s => s.id === '9cbd05ec-6ab1-4c2a-91d2-44936ad5cd62');
  assert.ok(camera, 'la scena conserva lo stesso UUID');
  assert.equal(camera.chapterId, manicomio.id, 'la scena punta al capitolo radice');
  assert.equal(camera.environmentId, '9cbd05ec-6ab1-4c2a-91d2-44936ad5cd62', 'compatibilita environment_id');
  assert.deepEqual(camera.context, { timeOfDay: '', period: '', condition: '' }, 'contextMetadata canonico');
  assert.ok(converted.savedChapters >= 2 && converted.savedScenes >= 1, 'conversione persistita');

  // 2) Selezione Capitolo -> editor scene + anteprima mappa generale.
  await browser.evaluate(scope(`
    const card = [...host.querySelectorAll('h3')].find(h => h.textContent.trim() === 'Manicomio di Arkham');
    card.closest('div.cursor-pointer').click();
    return true;
  `));
  await poll(() => window.__CM.host.textContent.includes('Scene del capitolo'), 'sezione Scene del capitolo');
  assert.ok(await browser.evaluate(scope(`return [...host.querySelectorAll('button')].some(b => b.textContent.includes('Camera 3'))`)), 'la scena convertita e selezionabile');
  assert.equal(await browser.evaluate(scope(`return [...host.querySelectorAll('section select')].some(select => /luogo|ambiente/i.test(select.textContent)) ? 1 : 0`)), 0, 'nessun selettore Luogo nella scena');
  assert.ok(await browser.evaluate(scope(`return !!host.querySelector('img[src*="manicomio.png"]')`)), 'anteprima mappa del macro-luogo');

  // 3) Editor Capitolo: mappa generale + griglia.
  await browser.evaluate(scope(`host.querySelector('div.mb-6.flex.items-start.justify-between button').click(); return true;`));
  const mapLabel = await poll(scope(`const label=[...host.querySelectorAll('label')].find(l => l.textContent.includes('URL immagine mappa')); return label ? 1 : 0`), 'form mappa macro-luogo');
  assert.equal(mapLabel, 1);
  await browser.evaluate(scope(`
    const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const urlLabel=[...host.querySelectorAll('label')].find(l=>l.textContent.includes('URL immagine mappa'));
    set(urlLabel.querySelector('input'),'https://maps.example/nuova-mappa.png');
    return true;
  `));
  await poll(() => {
    const chapter = window.__CM.store.chapters.find(c => c.id === window.__CM.rootId);
    return chapter && chapter.mapUrl === 'https://maps.example/nuova-mappa.png' ? chapter : null;
  }, 'salvataggio URL mappa del Capitolo');
  await browser.evaluate(scope(`
    const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const gridLabel=[...host.querySelectorAll('label')].find(l=>l.textContent.includes('Colonne griglia'));
    set(gridLabel.querySelector('input'),'12');
    return true;
  `));
  const chapterSaved = await poll(() => {
    const chapter = window.__CM.store.chapters.find(c => c.id === window.__CM.rootId);
    return chapter && chapter.mapMetadata.gridColumns === 12 && chapter.mapUrl === 'https://maps.example/nuova-mappa.png' ? chapter : null;
  }, 'salvataggio griglia del Capitolo');
  assert.equal(chapterSaved.mapMetadata.imageUrl, 'https://maps.example/nuova-mappa.png', 'imageUrl sincronizzato in mapMetadata');

  // 4) Nuova Scena: regione rettangolare + variante contestuale, nessun Luogo.
  await poll(() => window.__CM.host.textContent.includes('Nuova scena'), 'pulsante Nuova scena');
  await browser.evaluate(scope(`
    [...host.querySelectorAll('button')].find(b => b.textContent.includes('Nuova scena')).click();
    return true;
  `));
  await poll(scope(`return host.textContent.includes('Regioni sulla mappa') ? 1 : 0`), 'pannello regioni');
  assert.equal(await browser.evaluate(scope(`return [...host.querySelectorAll('section select')].some(select => /luogo|ambiente/i.test(select.textContent)) ? 1 : 0`)), 0, 'la scena non ha selettore ambiente');
  const setSceneField = async (labelText, value) => {
    await browser.evaluate(scope(`
      const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
      const section=host.querySelector('section');
      const label=[...section.querySelectorAll('label')].find(l=>l.textContent.includes(${JSON.stringify(labelText)}));
      set(label.querySelector('input'),${JSON.stringify(value)});
      return true;
    `));
    await sleep(120);
  };
  await setSceneField('Titolo', 'Deposito notturno');
  await setSceneField('Momento del giorno', 'Notte');
  await setSceneField('Periodo', 'Dopo epidemia');
  await browser.evaluate(scope(`
    const section=host.querySelector('section');
    [...section.querySelectorAll('button')].find(b=>b.textContent.includes('Area')).click();
    return true;
  `));
  await poll(scope(`
    const numbers=[...window.__CM.host.querySelector('section').querySelectorAll('input[type=number]')];
    return numbers.length === 4 ? 1 : 0;
  `), 'quattro coordinate della regione');
  await browser.evaluate(scope(`
    const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const section=host.querySelector('section');
    const numbers=[...section.querySelectorAll('input[type=number]')];
    set(numbers[2],'35');
    [...section.querySelectorAll('button')].find(b=>b.textContent.includes('Salva')).click();
    return true;
  `));
  const savedScene = await poll(() => window.__CM.savedScenes.find(s => s.title === 'Deposito notturno'), 'salvataggio scena');
  assert.equal(savedScene.chapterId, '7e347267-2e36-4a20-8ab6-be39aa866560', 'scena salvata nel capitolo corrente');
  assert.equal(savedScene.mapRegions.length, 1, 'una regione salvata');
  assert.deepEqual(savedScene.mapRegions[0].geometry, { kind: 'rect', rect: { x: 10, y: 10, width: 35, height: 20 } }, 'geometria rettangolare percentuale');
  assert.deepEqual(savedScene.contextMetadata, { timeOfDay: 'Notte', period: 'Dopo epidemia', condition: '' }, 'variante contestuale salvata');
  assert.equal(savedScene.environmentId ?? null, null, 'nessun legame ambiente sulla nuova scena');
  assert.equal(savedScene.status, 'draft');

  // 5) Navigazione legacy dagli archivi: entityType "environment" -> Capitolo.
  await browser.evaluate(scope(`
    const card = [...host.querySelectorAll('h3')].find(h => h.textContent.trim() === 'Dunwich');
    card.closest('div.cursor-pointer').click();
    return true;
  `));
  await poll(() => window.__CM.host.querySelector('h2.text-2xl')?.textContent.trim() === 'Dunwich', 'selezione manuale Dunwich');
  await browser.evaluate(() => window.__CM.render({ navigationTarget: { tabId: 'chapters', entityId: window.__CM.rootId, entityType: 'environment' } }));
  await poll(() => window.__CM.host.querySelector('h2.text-2xl')?.textContent.trim() === 'Manicomio di Arkham', 'selezione via navigazione legacy');
  const selectedTitle = await browser.evaluate(() => window.__CM.host.querySelector('h2.text-2xl')?.textContent.trim());
  assert.equal(selectedTitle, 'Manicomio di Arkham', 'il target legacy environment apre il Capitolo migrato');

  console.log('Chapters spatial smoke: PASS (Environment->Capitolo/Scene, editor mappa, regioni, contesto, navigazione legacy, UI senza Luoghi).');
} finally {
  await browser.close();
}
