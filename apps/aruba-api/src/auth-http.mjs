// HTTP boundary for future Aruba authentication; NOT enabled by index.mjs.
// Production activation requires a trusted reverse proxy, separate restricted
// DB role, and a rehearsal with disposable accounts. No server-side logging
// of credentials or raw bearer/session tokens is permitted.
import { LoginRejected } from './login-service.mjs';
import { PasswordActionRejected } from './password-reset-service.mjs';
import { SignupRejected } from './signup-service.mjs';
import { CampaignRejected } from './campaign-service.mjs';

const COOKIE = '__Host-hg_session';
const COOKIE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOGOUT_COOKIE = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
const MAX_BODY = 4096;

function response(res, status, data, cookie) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
  if (cookie) headers['set-cookie'] = cookie;
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function extractSession(req) {
  const cookies = req.headers.cookie;
  if (typeof cookies !== 'string') return null;
  const matches = cookies.split(';').map(s => s.trim()).filter(s => s.startsWith(COOKIE + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(COOKIE.length + 1);
  return COOKIE_PATTERN.test(value) ? value : null;
}

async function readJson(req) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new HttpProblem(415, 'Content-Type non supportato');
  }
  const length = Number(req.headers['content-length'] ?? 0);
  if (!Number.isSafeInteger(length) || length > MAX_BODY) {
    throw new HttpProblem(413, 'Richiesta troppo grande');
  }
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) throw new HttpProblem(413, 'Richiesta troppo grande');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch {
    throw new HttpProblem(400, 'JSON non valido');
  }
}

