import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { startNoteBrowser, sleep } from './note-browser-driver.mjs';

const baseUrl = process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187';
const reactUrl = new URL('/@id/react', baseUrl).href;
const reactDomUrl = new URL('/@id/react-dom', baseUrl).href;

const bundle = await build({
  entryPoints: ['src/app/components/session/SessionWorkspace.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  plugins: [
    {
      name: 'session-workspace-browser',
      setup(builder) {
        builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'sw-react' }));
        builder.onLoad({ filter: /.*/, namespace: 'sw-react' }, () => ({
          contents: `import React from '${reactUrl}'; export default React; export const {Children,Component,PureComponent,Fragment,StrictMode,Suspense,cloneElement,createContext,createElement,createRef,forwardRef,isValidElement,lazy,memo,startTransition,use,useCallback,useContext,useDebugValue,useDeferredValue,useEffect,useId,useImperativeHandle,useInsertionEffect,useLayoutEffect,useMemo,useReducer,useRef,useState,useSyncExternalStore,useTransition,version}=React;`,
          loader: 'js',
        }));
        builder.onResolve({ filter: /^react\/jsx-(?:dev-)?runtime$/ }, () => ({ path: 'jsx', namespace: 'sw-jsx' }));
        builder.onLoad({ filter: /.*/, namespace: 'sw-jsx' }, () => ({
          contents: `import React from '${reactUrl}'; export const Fragment=React.Fragment; export function jsx(type,props,key){const p=Object.assign({},props);if(key!==undefined&&p.key===undefined)p.key=key;return React.createElement(type,p)} export const jsxs=jsx; export const jsxDEV=jsx;`,
          loader: 'js',
        }));
        builder.onResolve({ filter: /entitiesService$/ }, () => ({ path: 'entities', namespace: 'sw-stub' }));
        builder.onResolve({ filter: /services\/campaign\/activeScene$/ }, () => ({ path: 'active-scene', namespace: 'sw-stub' }));
        builder.onResolve({ filter: /useActiveScene$/ }, () => ({ path: 'active-hook', namespace: 'sw-stub' }));
        builder.onResolve({ filter: /useCampaignDocument$/ }, () => ({ path: 'campaign-document-hook', namespace: 'sw-stub' }));
        builder.onResolve({ filter: /services\/campaign\/sceneEncounter$/ }, () => ({ path: 'scene-encounter', namespace: 'sw-stub' }));
        builder.onLoad({ filter: /.*/, namespace: 'sw-stub' }, (args) => {
          if (args.path === 'entities') return { contents: `export async function loadChapters(){window.__SW.privateLoads+=1;return window.__SW.chapters} export async function loadScenes(){window.__SW.privateLoads+=1;return window.__SW.scenes}`, loader: 'js' };
          if (args.path === 'active-scene') return { contents: `export function buildActiveScenePublication(campaignId,scene,chapter){return {id:'pub:'+scene.id,campaignId,sceneId:scene.id,chapterId:chapter.id,title:scene.title,description:scene.description,chapterTitle:chapter.title,mapUrl:chapter.mapUrl,sceneImageUrl:scene.imageUrl,mapMetadata:chapter.mapMetadata,mapRegions:scene.mapRegions,contextMetadata:scene.contextMetadata,publishedAt:new Date().toISOString()}}`, loader: 'js' };
          if (args.path === 'active-hook') return { contents: `import React from '${reactUrl}'; export function useActiveScene(){const [activeScene,setActiveScene]=React.useState(window.__SW.active);return {activeScene,channelReady:true,publish:async value=>{window.__SW.published.push(value);setActiveScene(value)}}}`, loader: 'js' };
          if (args.path === 'campaign-document-hook') return { contents: `import React from '${reactUrl}'; export function useCampaignDocument(key,fallback,options){const [value,setValue]=React.useState(fallback);const update=next=>setValue(current=>{const value=typeof next==='function'?next(current):next;window.__SW.encounterChanges.push(value?.status??'stopped');return value});return options?.enabled===false?[fallback,update]:[value,update]}`, loader: 'js' };
          return { contents: `export async function buildSceneEncounter(campaignId,scene){return {id:'encounter-1',campaignId,environmentId:scene.environmentId??scene.id,environmentName:scene.title,sceneId:scene.id,npcIds:[],monsterIds:[],clueIds:[],situationIds:[],startedAt:new Date().toISOString(),status:'running'}}`, loader: 'js' };
        });
        builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (args) => ({ path: new URL(`/@id/${args.path}`, baseUrl).href, external: true }));
      },
    },
  ],
});

