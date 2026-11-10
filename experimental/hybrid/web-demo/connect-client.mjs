/**
 * Browser/Node signaling client. It transfers only WebRTC offers/answers,
 * never gameplay content. Capability tokens remain in memory.
 *
 * HTTPS is mandatory outside the localhost test environment.
 */
export function validateHubEndpoint(value) {
  if (typeof value !== 'string' || value.length > 300) throw Error('Invalid Hub URL');
  let parsed;
  try { parsed = new URL(value); } catch { throw Error('Invalid Hub URL'); }
  const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))) {
    throw Error('Hub requires HTTPS');
  }
  return parsed.href.replace(/\/$/, '').replace(/\/v1$/, '');
}

export function createConnectClient({ endpoint, fetchFn = fetch, intervalMs = 750 } = {}) {
  const base = validateHubEndpoint(endpoint);
  let session = null, after = 0, polling = false;
  const request = async (path, payload, token = session?.token) => {
    const resp = await fetchFn(base + '/v1/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(payload),
    });
    const body = await resp.json();
    if (!resp.ok) throw Error(body.error || 'Hollowgate Connect error: ' + resp.status);
    return body;
  };
  async function createRoom() {
    if (session) throw Error('Session already exists');
    session = await request('create', {}, null);
    return { room: session.room, peerId: session.peerId };
  }
  async function joinRoom(room) {
    if (session) throw Error('Session already exists');
    session = await request('join', {room: String(room).trim().toUpperCase()}, null);
    return {room: session.room, peerId: session.peerId};
  }
  async function send(to, kind, description) {
    if (!session) throw Error('No session');
    if (!['offer', 'answer', 'candidate'].includes(kind)) throw Error('Invalid signaling kind');
    return request('send', {room:session.room,to,kind,description});
  }
  async function poll() {
    if (!session) throw Error('No session');
    const result = await request('poll', {room:session.room,after});
    // Cursor advances based on received messages only; messages for other
    // peers must not cause the host to skip its own subsequent messages.
    for (const item of result.messages) after = Math.max(after,item.id);
    return result.messages;
  }
  async function listen(onMessage, onError = () => {}) {
    if (polling) throw Error('Already listening');
    if (!session) throw Error('No session');
    polling=true;
    while (polling) {
      try {
        const messages = await poll();
        for (const item of messages) await onMessage(item);
      } catch(error) {
        if(polling) onError(error);
      }
      if(polling)await new Promise(resolve=>setTimeout(resolve,intervalMs));
    }
  }
  async function leave() {
    polling=false;
    if (!session) return;
    const old=session;session=null;after=0;
    await request('leave',{room:old.room},old.token).catch(()=>{});
  }
  return {
    createRoom, joinRoom, send, poll, listen, leave,
    get active(){return !!session},
    get room(){return session?.room ?? null},
    get peerId(){return session?.peerId ?? null},
  };
}