class HttpProblem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createAuthHttpHandler({ origin, login, getSessionUser, revokeSession, passwordReset = null, signupService = null, campaigns = null }) {
  const allowedOrigin = new URL(origin);
  if (allowedOrigin.protocol !== 'https:' || allowedOrigin.origin !== origin ||
      !allowedOrigin.hostname) throw new TypeError('HTTPS origin required');
  for (const [name, fn] of Object.entries({ login, getSessionUser, revokeSession })) {
    if (typeof fn !== 'function') throw new TypeError(name + ' required');
  }
  if (passwordReset !== null && (typeof passwordReset.request !== 'function' || typeof passwordReset.redeem !== 'function')) {
    throw new TypeError('Invalid passwordReset service');
  }
  if (signupService !== null && (typeof signupService.signup !== 'function' || typeof signupService.verify !== 'function')) {
    throw new TypeError('Invalid signupService');
  }
  if (campaigns !== null && (typeof campaigns.list !== 'function' || typeof campaigns.create !== 'function' || typeof campaigns.update !== 'function'))
    throw new TypeError('Invalid campaign service');
  return async (req, res) => {
    try {
      if (req.url === '/auth/login' && req.method === 'POST') {
        if (req.headers.origin !== origin) throw new HttpProblem(403, 'Origine non consentita');
        const { email, password } = await readJson(req);
        // This is only safe when the reverse proxy has been deliberately
        // configured to provide a verified client address to the service.
        // Never read X-Forwarded-For directly from an untrusted request.
        const result = await login({ email, password, networkSubject: req.socket.remoteAddress });
        return response(res, 200, { status: 'ok', expiresAt: result.expiresAt },
          `${COOKIE}=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
      }
      // Entire recovery feature is absent until deliberately enabled at boot.
      // Require exact Origin for both mutations, regardless of cookie state.
      if (passwordReset && req.url === '/auth/password/request' && req.method === 'POST') {
        if (req.headers.origin !== origin) throw new HttpProblem(403, 'Origine non consentita');
        const { email } = await readJson(req);
        const result = await passwordReset.request({email,networkSubject:req.socket.remoteAddress});
        return response(res, 202, result);
      }
      if (passwordReset && req.url === '/auth/password/redeem' && req.method === 'POST') {
        if (req.headers.origin !== origin) throw new HttpProblem(403, 'Origine non consentita');
        const { token, newPassword } = await readJson(req);
        const result = await passwordReset.redeem({token,newPassword});
        return response(res, 200, result);
      }
      if (signupService && req.url === '/auth/signup' && req.method === 'POST') {
        if (req.headers.origin !== origin) throw new HttpProblem(403, 'Origine non consentita');
        const {email,displayName,password} = await readJson(req);
        const result = await signupService.signup({
          email,displayName,password,networkSubject:req.socket.remoteAddress,
        });
        return response(res,202,result);
      }
      if (signupService && req.url === '/auth/verify-email' && req.method === 'POST') {
        if (req.headers.origin !== origin) throw new HttpProblem(403, 'Origine non consentita');
        const {token} = await readJson(req);
        const result = await signupService.verify({token});
        return response(res,200,result);
      }
      // Campaign authorization uses ONLY the active cookie session.
      // No owner ID, role, or Supabase token from the request body is trusted.
      if (campaigns && req.url === '/vtt/campaigns' && (req.method === 'GET' || req.method === 'POST')) {
        const token=extractSession(req);
        if (!token) return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if (!user) return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if (req.method === 'GET') return response(res,200,await campaigns.list(user.id));
        if (req.headers.origin !== origin) throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req);
        return response(res,201,await campaigns.create(user.id,body));
      }
      if(campaigns && new RegExp('^/vtt/campaigns/[0-9a-f-]{36}
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const campaignId=req.url.slice('/vtt/campaigns/'.length);
        const body=await readJson(req);
        return response(res,200,await campaigns.update(user.id,campaignId,body));
      }
      // Isolated read-only React pilot. A session is NEVER interpreted as
      // a Supabase token. Campaign data remains unavailable by design.
      if (req.url === '/vtt/bootstrap' && req.method === 'GET') {
        const token = extractSession(req);
        if (!token) return response(res, 401, {error:'Non autenticato'});
        const user = await getSessionUser(token);
        if (!user) return response(res, 401, {error:'Non autenticato'}, LOGOUT_COOKIE);
        return response(res, 200, {
          user,
          backend:'aruba-staging',
          capabilities:{
            campaigns:{read:!!campaigns,write:!!campaigns},
            characters:{read:false,write:false},
            gameSession:false,
          },
        });
      }
      if (req.url === '/auth/me' && req.method === 'GET') {
        const token = extractSession(req);
        if (!token) return response(res, 401, { error: 'Non autenticato' });
        const user = await getSessionUser(token);
        if (!user) return response(res, 401, { error: 'Non autenticato' }, LOGOUT_COOKIE);
        return response(res, 200, { user });
      }
      if (req.url === '/auth/logout' && req.method === 'POST') {
        if (req.headers.origin !== origin) throw new HttpProblem(403, 'Origine non consentita');
        const token = extractSession(req);
        if (token) await revokeSession(token);
        return response(res, 200, { status: 'ok' }, LOGOUT_COOKIE);
      }
      return response(res, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof CampaignRejected) {
        return response(res,error.status,{error:error.message});
      }
      if (error instanceof SignupRejected) {
        return response(res,error.status,{error:error.message});
      }
      if (error instanceof PasswordActionRejected) {
        return response(res, error.status, { error: error.message });
      }
      if (error instanceof LoginRejected) {
        return response(res, error.status, { error: error.message });
      }
      if (error instanceof HttpProblem) {
        return response(res, error.status, { error: error.message });
      }
      return response(res, 500, { error: 'Errore interno' });
    }
  };
}
,'i').test(req.url ?? '') && req.method==='PATCH'){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const campaignId=req.url.slice('/vtt/campaigns/'.length);
        const body=await readJson(req);
        return response(res,200,await campaigns.update(user.id,campaignId,body));
      }
      // Isolated read-only React pilot. A session is NEVER interpreted as
      // a Supabase token. Campaign data remains unavailable by design.
      if (req.url === '/vtt/bootstrap' && req.method === 'GET') {
        const token = extractSession(req);
        if (!token) return response(res, 401, {error:'Non autenticato'});
        const user = await getSessionUser(token);
        if (!user) return response(res, 401, {error:'Non autenticato'}, LOGOUT_COOKIE);
        return response(res, 200, {
          user,
          backend:'aruba-staging',
          capabilities:{
            campaigns:{read:!!campaigns,write:!!campaigns},
            characters:{read:false,write:false},
            gameSession:false,
          },
        });
      }
      if (req.url === '/auth/me' && req.method === 'GET') {
        const token = extractSession(req);
        if (!token) return response(res, 401, { error: 'Non autenticato' });
        const user = await getSessionUser(token);
        if (!user) return response(res, 401, { error: 'Non autenticato' }, LOGOUT_COOKIE);
        return response(res, 200, { user });
      }
      if (req.url === '/auth/logout' && req.method === 'POST') {
        if (req.headers.origin !== origin) throw new HttpProblem(403, 'Origine non consentita');
        const token = extractSession(req);
        if (token) await revokeSession(token);
        return response(res, 200, { status: 'ok' }, LOGOUT_COOKIE);
      }
      return response(res, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof CampaignRejected) {
        return response(res,error.status,{error:error.message});
      }
      if (error instanceof SignupRejected) {
        return response(res,error.status,{error:error.message});
      }
      if (error instanceof PasswordActionRejected) {
        return response(res, error.status, { error: error.message });
      }
      if (error instanceof LoginRejected) {
        return response(res, error.status, { error: error.message });
      }
      if (error instanceof HttpProblem) {
        return response(res, error.status, { error: error.message });
      }
      return response(res, 500, { error: 'Errore interno' });
    }
  };
}
