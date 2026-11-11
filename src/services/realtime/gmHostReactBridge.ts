// Opt-in bridge for the actual Hollowgate React application.
// Never silently swaps a real campaign's Supabase/local transport for the demo protocol.
export type GmHostRole = 'gm' | 'player';
export type GmHostScene = { sceneId: string; title: string; gmNotes?: string } | null;
export type GmHostToken = { tokenId: string; owner: string; x: number; y: number };
export type GmHostState = { scene: GmHostScene; tokens: GmHostToken[] };
export type GmHostStatus = 'idle' | 'connecting' | 'authenticating' | 'connected' | 'disconnected' | 'error';
export type GmHostFrame = Record<string, unknown>;
type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(name: string, listener: (event: any) => void): void;
  removeEventListener(name: string, listener: (event: any) => void): void;
};
type Listener = (state: { status: GmHostStatus; sequence: number; scene: GmHostScene; tokens: GmHostToken[]; error: string | null }) => void;
type SocketFactory = (url: string) => SocketLike;
type Options = { role: GmHostRole; token: string; origin: string; createSocket?: SocketFactory; actorName?: string };
const VERSION = 1;
const CAMPAIGN = 'demo';
const validSeq = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const validScene = (s: unknown): s is GmHostScene =>
  s === null || (!!s && typeof s === 'object' && typeof (s as any).sceneId === 'string' && typeof (s as any).title === 'string');
const validToken = (t: unknown): t is GmHostToken =>
  !!t && typeof t === 'object' && typeof (t as any).tokenId === 'string' &&
  typeof (t as any).owner === 'string' && Number.isFinite((t as any).x) && Number.isFinite((t as any).y);
const snapshotCopy = (state: GmHostState): GmHostState => ({
  scene: state.scene ? { ...state.scene } : null, tokens: state.tokens.map(t => ({ ...t })),
});
export function createGmHostReactBridge(options: Options) {
  const url = new URL(options.origin);
  // Only the origin hosting the client is allowed; callers must not pass credentials in URLs.
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash ||
      url.username || url.password || !options.token || !['gm', 'player'].includes(options.role)) {
    throw new Error('Configurazione GM Host non valida');
  }
  const wsUrl = new URL('/ws', url);
  wsUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const factory: SocketFactory = options.createSocket ?? ((uri) => new WebSocket(uri) as unknown as SocketLike);
  const listeners = new Set<Listener>();
  let socket: SocketLike | null = null;
  let status: GmHostStatus = 'idle';
  let sequence = -1;
  let state: GmHostState = { scene: null, tokens: [] };
  let error: string | null = null;
  let authenticated = false;
  let disposed = false;
  const current = () => ({ status, sequence, ...snapshotCopy(state), error });
  const publish = () => { const next = current(); for (const cb of listeners) cb(next); };
  const change = (next: GmHostStatus, message: string | null = null) => { status = next; error = message; publish(); };
  const send = (frame: GmHostFrame) => {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify(frame)); return true;
  };
  const resync = () => send({ type: 'vtt:resync', version: VERSION, campaignId: CAMPAIGN, lastSequence: Math.max(0, sequence) });
  const accept = (frame: GmHostFrame) => {
    if (frame.type === 'joined') { authenticated = true; change('connected'); return; }
    if (frame.type === 'error') { change('error', String(frame.text ?? 'Autenticazione non valida')); return; }
    if (!authenticated || frame.version !== VERSION || frame.campaignId !== CAMPAIGN) return;
    if (frame.type === 'vtt:error') { change('error', String(frame.code ?? 'Errore protocollo')); return; }
    if (frame.type === 'vtt:snapshot') {
      const next = frame.state as Partial<GmHostState> | undefined;
      if (!validSeq(frame.sequence) || !next || !validScene(next.scene) ||
          !Array.isArray(next.tokens) || !next.tokens.every(validToken) || frame.sequence < sequence) return;
      sequence = frame.sequence;
      state = snapshotCopy(next as GmHostState);
      publish();
      return;
    }
    if (frame.type !== 'vtt:patch' || !validSeq(frame.sequence)) return;
    if (frame.sequence <= sequence) return;
    if (sequence === -1 || frame.sequence !== sequence + 1) { resync(); return; }
    const delta = frame.changes as { scene?: unknown; token?: unknown } | undefined;
    if (!delta || (delta.scene !== undefined && !validScene(delta.scene)) ||
        (delta.token !== undefined && !validToken(delta.token))) { resync(); return; }
    const next = snapshotCopy(state);
    if (delta.scene !== undefined) next.scene = delta.scene as GmHostScene;
    if (delta.token !== undefined) {
      const t = delta.token as GmHostToken;
      const idx = next.tokens.findIndex(v => v.tokenId === t.tokenId);
      if (idx >= 0) next.tokens[idx] = { ...t };
      else next.tokens.push({ ...t });
    }
    state = next; sequence = frame.sequence; publish();
  };
  const connect = () => {
    if (disposed || socket && socket.readyState <= 1) return;
    authenticated = false; sequence = -1;
    change('connecting');
    const ws = factory(wsUrl.href);
    socket = ws;
    ws.addEventListener('open', () => {
      if (disposed || socket !== ws) return;
      change('authenticating');
      send({ type: 'hello', role: options.role, token: options.token, name: options.actorName ?? 'Giocatore' });
    });
    ws.addEventListener('message', (event: { data: string }) => {
      if (disposed || socket !== ws) return;
      try { const parsed = JSON.parse(String(event.data)); if (parsed && typeof parsed === 'object') accept(parsed); }
      catch { change('error', 'Messaggio WebSocket non valido'); }
    });
    ws.addEventListener('close', () => {
      if (disposed || socket !== ws) return;
      authenticated = false; socket = null; change('disconnected');
    });
    ws.addEventListener('error', () => {
      if (disposed || socket !== ws) return;
      change('error', 'Connessione WebSocket non disponibile');
    });
  };
  return {
    connect,
    subscribe(listener: Listener) { listeners.add(listener); listener(current()); return () => { listeners.delete(listener); }; },
    getSnapshot: current,
    command(command: 'publishScene' | 'assignToken' | 'moveToken', payload: Record<string, unknown>, eventId: string) {
      if (!authenticated || !/^[a-zA-Z0-9_-]{1,72}$/.test(eventId)) return false;
      return send({ type: 'vtt:command', version: VERSION, campaignId: CAMPAIGN, eventId, command, payload });
    },
    requestResync: resync,
    dispose() { disposed = true; authenticated = false; listeners.clear(); socket?.close(); socket = null; },
  };
}
