import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { startNoteBrowser } from './note-browser-driver.mjs';

const baseUrl = process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187';
const reactUrl = new URL('/@id/react', baseUrl).href;
const reactDomUrl = new URL('/@id/react-dom', baseUrl).href;

const bundle = await build({
  entryPoints: ['src/app/components/session/ActiveScenePanel.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  plugins: [{ name: 'active-scene-browser', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'as-react' }));
    builder.onLoad({ filter: /.*/, namespace: 'as-react' }, () => ({
      contents: `import React from '${reactUrl}'; export default React; export const {Children,Component,PureComponent,Fragment,StrictMode,Suspense,cloneElement,createContext,createElement,createRef,forwardRef,isValidElement,lazy,memo,startTransition,use,useCallback,useContext,useDebugValue,useDeferredValue,useEffect,useId,useImperativeHandle,useInsertionEffect,useLayoutEffect,useMemo,useReducer,useRef,useState,useSyncExternalStore,useTransition,version}=React;`, loader: 'js',
    }));
    builder.onResolve({ filter: /^react\/jsx-(?:dev-)?runtime$/ }, () => ({ path: 'jsx', namespace: 'as-jsx' }));
    builder.onLoad({ filter: /.*/, namespace: 'as-jsx' }, () => ({
      contents: `import React from '${reactUrl}'; export const Fragment=React.Fragment; export function jsx(type,props,key){const p=Object.assign({},props);if(key!==undefined&&p.key===undefined)p.key=key;return React.createElement(type,p)} export const jsxs=jsx; export const jsxDEV=jsx;`, loader: 'js',
    }));
    builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: new URL(`/@id/${args.path}`, baseUrl).href, external: true }));
    builder.onResolve({ filter: /entitiesService$/ }, () => ({ path: 'entities', namespace: 'as-stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'as-stub' }, () => ({
      contents: `export async function loadScenes(){window.__AS.notesLoads+=1;return [{id:window.__AS.sceneId,notes:'Porta segreta dietro lo scaffale.'}]}`, loader: 'js',
    }));
  } }],
});

const managerSource = readFileSync('src/app/components/gm/SceneEncounterManager.tsx', 'utf8');
const publicationSource = readFileSync('src/services/campaign/activeScene.ts', 'utf8');
const homeSource = readFileSync('src/app/campaigns/CampaignHome.tsx', 'utf8');
assert.match(managerSource, /selectedScene\.status !== 'ready'/, 'le scene non pronte non vengono pubblicate');
assert.match(managerSource, /await publish\(buildActiveScenePublication/, 'pubblicazione tramite snapshot sanitizzato');
assert.match(managerSource, /await clear\(\)/, 'rimozione della scena attiva disponibile');
assert.ok(!/notes:\s*scene\.notes/.test(publicationSource), 'le note GM non entrano nello snapshot pubblico');
assert.match(homeSource, /activeScene && \(isOwner \|\| sessionActive\)/, 'il giocatore vede la scena solo durante la sessione');

const source = bundle.outputFiles[0].text;
const browser = await startNoteBrowser();
try {
  const result = await browser.evaluate(async (source, reactDomUrl) => {
    const react = await import('/@id/react');
    const h = (react.default || react).createElement;
    const dom = await import(reactDomUrl);
    const { createRoot } = dom.default || dom;
    window.__AS = { notesLoads: 0, sceneId: '41000000-0000-0000-0000-000000000006' };
    const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const { ActiveScenePanel } = await import(moduleUrl);
    URL.revokeObjectURL(moduleUrl);
    const scene = {
      id: '41000000-0000-0000-0000-000000000005', campaignId: '41000000-0000-0000-0000-000000000004',
      sceneId: window.__AS.sceneId, chapterId: '41000000-0000-0000-0000-000000000007',
      title: 'Deposito notturno', description: 'La luce filtra dalle assi.', chapterTitle: 'Manicomio di Arkham',
      mapUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"></svg>', sceneImageUrl: null,
      mapMetadata: { imageUrl: null, gridVisible: false, gridColumns: 20, gridRows: 20 },
      mapRegions: [{ id: 'area-1', label: 'Deposito', color: '#f59e0b', geometry: { kind: 'rect', rect: { x: 10, y: 15, width: 35, height: 20 } } }],
      contextMetadata: { timeOfDay: 'Notte', period: 'Dopo epidemia', condition: '' }, publishedAt: new Date().toISOString(),
    };
    const playerHost = document.createElement('div'); document.body.appendChild(playerHost);
    createRoot(playerHost).render(h(ActiveScenePanel, { campaignId: scene.campaignId, scene, isOwner: false }));
    await new Promise(resolve => setTimeout(resolve, 200));
    const player = { text: playerHost.textContent, rects: playerHost.querySelectorAll('svg rect').length, notesLoads: window.__AS.notesLoads };
    const gmHost = document.createElement('div'); document.body.appendChild(gmHost);
    createRoot(gmHost).render(h(ActiveScenePanel, { campaignId: scene.campaignId, scene, isOwner: true }));
    await new Promise(resolve => setTimeout(resolve, 300));
    return { player, gmText: gmHost.textContent, notesLoads: window.__AS.notesLoads };
  }, source, reactDomUrl);

  assert.match(result.player.text, /Deposito notturno/);
  assert.match(result.player.text, /La luce filtra dalle assi/);
  assert.match(result.player.text, /Notte/);
  assert.equal(result.player.rects, 1, 'regione pubblicata sulla mappa');
  assert.equal(result.player.notesLoads, 0, 'il client giocatore non carica le Scene private');
  assert.doesNotMatch(result.player.text, /Porta segreta/);
  assert.match(result.gmText, /Solo GM/);
  assert.match(result.gmText, /Porta segreta dietro lo scaffale/);
  assert.equal(result.notesLoads, 1, 'solo il pannello GM carica le note private');
  console.log('Active scene browser: PASS (mappa/regioni pubbliche, note GM isolate, stato ready e clear cablati).');
} finally {
  await browser.close();
}
