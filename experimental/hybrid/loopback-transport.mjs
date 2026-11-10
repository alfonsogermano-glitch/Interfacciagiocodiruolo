import { createServer } from 'node:http';

/**
 * Local-loopback transport for one GM Host. No user-facing network exposure:
 * Hub/relay, HTTPS, real identity authentication and invite exchange are NOT
 * implemented. All capabilities originate from local test setup only.
 */
export function createLoopbackTransport(host) {
  const subscribers = new Set();
  const server = createServer(async (req, res) => {
    // Node's HTTP server binds 127.0.0.1 only, but check Host too.
    const hostname = req.headers.host ?? '';
    if (!/^127\.0\.0\.1(?::\d+)?$/.test(hostname)) {
      res.writeHead(403); res.end(); return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const token = /^Bearer ([-_A-Za-z0-9]{20,})$/.exec(req.headers.authorization ?? '')?.[1];
    const campaignId = url.searchParams.get('campaignId') ?? '';
    if (!token || !campaignId || url.searchParams.size !== 1) {
      sendJson(res, 401, { error: 'Unauthorized' }); return;
    }
    let access;
    try { access = host.require(token, campaignId); }
    catch { sendJson(res, 403, { error: 'Forbidden' }); return; }
    const path = url.pathname;
    try {
      if (req.method === 'GET' && path === '/v1/snapshot') {
        sendJson(res, 200, host.snapshot(token, campaignId));
      } else if (req.method === 'GET' && path === '/v1/replay') {
        const cursor = Number(req.headers['x-after-sequence']);
        if (!req.headers['x-after-sequence'] || !Number.isSafeInteger(cursor)) throw new Error('Invalid replay cursor');
        sendJson(res, 200, host.replay(token, campaignId, cursor));
      } else if (req.method === 'GET' && path === '/v1/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          'x-content-type-options': 'nosniff',
        });
        res.write(': connected\n\n');
        const unbind = host.subscribe(token, campaignId, event => {
          if (res.destroyed) return;
          res.write('data: ' + JSON.stringify(event) + '\n\n');
        });
        const clean = () => { subscribers.delete(clean); unbind(); };
        subscribers.add(clean);
        req.on('close', clean);
        res.on('close', clean);
      } else if (req.method === 'POST' && path === '/v1/command') {
        const contentType = req.headers['content-type'] ?? '';
        if (!/^application\/json(?:;|$)/i.test(contentType)) {
          sendJson(res, 415, { error: 'JSON required' }); return;
        }
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) { sendJson(res, 413, { error: 'Payload too large' }); return; }
        }
        const command = JSON.parse(body);
        sendJson(res, 200, host.command(token, campaignId, command));
      } else {
        sendJson(res, 404, { error: 'Unknown endpoint' });
      }
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });
  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      return 'http://127.0.0.1:' + address.port;
    },
    async close() {
      for (const stop of subscribers) stop();
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    },
  };
}
function sendJson(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options':'nosniff' });
  res.end(JSON.stringify(data));
}