const layerBundle = await build({
  entryPoints: ['src/app/components/session/mapObjectLayers.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const layerModuleUrl = `data:text/javascript;base64,${Buffer.from(layerBundle.outputFiles[0].text).toString('base64')}`;
const { reconcileMapObjectOrder, moveMapObjectBlock, filterMapObjectOrder } = await import(layerModuleUrl);
const legacyOrder = reconcileMapObjectOrder(undefined, [
  ['drawing', [{ id: 'd1' }, { id: 'd2' }]],
  ['token', [{ id: 't1' }]],
  ['poi', [{ id: 'p1' }]],
]);
assert.deepEqual(legacyOrder, [
  { family: 'drawing', id: 'd1' }, { family: 'drawing', id: 'd2' },
  { family: 'token', id: 't1' }, { family: 'poi', id: 'p1' },
], 'l ordine legacy viene riconciliato deterministicamente fra famiglie');
const blockMoved = moveMapObjectBlock(legacyOrder, [legacyOrder[0], legacyOrder[2]], 'forward');
assert.deepEqual(blockMoved, [legacyOrder[1], legacyOrder[0], legacyOrder[2], legacyOrder[3]], 'un blocco misto avanza di un solo vicino mantenendo l ordine relativo');
assert.strictEqual(moveMapObjectBlock(blockMoved, [legacyOrder[3]], 'front'), blockMoved, 'una mossa gia al limite e un no-op identificabile');
assert.deepEqual(filterMapObjectOrder(legacyOrder, [legacyOrder[1], legacyOrder[3]]), [legacyOrder[1], legacyOrder[3]], 'lo snapshot pubblico filtra senza riordinare');

const homeSource = readFileSync('src/app/campaigns/CampaignHome.tsx', 'utf8');
const appSource = readFileSync('src/app/App.tsx', 'utf8');
const topBarSource = readFileSync('src/app/layout/TopBar.tsx', 'utf8');
const indexCssSource = readFileSync('src/styles/index.css', 'utf8');
const publicationSource = readFileSync('src/services/campaign/activeScene.ts', 'utf8');
const workspaceSource = readFileSync('src/app/components/session/SessionWorkspace.tsx', 'utf8');
const viewportSource = readFileSync('src/app/components/session/MapViewport.tsx', 'utf8');
const gridSnapSource = readFileSync('src/app/components/session/mapGridSnap.ts', 'utf8');
const mapToolStoreSource = readFileSync('src/app/components/session/mapToolStore.ts', 'utf8');
const mapObjectLayersSource = readFileSync('src/app/components/session/mapObjectLayers.ts', 'utf8');
const sidebarSource = readFileSync('src/app/components/session/SessionRightSidebar.tsx', 'utf8');
const encounterManagerSource = readFileSync('src/app/components/gm/SceneEncounterManager.tsx', 'utf8');
const sceneEncounterServiceSource = readFileSync('src/services/campaign/sceneEncounter.ts', 'utf8');
const campaignsPageSource = readFileSync('src/app/components/gm/CampaignsPage.tsx', 'utf8');
const presenceCoordinatorSource = readFileSync('src/app/presence/CampaignPresenceCoordinator.tsx', 'utf8');
const campaignChannelSource = readFileSync('src/services/realtime/campaignChannel.ts', 'utf8');
const poiTypeSource = readFileSync('src/types/sessionMapPoi.ts', 'utf8');
const noteBrowserEventSource = readFileSync('src/app/components/session/sessionNoteBrowserEvents.ts', 'utf8');
assert.match(homeSource, /return <SessionWorkspace/, 'Avvia sessione apre la workspace dedicata');
assert.match(homeSource, /sessionExpired[\s\S]*AUTO_CLOSE_AFTER_MS/, 'una sessione scaduta viene esclusa prima del render della workspace');
assert.match(homeSource, /setLocalSessionActive\(false\)[\s\S]*fetch\(`\$\{SERVER_BASE\}\/campaigns/, 'la chiusura automatica nasconde subito la sessione prima del cleanup remoto');
assert.match(homeSource, /deleteCampaignDocument\(activeCampaign\.id, 'active-encounter'\)/, 'una nuova sessione parte senza incontri ereditati');
assert.ok(!homeSource.includes('ActiveScenePanel'), 'la home campagna non mostra piu la Scena attiva');
const settingsIndex = homeSource.indexOf('Impostazioni Campagna');
const managementIndex = homeSource.indexOf('Gestione campagna', settingsIndex);
assert.ok(settingsIndex >= 0 && managementIndex > settingsIndex, 'Gestione segue Impostazioni nel menu campagna');
assert.match(appSource, /sessionWorkspaceActive \? null : \(/, 'la workspace sostituisce la sidebar globale');
assert.match(appSource, /sessionWorkspaceActive=\{view === 'campaign-home' && sessionWorkspaceActive\}/, 'App attiva gli strumenti mappa solo nella workspace');
assert.match(appSource, /CampaignPresenceCoordinator[\s\S]*campaignId=\{view === 'campaign-home'/, 'la vista reale controlla la presenza nella campagna');
assert.doesNotMatch(homeSource, /\btrack\(|\buntrack\(/, 'CampaignHome osserva Presence senza possederla');
assert.doesNotMatch(campaignsPageSource, /\btrack\(|\buntrack\(/, 'la lista campagne osserva Presence senza possederla');
assert.doesNotMatch(homeSource, /globallyOnlineProfileIds|bg-amber-400/, 'la home campagna usa solo gli stati verde e grigio');
assert.doesNotMatch(campaignsPageSource, /useOnlinePresence|bg-amber-400/, 'la lista campagne usa solo gli stati verde e grigio');
assert.match(presenceCoordinatorSource, /useCampaignChannel[\s\S]*\{\s*presence,/, 'un solo coordinatore pubblica la presenza nella campagna');
assert.match(campaignChannelSource, /desiredPresence[\s\S]*presenceQueue[\s\S]*reconcilePresence/, 'gli aggiornamenti Presence sono serializzati e ripristinabili');
for (const tool of ['Muovi', 'Seleziona', 'Griglia', 'Misura', 'Disegna', 'Punti di interesse (PDI)', 'Nebbia', 'Muri', 'Puntatore']) assert.match(topBarSource, new RegExp(`label: '${tool.replace(/[()]/g, '\\$&')}'`), `toolbar sessione include ${tool}`);
for (const icon of ['MoveMapIcon', 'SelectMapIcon', 'GridMapIcon', 'MeasureMapIcon', 'WallsMapIcon', 'PointerMapIcon']) assert.match(topBarSource, new RegExp(`function ${icon}`), `icona toolbar multipart ${icon}`);
for (const animation of ['MoveVertical', 'MoveHorizontal', 'SelectTrack', 'GridCell', 'MeasureFill', 'Draw', 'Pin', 'Fog', 'WallBrick1', 'WallBrick10', 'Pointer']) assert.match(indexCssSource, new RegExp(`@keyframes mapTool${animation}`), `animazione toolbar ${animation}`);
assert.match(indexCssSource, /\.lucide-plus[\s\S]*\.lucide-minus[\s\S]*plusPulse/, 'Plus e Minus condividono la stessa animazione globale');
assert.ok(!/notes:\s*scene\.notes/.test(publicationSource), 'le note GM non entrano nello snapshot pubblico');
for (const field of ['iconName', 'visibleToPlayers', 'locked', 'pinned', 'lightRadius', 'noteId', 'labelVisible', 'createdByProfileId']) assert.match(poiTypeSource, new RegExp(field), `il PDI tipizzato include ${field}`);
assert.match(workspaceSource, /session-map-pois[\s\S]*publicMapPois[\s\S]*map_poi_action/, 'i PDI persistono per capitolo e le richieste giocatore passano dal GM');
assert.match(workspaceSource, /publicMapPois[\s\S]*noteVisibleToPlayers \? poi\.noteId : null/, 'gli snapshot giocatore espongono soltanto collegamenti a note condivise');
assert.match(viewportSource, /activeTool === 'pin'[\s\S]*onPoiCreate[\s\S]*data-session-map-pois/, 'Puntina crea e renderizza PDI sulla mappa');
assert.match(viewportSource, /Modifica icona[\s\S]*Colore[\s\S]*Nascondi ai giocatori[\s\S]*Blocca PDI[\s\S]*Luce disponibile con la nebbia[\s\S]*Ridimensiona PDI[\s\S]*Collega nota[\s\S]*Fissa PDI[\s\S]*Elimina PDI/, 'il menu PDI mantiene l ordine strutturale richiesto');
assert.match(viewportSource, /NoteIconGrid[\s\S]*NoteIconGlyph/, 'i PDI riusano il catalogo icone delle note');
assert.match(viewportSource, /Duplica PDI[\s\S]*Copia PDI/, 'il menu PDI espone duplicazione e copia');
assert.match(viewportSource, /poiClipboard[\s\S]*onPoiPaste/, 'la copia PDI puo essere incollata ripetutamente sulla mappa');
assert.match(viewportSource, /panel === 'notes'[\s\S]*poiNoteOptions[\s\S]*noteVisibleToPlayers/, 'il menu PDI mostra direttamente le note accessibili');
assert.match(noteBrowserEventSource, /SessionNoteOpenRequest[\s\S]*noteId/, 'l apertura note usa un contratto browser tipizzato');
assert.doesNotMatch(workspaceSource, /\bEye\b/, 'la Scena pubblicata non usa un indicatore occhio ambiguo');
assert.match(viewportSource, /onWheel=\{zoom\}/, 'il viewport usa la rotellina per lo zoom');
assert.match(viewportSource, /setPointerCapture/, 'il pan mantiene la cattura robusta del puntatore');
assert.match(viewportSource, /PAN_ENABLED_TOOLS[\s\S]*'move'[\s\S]*'grid'[\s\S]*'pin'[\s\S]*'pointer'/, 'Muovi, Griglia, Puntina e Puntatore consentono il trascinamento');
assert.match(viewportSource, /data-map-interactive/, 'gli oggetti interattivi futuri possono escludere il pan della mappa');
assert.match(viewportSource, /hollowgate\.map-view/, 'pan e zoom persistono localmente per ogni utente');
assert.match(viewportSource, /MIN_SCALE = 0\.3/, 'lo zoom out arriva al trenta percento del fit iniziale');
assert.match(topBarSource, /data-session-grid-panel/, 'la toolbar espone il pannello configurazione griglia');
assert.doesNotMatch(topBarSource, />Mostra griglia</, 'l’opacita sostituisce il controllo ridondante Mostra griglia');
for (const lineStyle of ['solid', 'dashed', 'dotted', 'crosses', 'corners']) assert.match(topBarSource, new RegExp(lineStyle), `pannello griglia include stile ${lineStyle}`);
assert.match(topBarSource, /<select[\s\S]*Stile linea|Stile linea[\s\S]*<select/, 'gli stili linea usano un menu compatto');
for (const gridType of ['square', 'hex-flat', 'hex-pointy']) assert.match(topBarSource, new RegExp(`'${gridType}'`), `pannello griglia include ${gridType}`);
assert.match(viewportSource, /data-session-map-grid/, 'la griglia viene renderizzata su tutta la tavolozza');
assert.match(viewportSource, /strokeDasharray[\s\S]*strokeLinecap[\s\S]*lineStyle === 'dotted'/, 'la griglia supporta linee continue, tratteggiate e puntinate');
assert.match(viewportSource, /lineStyle === 'crosses'[\s\S]*lineStyle === 'corners'/, 'la griglia supporta anche marcatori a incrocio e ad angolo');
assert.match(viewportSource, /const center = size \/ 2[\s\S]*M \$\{center - crossHalf\}/, 'gli incroci quadrati sono centrati nelle celle');
assert.match(viewportSource, /cornerHalf[\s\S]*M 0 0 L \$\{cornerHalf\}[\s\S]*M \$\{size\} \$\{size\}/, 'gli angoli quadrati formano nodi diagonali completi sulle intersezioni');
assert.match(viewportSource, /lineStyle === 'crosses'[\s\S]*M \$\{cx - crossHalf\} \$\{cy\}/, 'gli incroci esagonali sono centrati nelle celle');
assert.match(viewportSource, /hexWidth \/ 2[\s\S]*Math\.abs\(row\)[\s\S]*row \* radius \* 1\.5/, 'la griglia esagonale a punta sfalsa righe distanti 1,5 raggi');
assert.match(viewportSource, /column \* radius \* 1\.5[\s\S]*hexHeight \/ 2[\s\S]*Math\.abs\(column\)/, 'la griglia esagonale piatta sfalsa colonne distanti 1,5 raggi');
assert.match(mapToolStoreSource, /snap: false/, 'lo snap e predisposto nelle impostazioni condivise');
assert.match(viewportSource, /snapToSessionGrid[\s\S]*gridSettings[\s\S]*pan\.objectSize/, 'il trascinamento della mappa applica lo snap configurato');
assert.match(viewportSource, /mapTokens\.slice\(tokenIndex \+ 1\)[\s\S]*canMoveToken\(candidate\)[\s\S]*isBoundsFullyContained/, 'un oggetto trascina solo oggetti autorizzati interamente contenuti e posti sopra');
assert.match(viewportSource, /aria-label="Livelli"[\s\S]*Porta sopra[\s\S]*Porta sotto[\s\S]*In primo piano[\s\S]*In fondo/, 'il menu token espone l’icona e i comandi dei livelli');
for (const tokenControl of ['Ridimensiona token', 'Ruota token', 'Colore etichetta', 'Elimina token']) assert.match(viewportSource, new RegExp(tokenControl), `il menu token espone ${tokenControl}`);
assert.match(viewportSource, /Magnet[\s\S]*Elementi magnetici[\s\S]*Scollega questo elemento dal gruppo/, 'il menu token permette di attivare, collegare e scollegare la calamita');
assert.match(viewportSource, /STANDARD_TOKEN_CONDITIONS[\s\S]*Rimuovi tutte[\s\S]*Condizione personalizzata/, 'il menu token gestisce condizioni standard e personalizzate');
assert.match(viewportSource, /const visibleConditions = conditions[\s\S]*Math\.cos\(angle\)[\s\S]*Math\.sin\(angle\)/, 'le condizioni vengono distribuite lungo il bordo circolare del token');
assert.match(viewportSource, /standardKey === 'dead'[\s\S]*death-skull\.svg/, 'la condizione Morte usa il teschio vettoriale dedicato');
assert.match(viewportSource, /token\.magnetGroupId[\s\S]*linkedTokens[\s\S]*gesture\.origins/, 'il movimento include tutti i membri del gruppo magnetico mantenendo gli offset');
assert.match(viewportSource, /const factor = distance \/ gesture\.startDistance[\s\S]*Object\.entries\(gesture\.origins\)/, 'il resize applica lo stesso fattore a ogni membro magnetico');
assert.match(workspaceSource, /const linkMapTokens[\s\S]*mergedGroupIds[\s\S]*const unlinkMapToken/, 'i gruppi magnetici persistenti possono essere uniti e scollegati senza catene cicliche');
assert.match(viewportSource, /beginTokenTransform[\s\S]*startDistance[\s\S]*kind === 'resize'[\s\S]*Math\.atan2/, 'resize proporzionale e rotazione avvengono tramite maniglie dirette');
assert.match(viewportSource, /preferredX = tokenRight \+ 12[\s\S]*bg-\[var\(--dash-panel\)\]/, 'il menu token si apre accanto al token e usa la palette attiva');
assert.match(topBarSource, /data-session-map-center[\s\S]*Centra la visuale sulla mappa[\s\S]*Crosshair/, 'la barra centrale espone il comando per ritrovare la mappa');
assert.match(viewportSource, /configureSessionMapCenter[\s\S]*viewport\.clientWidth \/ 2[\s\S]*viewport\.clientHeight \/ 2/, 'il comando centra la visuale sul centro geometrico della mappa');
assert.match(mapObjectLayersSource, /move === 'front'[\s\S]*objects\.length - 1[\s\S]*move === 'back'[\s\S]*Math\.min[\s\S]*Math\.max/, 'le operazioni di livello coprono spostamento singolo e assoluto');
assert.match(gridSnapSource, /Math\.round\(\(position\.x - originX\) \/ step\)[\s\S]*Math\.round\(\(position\.y - originY\) \/ step\)/, 'la griglia quadrata aggancia l’angolo a mezze celle rispettando l’origine calibrata');
assert.match(gridSnapSource, /squareSnapMode === 'cell-center'[\s\S]*target\.x - originX - radius[\s\S]*objectSize\.width \/ 2/, 'la griglia quadrata puo agganciare il centro dell’oggetto al centro cella');
assert.match(topBarSource, /data-session-map-calibrate[\s\S]*Calibra mappa/, 'la barra centrale espone la calibrazione della griglia sulla mappa');
assert.match(topBarSource, /Calibra mappa[\s\S]*requestSessionMapUndo[\s\S]*requestSessionMapRedo/, 'Undo e Redo seguono Calibra mappa nella barra centrale');
assert.match(workspaceSource, /MAP_HISTORY_LIMIT = 50[\s\S]*recordMapHistory[\s\S]*undoMapChange[\s\S]*redoMapChange/, 'la mappa mantiene una cronologia multi-passaggio per capitolo');
assert.match(viewportSource, /axisDistance \/ cells[\s\S]*originX:[\s\S]*originY:/, 'la calibrazione ricava una cella frazionaria e allinea l’origine');
assert.match(topBarSource, /disabled=\{[\s\S]*?!gridEditable[\s\S]*?id === 'grid'[\s\S]*?id === 'draw'[\s\S]*?id === 'fog'[\s\S]*?id === 'walls'/, 'disegno, griglia, nebbia e muri restano disabilitati ai giocatori');
assert.match(topBarSource, /data-session-draw-panel[\s\S]*Seleziona elemento[\s\S]*Disegno a mano libera[\s\S]*Poligono[\s\S]*Elimina tutti/, 'Disegna espone strumenti, stili e cancellazione totale');
assert.match(topBarSource, /DRAW_LINE_STYLES[\s\S]*dash-dot[\s\S]*long-dash[\s\S]*Stile linea disegno/, 'Disegna offre più stili grafici per linee e contorni');
assert.match(viewportSource, /beginDrawing[\s\S]*buildDrawing\('polygon'[\s\S]*data-session-map-drawings/, 'il viewport crea e renderizza forme e poligoni persistenti');
assert.match(topBarSource, /\['text', 'Testo', Type\][\s\S]*Colore interno testo[\s\S]*Colore bordo testo/, 'Disegna offre testo con formattazione e colori interno e bordo');
assert.match(viewportSource, /drawing\.kind === 'text'[\s\S]*foreignObject[\s\S]*WebkitTextStroke[\s\S]*Modifica testo/, 'il testo mappa viene renderizzato e modificato come elemento persistente');
assert.match(viewportSource, /commitTextDraft[\s\S]*contextmenu[\s\S]*data-map-text-draft/, 'il testo viene digitato sulla mappa, confermato con click o Invio e annullato con destro o Escape');
assert.match(viewportSource, /editingId[\s\S]*setSelectionRange[\s\S]*textDraft\?\.editingId === drawing\.id/, 'la modifica riapre il testo in posizione con il cursore alla fine senza duplicare l’elemento');
assert.match(viewportSource, /document\.addEventListener\('pointerdown', closeMenus\)/, 'i menu contestuali della mappa si chiudono con un click esterno');
assert.match(workspaceSource, /session-map-drawings[\s\S]*mapDrawings:[\s\S]*onDrawingCreate/, 'i disegni persistono per capitolo e vengono pubblicati nella scena');
assert.match(viewportSource, /drawingMagnetLink[\s\S]*Click: collega[\s\S]*Esc o destro: completa/, 'il collegamento magnetico delle figure mostra linea, bersaglio e istruzioni');
assert.match(viewportSource, /drawing\.magnetGroupId[\s\S]*mapDrawings\.filter[\s\S]*gesture\.origins[\s\S]*onDrawingsMove/, 'le figure magnetiche si spostano insieme mantenendo gli offset');
assert.match(viewportSource, /beginDrawingMove[\s\S]*!isOwner[\s\S]*calibrationActive[\s\S]*activeTool === 'measure'/, 'le figure restano modificabili dal GM indipendentemente dal lucchetto');
assert.match(viewportSource, /selectedDrawings[\s\S]*rectangleCoverage[\s\S]*polygonCoverage[\s\S]*setSelectedDrawingIds/, 'la selezione rettangolare e libera include anche le figure disegnate');
assert.match(viewportSource, /drawingOrigins[\s\S]*drawingPositions[\s\S]*tokenOrigins[\s\S]*tokenPositions/, 'token e figure appartenenti alla stessa selezione si spostano insieme');
assert.match(topBarSource, /selectionArmed && selectionMode === 'rectangle'[\s\S]*setSelectPanelOpen\(true\)[\s\S]*selectionArmed && selectionMode === 'freehand'/, 'il pannello e la modalita di selezione restano attivi per selezioni successive');
assert.match(viewportSource, /event\.key === 'Escape'[\s\S]*setSessionMapSelectionArmed\(false\)[\s\S]*onContextMenu[\s\S]*selectionArmed/, 'Escape e tasto destro terminano la modalita di selezione persistente');
assert.match(viewportSource, /selectedDrawingIds\.has\(drawing\.id\)[\s\S]*setDrawingMenu[\s\S]*selectedToken[\s\S]*setTokenMenu/, 'il click destro su una selezione mista apre contemporaneamente i menu dei tipi presenti');
assert.match(viewportSource, /const updateTargets[\s\S]*onDrawingsChange[\s\S]*onDrawingsDuplicate[\s\S]*onDrawingsDelete/, 'il menu figure applica in blocco le modifiche alle figure selezionate');
assert.match(viewportSource, /drawingTransformDrafts[\s\S]*gesture\.origins[\s\S]*scaleX[\s\S]*onDrawingTransformsChange/, 'resize e rotazione delle figure vengono applicati all’intera selezione');
assert.match(viewportSource, /horizontalScale[\s\S]*fontSize: Math\.max[\s\S]*drawingGraphic\(rendered, interactive, hoveredDrawingId === drawing\.id \|\| selectedDrawingIds\.has[\s\S]*selectedDrawingId === drawing\.id/, 'le figure mostrano l alone su hover o selezione ad area finche Resize non attiva le maniglie');
assert.match(viewportSource, /orientation === 'vertical'[\s\S]*writingMode:[\s\S]*vertical-rl[\s\S]*updateText\(\{ orientation \}\)/, 'il testo supporta orientamento verticale persistente e modifica successiva');
assert.match(viewportSource, /line\.length[\s\S]*text\.fontSize \* 1\.15[\s\S]*TooltipContent side="top">Testo/, 'il testo verticale ridimensiona il contenitore e il menu espone tooltip coerenti');
assert.match(viewportSource, /<ArrowRight data-static-icon[\s\S]*<ArrowDown data-static-icon/, 'le frecce di orientamento nel menu testo restano statiche');
assert.match(topBarSource, /\['horizontal', 'Testo orizzontale', ArrowRight\][\s\S]*<Icon data-static-icon/, 'le frecce di orientamento nella palette testo restano statiche');
assert.match(viewportSource, /curvedTextPath[\s\S]*textPath[\s\S]*beginTextCurve[\s\S]*Curva testo punto/, 'il testo supporta curve persistenti multipunto tramite maniglie dirette');
assert.match(viewportSource, /characterCount <= 1 \? 0 : characterCount <= 4 \? 1 : characterCount <= 24 \? 5 : 7[\s\S]*normalizedTextCurveOffsets/, 'i punti curva si adattano e ricampionano in base alla lunghezza del testo');
assert.match(workspaceSource, /recordMapHistory[\s\S]*updateMapDrawingTransforms/, 'le trasformazioni persistenti, inclusa la curvatura, passano dalla cronologia Undo e Redo');
assert.match(viewportSource, /simplifyPathPoints[\s\S]*convertDrawingToPath[\s\S]*beginPathPointMove[\s\S]*Nodo tracciato/, 'forme geometriche e mano libera espongono tracciati deformabili con nodi diretti');
assert.match(viewportSource, /Converti in tracciato[\s\S]*kind: 'polygon'[\s\S]*setPathEditDrawingId/, 'le forme standard possono essere convertite in poligoni persistenti e modificabili');
assert.match(viewportSource, /drawingClipboard[\s\S]*pasteDrawingAt[\s\S]*data-map-copy-action[\s\S]*data-map-paste-action/, 'Copia conserva una figura e Incolla la replica ripetutamente nel punto scelto');
assert.match(viewportSource, /ctrlKey \|\| event\.metaKey[\s\S]*key\.toLowerCase\(\) !== 'v'[\s\S]*setDrawingClipboard\(null\)/, 'Ctrl+V incolla e gli altri comandi o Escape annullano la copia attiva');
assert.match(viewportSource, /Figure selezionate[\s\S]*Token selezionati/, 'i menu simultanei identificano chiaramente il tipo di elementi selezionati');
assert.match(viewportSource, /beginMenuDrag[\s\S]*Sposta menu figure[\s\S]*Sposta menu token[\s\S]*GripHorizontal/, 'i menu contestuali possono essere riposizionati tramite una maniglia');
assert.match(viewportSource, /rectangleCoverage\(getTokenBounds[\s\S]*> 0[\s\S]*polygonCoverage\(getTokenBounds[\s\S]*> 0/, 'la selezione include ogni token sbloccato intersecato senza distinguere il tipo di entita');
assert.match(viewportSource, /drawingPathIntersectsPolygon[\s\S]*drawing\.points\?\.length\s*\?\s*drawingPathIntersectsPolygon\(drawing, rectangle\)[\s\S]*drawingPathIntersectsPolygon\(drawing, polygon\)/, 'la selezione dei tracciati usa i segmenti reali e non il solo rettangolo di ingombro');
assert.match(viewportSource, /tokenMenuWidth[\s\S]*roomForDrawingRight[\s\S]*roomForDrawingLeft[\s\S]*tokenMenu\.x - menuWidth - 12/, 'i menu simultanei usano larghezze reali e non si sovrappongono');
assert.match(viewportSource, /event\.key !== 'Delete'[\s\S]*canControlToken[\s\S]*createdByProfileId === mapUserId[\s\S]*Eliminare definitivamente i \$\{tokenIds\.length\} token selezionati[\s\S]*onDrawingsDelete/, 'Canc rispetta proprieta e lucchetto riutilizzando la conferma dei token multipli');
assert.match(viewportSource, /hoveredMapElementRef[\s\S]*hovered\.type === 'token'[\s\S]*hovered\.type === 'drawing'/, 'Canc agisce sull elemento sbloccato sotto il cursore quando non esiste una selezione ad area');
assert.match(workspaceSource, /createMapDrawingMagnetGroup[\s\S]*disableMapDrawingMagnetGroup[\s\S]*source\.magnetGroupId/, 'i collegamenti magnetici delle figure persistono e si sciolgono dall’intera catena');
assert.match(viewportSource, /isOwner[\s\S]*menuIcon\([\s\S]*token\.visible[\s\S]*isOwner[\s\S]*menuIcon\([\s\S]*token\.locked[\s\S]*Nascondi etichetta token/, 'il menu giocatore nasconde visibilita globale e blocco ma conserva il titolo');
assert.match(viewportSource, /canMoveToken[\s\S]*canControlToken[\s\S]*createdByProfileId === mapUserId[\s\S]*!canControlToken\(token\)/, 'lucchetto e proprieta distinguono movimento e controllo completo dei token');
assert.match(workspaceSource, /map_token_action[\s\S]*unlockedIds[\s\S]*controlledIds[\s\S]*["']name["'][\s\S]*["']showLabel["'][\s\S]*["']labelColor["'][\s\S]*["']conditions["']/, 'le azioni token dei giocatori passano dal GM e le modifiche complete richiedono la proprieta');
assert.match(workspaceSource, /actorProfileId: currentUserId/, 'le richieste token dichiarano l attore');
assert.match(workspaceSource, /createdByProfileId: creatorProfileId[\s\S]*payload\.action === ["']create["']/, 'i nuovi token persistono il creatore anche quando sono richiesti da un giocatore');
assert.match(viewportSource, /canMoveToken = [\s\S]*isOwner \|\| token\.locked !== true[\s\S]*canControlToken = [\s\S]*createdByProfileId === mapUserId/, 'il GM ignora il lucchetto mentre i giocatori distinguono movimento e proprieta');
assert.match(viewportSource, /token\.pinned !== true[\s\S]*drawing\.pinned !== true[\s\S]*Rimuovi fissaggio token[\s\S]*Fissa token/, 'la spilletta impedisce le interazioni e offre al GM un menu minimo per rimuoverla');
assert.match(workspaceSource, /!item\.pinned[\s\S]*item\.id !== id \|\| item\.pinned[\s\S]*!token\.pinned[\s\S]*token\.id !== tokenId \|\| token\.pinned/, 'le mutazioni persistenti non spostano, trasformano o eliminano elementi fissati');
assert.match(topBarSource, /Posizionamento oggetti[\s\S]*Mezzo passo[\s\S]*Centro casella/, 'il pannello griglia permette di scegliere lo snap quadrato');
assert.match(gridSnapSource, /objectSize\.width \/ 2[\s\S]*objectSize\.height \/ 2[\s\S]*nearestPoint/, 'le griglie esagonali agganciano il centro dell’oggetto al centro cella');
assert.match(mapToolStoreSource, /unit: 'Metri'/, 'Metri e l’unita predefinita della griglia');
assert.match(topBarSource, /min="2"/, 'la cella della griglia puo scendere fino a 2 px');
assert.match(topBarSource, /type="color"[\s\S]*Colore griglia/, 'il pannello permette di scegliere il colore della griglia');
assert.match(topBarSource, /data-session-grid-size-stepper[\s\S]*appearance-none[\s\S]*webkit-inner-spin-button/, 'la dimensione cella usa lo stepper segmentato senza frecce native');
assert.match(topBarSource, /Adatta entrambi i lati[\s\S]*Mantieni proporzioni[\s\S]*Ripristina mappa originale/, 'la griglia quadrata offre adattamento esatto, proporzionale e ripristino');
assert.match(topBarSource, /data-session-map-fit[\s\S]*disabled=\{!mapFitAvailable\}[\s\S]*Sblocca la mappa per adattarla/, 'Adatta resta visibile e spiega quando occorre sbloccare la mappa');
assert.match(viewportSource, /mode === 'reset'[\s\S]*width: _width, height: _height/, 'il ripristino rimuove le dimensioni calibrate della mappa');
assert.match(viewportSource, /configureSessionMapFit[\s\S]*gridSettings\.type === 'square'/, 'l’adattamento mappa e disponibile soltanto per la griglia quadrata');
assert.match(viewportSource, /width: fittedWidth[\s\S]*height: fittedHeight/, 'le dimensioni calibrate della mappa vengono salvate nella posizione condivisa');
assert.match(viewportSource, /settings\.color \?\? '#38bdf8'/, 'le griglie salvate senza colore mantengono il colore predefinito');
assert.match(workspaceSource, /session-map-grids/, 'le impostazioni griglia persistono per Capitolo');
assert.match(workspaceSource, /session-map-object-order[\s\S]*mapObjectOrder:[\s\S]*objectOrder:/, 'ordine globale persistente, pubblicato e incluso nella cronologia');
assert.match(workspaceSource, /session-map-fog[\s\S]*mapFog:[\s\S]*fog: structuredClone/, 'la nebbia persiste per Capitolo, viene pubblicata e partecipa a Undo e Redo');
assert.match(topBarSource, /data-session-fog-panel[\s\S]*Selezione veloce[\s\S]*Forbici[\s\S]*Copri tutta la mappa[\s\S]*Simula visuale giocatori/, 'la toolbar Nebbia espone gli strumenti principali');
assert.match(topBarSource, /data-session-fog-panel[\s\S]*CirclePlus[\s\S]*CircleMinus[\s\S]*Seleziona elemento/, 'Aggiungi o Togli nebbia e il primo controllo ed usa icone verdi e rosse intuitive');
assert.match(topBarSource, /fogTooltipHoveredRef[\s\S]*fogTooltipEvents[\s\S]*onPointerEnter[\s\S]*onBlur:[\s\S]*fogTooltipHoveredRef\.current !== id[\s\S]*<Tooltip open=\{fogTooltip === 'operation'\}/, 'i tooltip del menu nebbia ignorano il blur da clic mentre il puntatore resta sul trigger');
assert.match(viewportSource, /data-session-map-fog[\s\S]*<mask[\s\S]*item\.operation === 'reveal'[\s\S]*fill: 'black'/, 'la nebbia usa maschere persistenti con operazioni di copertura e rivelazione');
assert.match(viewportSource, /fog\.operation === 'cover' && fog\.enabled !== false[\s\S]*opacity=\{isOwner && !fogSettings\.previewAsPlayer \? 0\.38 : 1\}/, 'ogni forma attiva applica separatamente la propria opacita rendendo piu scure le sovrapposizioni');
assert.match(viewportSource, /beginFogTransform[\s\S]*moveFogTransform[\s\S]*finishFogTransform/, 'le forme nebbia selezionate possono essere ridimensionate e ruotate');
assert.match(viewportSource, /gesture\.handle\?\.includes\('w'\)[\s\S]*gesture\.handle\?\.includes\('e'\)[\s\S]*gesture\.handle\?\.includes\('n'\)[\s\S]*gesture\.handle\?\.includes\('s'\)/, 'il resize nebbia modifica larghezza e altezza indipendentemente');
assert.match(viewportSource, /\['n', rendered\.width \/ 2[\s\S]*\['e', rendered\.width, rendered\.height \/ 2[\s\S]*\['s', rendered\.width \/ 2[\s\S]*\['w', 0, rendered\.height \/ 2/, 'le forme nebbia hanno maniglie laterali per il resize su un solo asse');
assert.match(viewportSource, /oppositeOrigin[\s\S]*anchorWorld[\s\S]*oppositeDraft[\s\S]*draftOffset/, 'il resize delle forme nebbia ruotate mantiene fermo il lato o vertice opposto');
assert.match(viewportSource, /beginQuickFogSelection[\s\S]*moveQuickFogSelection[\s\S]*fogContainsPoint[\s\S]*finishQuickFogSelection/, 'la selezione veloce accumula continuamente le forme attraversate fino al rilascio');
assert.match(viewportSource, /aria-label="Azioni nebbia selezionata"[\s\S]*Nebbia selezionata[\s\S]*selectedFogIds\.size[\s\S]*Elimina selezionati/, 'al rilascio la selezione veloce apre un unico menu comune');
assert.match(viewportSource, /aria-label="Azioni figura nebbia"[\s\S]*Attiva nebbia[\s\S]*Blocca nebbia[\s\S]*Duplica nebbia[\s\S]*Copia nebbia[\s\S]*Modifica tracciato[\s\S]*Collegamenti magnetici[\s\S]*Elimina nebbia/, 'ogni forma nebbia espone il menu contestuale completo nell ordine richiesto');
assert.match(viewportSource, /Attiva nebbia[\s\S]*Disattiva nebbia[\s\S]*CloudFog data-static-icon[\s\S]*Slash data-static-icon/, 'attiva e disattiva nebbia usano l icona statica della nebbia con barra trasversale');
assert.match(viewportSource, /zIndex: token\.entityKind === 'pg' && mapFog\.some\(fog => fog\.operation === 'cover' && fog\.enabled !== false\) \? 9001 : objectZIndex\.get[\s\S]*data-session-map-fog className="pointer-events-none absolute inset-0 z-\[9000\]/, 'solo i token PG restano sopra il piano quando la nebbia e visibile');
assert.match(viewportSource, /Azioni figura nebbia" className="absolute z-50 w-\[min\(92vw,342px\)\][\s\S]*grid-cols-\[repeat\(7,40px\)\]/, 'il menu della figura nebbia usa lo stile comune senza spazio oltre le sette icone');
assert.match(viewportSource, /Sposta menu Nebbia[\s\S]*beginMenuDrag\(event, 'fog', fogMenu\)/, 'il menu nebbia ha la maniglia di spostamento');
assert.match(viewportSource, /fogTooltipHoveredRef[\s\S]*Tooltip open=\{fogTooltip === tooltipId\}/, 'il menu nebbia usa tooltip persistenti');
assert.match(viewportSource, /isOwner && activeTool === 'fog'[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)[\s\S]*setFogMenu\(null\)[\s\S]*return;/, 'il clic destro nebbia apre o chiude il menu elemento senza chiudere la toolbar o attivare Muovi');
assert.match(viewportSource, /fogSettings\.mode === 'grab' \|\| fogSettings\.mode === 'quick-select'[\s\S]*setFogSelectionMenu\(null\);[\s\S]*setFogMenu\(null\);/, 'iniziare una nuova figura nebbia chiude il menu contestuale precedente');
assert.match(viewportSource, /poi\.locked && <Lock[^>]*text-amber-300[\s\S]*Sposta menu PDI/, 'il menu PDI mostra il lucchetto giallo accanto alla maniglia');
assert.match(viewportSource, /drawing\.locked && <Lock[^>]*text-amber-300[\s\S]*Sposta menu figure/, 'il menu figure mostra il lucchetto giallo accanto alla maniglia');
assert.match(viewportSource, /token\.locked && <Lock[^>]*text-amber-300[\s\S]*Sposta menu token/, 'il menu token mostra il lucchetto giallo accanto alla maniglia');
assert.match(viewportSource, /fogClipboard[\s\S]*ctrlKey[\s\S]*onFogCreate[\s\S]*beginFogPathPointMove[\s\S]*moveFogPathPoint[\s\S]*finishFogPathPointMove/, 'copia e modifica tracciato delle forme nebbia sono operative');
assert.match(viewportSource, /fog\.magnetGroupId[\s\S]*mapFog\.filter\(item => item\.magnetGroupId === fog\.magnetGroupId[\s\S]*magnetGroupId: groupId/, 'i collegamenti magnetici muovono e aggiornano insieme le forme collegate');
assert.match(viewportSource, /previousFogModeRef[\s\S]*modeChanged[\s\S]*setSelectedFogIds\(new Set\(\)\)[\s\S]*setFogSelectionMenu\(null\)/, 'chiusura pannello, cambio strumento o modalita deselezionano la nebbia');
assert.match(viewportSource, /styleRevision[\s\S]*onFogsChange\?\.\(mapFog\.map\(fog => fog\.id\)[\s\S]*fogSettings\.color[\s\S]*fogSettings\.strokeWidth/, 'colore e cornice vengono applicati in tempo reale a tutta la nebbia della mappa');
assert.match(viewportSource, /fogShape\(fogDraft,[\s\S]*fill: fogDraft\.style\.color[\s\S]*stroke: fogDraft\.style\.color[\s\S]*<polygon[\s\S]*fill=\{fogSettings\.color\}[\s\S]*stroke=\{fogSettings\.color\}/, 'l anteprima di disegno usa il colore globale della nebbia per interno e cornice');
assert.match(viewportSource, /hydrateSessionMapFogStyle\(existingStyle\)/, 'lo stile nebbia viene recuperato dalle forme persistenti');
assert.match(viewportSource, /hollowgate\.map-fog-style\./, 'lo stile nebbia viene memorizzato per mappa');
assert.match(topBarSource, /w-max max-w-\[96vw\][\s\S]*Elimina tutta la nebbia[\s\S]*requestSessionMapFogClear/, 'il pannello nebbia si adatta ai controlli e termina con la cancellazione totale');
assert.match(topBarSource, /fullMapCovered \? 'Scopri tutta la mappa' : 'Copri tutta la mappa'[\s\S]*PaintRoller data-static-icon[\s\S]*Slash data-static-icon/, 'la copertura totale alterna rullo e rullo barrato con tooltip coerente');
assert.match(viewportSource, /mapFog\.filter\(fog => fog\.fullMap\)[\s\S]*onFogsDelete\(fullMapFog\.map[\s\S]*fullMap: true/, 'la copertura totale e un unico oggetto persistente alternabile senza toccare le altre forme');
assert.match(viewportSource, /!item\.fullMap && fogContainsPoint/, 'la copertura totale viene esclusa dalla ricerca dei menu contestuali');
assert.match(viewportSource, /if \(fog\.fullMap\) return null;/, 'la copertura totale non espone controlli interattivi');
assert.match(viewportSource, /outerFreehandContour[\s\S]*segmentIntersection[\s\S]*polygonArea/, 'la mano libera rimuove i cappi interni e conserva il contorno esterno');
assert.doesNotMatch(viewportSource, /fogShape\(rendered,[^\n]*strokeDasharray/, 'le cornici delle forme nebbia sono linee continue');
assert.match(viewportSource, /activeTool === 'fog'[\s\S]*setDepthHoveredKeys\(new Set\(\)\)[\s\S]*pointer-events-none/, 'lo strumento Nebbia sospende evidenziazione e interazione degli altri oggetti');
assert.match(viewportSource, /drawingContainsPoint[\s\S]*pointToSegmentDistance[\s\S]*openUnderlyingMapObjectMenu/, 'alone, menu e cancellazione delle figure condividono il rilevamento della geometria reale');
assert.match(viewportSource, /contains\(\{ x: position\.x, y: position\.y, width: size, height: size \}\)[\s\S]*contains\(\{ x: position\.x - size \/ 2, y: position\.y - size \/ 2, width: size, height: size \}\)/, 'token e PDI usano la stessa area effettivamente cliccabile per alone e menu');
assert.match(workspaceSource, /map_object_layer_action[\s\S]*createdByProfileId === actorProfileId/, 'le richieste giocatore sono validate dal GM per proprieta, blocco e fissaggio');
assert.match(viewportSource, /objectZIndex/, 'il viewport calcola gli indici globali per oggetto');
for (const family of ['drawing', 'token', 'poi']) assert.match(viewportSource, new RegExp(`${family}\\\\u0000`), `la famiglia ${family} usa lo stack globale`);
assert.match(viewportSource, /Porta sopra[\s\S]*Porta sotto[\s\S]*In primo piano[\s\S]*In fondo/, 'i menu espongono i quattro comandi globali');
assert.match(viewportSource, /panel === 'layers'/, 'i PDI raccolgono i comandi nel pannello Livelli');
assert.match(viewportSource, /drawingLayerPanelOpen[\s\S]*aria-label="Livelli"/, 'i disegni raccolgono i comandi nel pannello Livelli');
assert.match(workspaceSource, /getRotatedRectBounds[\s\S]*getRotatedSquareBounds[\s\S]*doBoundsOverlap/, 'Porta sopra e Porta sotto calcolano gli ingombri tra famiglie diverse');
assert.match(mapObjectLayersSource, /moveMapObjectBlock[\s\S]*selected\.some\(item => overlaps\(item, ref\)\)/, 'lo spostamento adiacente salta direttamente al prossimo oggetto sovrapposto');
assert.doesNotMatch(viewportSource, /event\.altKey && openUnderlyingMapObjectMenu/, 'la selezione in profondita non richiede Alt');
assert.match(viewportSource, /depthSelectionRef[\s\S]*candidates\.findIndex/, 'la selezione in profondita scorre ciclicamente gli oggetti sovrapposti');
assert.match(viewportSource, /previous\.x - clientX[\s\S]*previous\.y - clientY/, 'il ciclo in profondita usa una tolleranza stabile nelle coordinate dello schermo');
assert.match(viewportSource, /updateDepthHover[\s\S]*depthHoveredKeys\.size > 1/, 'gli oggetti sovrapposti vengono evidenziati automaticamente al passaggio del cursore');
assert.match(viewportSource, /beginDepthSelectedMove[\s\S]*depthSelectedKey[\s\S]*beginDrawingMove[\s\S]*beginTokenMove[\s\S]*beginPoiMove/, 'l oggetto evidenziato in profondita puo essere trascinato direttamente');
assert.match(viewportSource, /right-4 top-4[\s\S]*ContextHint[\s\S]*Oggetti sovrapposti:[\s\S]*Ogni click destro/, 'un suggerimento contestuale nell angolo della mappa spiega la selezione degli oggetti sovrapposti');
assert.match(viewportSource, /panel === 'layers'[\s\S]*onPoiLayerMove\?\./, 'il pannello Livelli PDI resta disponibile durante i comandi');
assert.match(viewportSource, /drawingLayerPanelOpen[\s\S]*onDrawingsLayerMove\?\./, 'il pannello Livelli disegni resta disponibile durante i comandi');
assert.match(homeSource, /setInterval\(refresh, 2000\)[\s\S]*refreshJoinedCampaigns[\s\S]*sessionActive/, 'il giocatore recupera lo stato sessione se perde il broadcast di avvio');
assert.match(sidebarSource, /isOwner \? \[\.\.\.ICONS, \.\.\.GM_ICONS\] : ICONS/, 'la rail aggiunge strumenti solo per il GM');
assert.match(sidebarSource, /label: 'Incontri'/, 'la scheda Incontri resta disponibile al GM');
assert.doesNotMatch(encounterManagerSource, /Ripubblica scena|Nascondi scena attiva|Avvia encounter/, 'la scheda Incontri non duplica i controlli operativi');
assert.match(sceneEncounterServiceSource, /!entity\.sceneId && entity\.chapterId === scene\.chapterId/, 'gli incontri ereditano i contenuti generali del capitolo');

const source = bundle.outputFiles[0].text;
const browser = await startNoteBrowser();
try {
  const result = await browser.evaluate(
    async (source, reactDomUrl) => {
      const react = await import('/@id/react');
      const h = (react.default || react).createElement;
      const dom = await import(reactDomUrl);
      const { createRoot } = dom.default || dom;
      localStorage.clear();
      const campaignId = '41000000-0000-0000-0000-000000000004';
      const chapter = (id, title, active) => ({ id, campaignId, title, description: '', notes: '', kind: 'standard', isActive: active, nextChapterIds: [], mapUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"></svg>', mapMetadata: { imageUrl: null, gridVisible: false, gridColumns: 20, gridRows: 20 }, locationMetadata: {}, createdAt: id, updatedAt: new Date().toISOString() });
      const scene = (id, chapterId, title) => ({ id, campaignId, chapterId, title, description: title + ' pubblica', notes: 'SEGRETO ' + title, status: 'ready', imageUrl: null, sortOrder: 0, nextSceneIds: [], mapRegions: [{ id: 'area-' + id, label: title, color: '#22d3ee', geometry: { kind: 'rect', rect: { x: 10, y: 10, width: 30, height: 20 } } }], contextMetadata: { timeOfDay: '', period: '', condition: '' }, createdAt: id, updatedAt: new Date().toISOString() });
      const c1 = chapter('41000000-0000-0000-0000-000000000011', 'Manicomio di Arkham', true);
      const c2 = chapter('41000000-0000-0000-0000-000000000012', 'Dunwich segreta', false);
      const s1 = scene('41000000-0000-0000-0000-000000000021', c1.id, 'Ingresso');
      const s2 = scene('41000000-0000-0000-0000-000000000022', c2.id, 'Rituale futuro');
      window.__SW = { chapters: [c1, c2], scenes: [s1, s2], privateLoads: 0, published: [], encounterChanges: [], active: { id: 'active-1', campaignId, sceneId: s1.id, chapterId: c1.id, title: s1.title, description: s1.description, chapterTitle: c1.title, mapUrl: c1.mapUrl, sceneImageUrl: null, mapMetadata: c1.mapMetadata, mapRegions: s1.mapRegions, contextMetadata: s1.contextMetadata, publishedAt: new Date().toISOString() }, ended: 0 };
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const { SessionWorkspace } = await import(moduleUrl);
      URL.revokeObjectURL(moduleUrl);
      const gmHost = document.createElement('div');
      document.body.appendChild(gmHost);
      createRoot(gmHost).render(
        h(SessionWorkspace, {
          campaignId,
          campaignName: 'Orrore ad Arkham',
          campaignLogoUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
          isOwner: true,
          onEndSession: async () => {
            window.__SW.ended += 1;
          },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      const futureButton = [...gmHost.querySelectorAll('button')].find((button) => button.textContent.includes('Rituale futuro'));
      futureButton.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const startEncounter = gmHost.querySelector('[aria-label="Avvia incontro Rituale futuro"]');
      startEncounter.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const pauseEncounter = gmHost.querySelector('[aria-label="Metti in pausa incontro Rituale futuro"]');
      pauseEncounter.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const resumeEncounter = gmHost.querySelector('[aria-label="Riprendi incontro Rituale futuro"]');
      resumeEncounter.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const stopEncounter = gmHost.querySelector('[aria-label="Termina incontro Rituale futuro"]');
      stopEncounter.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const resizer = gmHost.querySelector('[aria-label="Ridimensiona albero Capitoli e Scene"]');
      const widthBefore = getComputedStyle(gmHost.firstElementChild).gridTemplateColumns;
      resizer.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, button: 0, clientX: 280, bubbles: true }));
      resizer.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 360, bubbles: true }));
      resizer.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: 360, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const viewport = gmHost.querySelector('[data-map-viewport]');
      const mapTransform = viewport.querySelector('[data-map-transform]');
      const mapPlacement = viewport.querySelector('[data-map-placement]');
      const initialTransform = mapTransform.style.transform;
      viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -180, clientX: 300, clientY: 200, bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const zoomTransform = mapTransform.style.transform;
      const initialPlacement = mapPlacement.style.transform;
      mapPlacement.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, button: 0, clientX: 300, clientY: 200, bubbles: true }));
      viewport.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, clientX: 350, clientY: 230, bubbles: true }));
      viewport.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, clientX: 350, clientY: 230, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const movedPlacement = mapPlacement.style.transform;
      gmHost.querySelector('[aria-label="Blocca mappa"]').click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      viewport.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 10, button: 0, clientX: 300, clientY: 200, bubbles: true }));
      viewport.dispatchEvent(new PointerEvent('pointermove', { pointerId: 10, clientX: 330, clientY: 220, bubbles: true }));
      viewport.dispatchEvent(new PointerEvent('pointerup', { pointerId: 10, clientX: 330, clientY: 220, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const lockedViewTransform = mapTransform.style.transform;
      const gmText = gmHost.textContent;
      const gmLogo = !!gmHost.querySelector('img[alt=""]');
      gmHost.querySelector('[aria-label="Nascondi pannello Capitoli e Scene"]').click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const panelHidden = !gmHost.querySelector('aside') && !!gmHost.querySelector('[aria-label="Mostra pannello Capitoli e Scene"]');
      const gm = { text: gmText, rects: gmHost.querySelectorAll('svg rect').length, published: window.__SW.published.map((item) => item.title), encounterChanges: window.__SW.encounterChanges, loads: window.__SW.privateLoads, logo: gmLogo, widthBefore, widthAfter: getComputedStyle(gmHost.firstElementChild).gridTemplateColumns, initialTransform, zoomTransform, lockedViewTransform, initialPlacement, movedPlacement, panelHidden };
      const loadsBeforePlayer = window.__SW.privateLoads;
      const playerHost = document.createElement('div');
      playerHost.style.cssText = 'width:100%;height:800px';
      document.body.appendChild(playerHost);
      window.__SW.playerHost = playerHost;
      createRoot(playerHost).render(h(SessionWorkspace, { campaignId, campaignName: 'Orrore ad Arkham', isOwner: false, onEndSession: async () => {} }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { gm, playerText: playerHost.textContent, playerMapAlt: playerHost.querySelector('main img')?.alt ?? '', playerRects: [...playerHost.querySelectorAll('svg rect')].filter(rect => !rect.closest('[data-session-map-fog]')).length, playerPrivateLoads: window.__SW.privateLoads - loadsBeforePlayer, playerDefaultLogo: !!playerHost.querySelector('img[src="/icon-source-1024.png"]'), playerHasTree: !!playerHost.querySelector('aside') };
    },
    source,
    reactDomUrl,
  );

  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await browser.evaluate(() => {
    window.__SW.playerHost.style.width = '390px';
    window.__SW.playerHost.style.height = '844px';
  });
  await sleep(120);
  const mobile = await browser.evaluate(() => {
    const workspace = window.__SW.playerHost.firstElementChild;
    const main = workspace.querySelector('main').getBoundingClientRect();
    return { workspaceWidth: workspace.scrollWidth, hasAside: !!workspace.querySelector('aside'), mainHeight: main.height };
  });

  assert.match(result.gm.text, /Capitoli e Scene/);
  assert.match(result.gm.text, /Manicomio di Arkham/);
  assert.match(result.gm.text, /Dunwich segreta/);
  assert.match(result.gm.text, /Termina sessione/);
  assert.equal(result.gm.logo, true, 'portrait campagna visibile nella testata');
  assert.notEqual(result.gm.widthAfter, result.gm.widthBefore, 'divisore desktop ridimensiona albero e area mappa');
  assert.notEqual(result.gm.zoomTransform, result.gm.initialTransform, 'la rotellina modifica lo zoom della mappa');
  assert.notEqual(result.gm.movedPlacement, result.gm.initialPlacement, 'Muovi posiziona la mappa quando e sbloccata');
  assert.notEqual(result.gm.lockedViewTransform, result.gm.zoomTransform, 'Muovi sposta la vista quando la mappa e bloccata');
  assert.equal(result.gm.panelHidden, true, 'il GM puo richiudere il pannello Capitoli e Scene');
  assert.equal(result.gm.published[0], 'Manicomio di Arkham', 'la sessione pubblica inizialmente il Capitolo attivo');
  assert.ok(result.gm.published.includes('Rituale futuro'), 'il GM puo pubblicare successivamente una Scena');
  const encounterStart = result.gm.encounterChanges.indexOf('running');
  assert.deepEqual(result.gm.encounterChanges.slice(encounterStart, encounterStart + 4), ['running', 'paused', 'running', 'stopped'], 'Pausa mantiene la propria icona e alterna sospensione/ripresa');
  assert.ok(result.gm.rects >= 1, 'mappa centrale con regione');
  assert.match(result.playerMapAlt, /Manicomio di Arkham/, 'il giocatore riceve la mappa del Capitolo attivo');
  assert.doesNotMatch(result.playerText, /Ingresso/, 'all’avvio il giocatore vede il Capitolo senza una Scena selezionata');
  assert.doesNotMatch(result.playerText, /Dunwich segreta|Rituale futuro|SEGRETO/);
  assert.doesNotMatch(result.playerText, /Termina sessione/);
  assert.equal(result.playerPrivateLoads, 0, 'il giocatore non carica Capitoli e Scene private');
  assert.equal(result.playerRects, 0, 'senza Scena selezionata il giocatore non vede regioni di Scene precedenti');
  assert.equal(result.playerDefaultLogo, false, 'il giocatore non riceve la testata privata del pannello GM');
  assert.equal(result.playerHasTree, false, 'il pannello Capitoli e Scene e esclusivo del GM');
  assert.ok(mobile.workspaceWidth <= 390 && !mobile.hasAside && mobile.mainHeight > 700, 'workspace giocatore mobile dedicata interamente alla mappa');
  console.log('Session workspace browser: PASS (albero GM, ramo pubblico player, mappa centrale, pubblicazione, privacy e menu Gestione).');
} finally {
  await browser.close();
}
