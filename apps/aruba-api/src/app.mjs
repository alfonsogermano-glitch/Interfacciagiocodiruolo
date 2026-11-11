import { createServer } from 'node:http';

function respond(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

export function createApp({ checkDatabase }) {
  if (typeof checkDatabase !== 'function') throw new TypeError('checkDatabase required');
  return createServer(async (req, res) => {
    if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
    if (req.url === '/health') return respond(res, 200, { service: 'hollowgate-api', status: 'ok' });
    if (req.url === '/ready') {
      try {
        await checkDatabase();
        return respond(res, 200, { service: 'hollowgate-api', database: 'ready' });
      } catch {
        return respond(res, 503, { service: 'hollowgate-api', database: 'unavailable' });
      }
    }
    return respond(res, 404, { error: 'Not found' });
  });
}
