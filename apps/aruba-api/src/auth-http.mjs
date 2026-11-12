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

async function readJson(req,maxBody=MAX_BODY) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new HttpProblem(415, 'Content-Type non supportato');
  }
  const length = Number(req.headers['content-length'] ?? 0);
  if (!Number.isSafeInteger(length) || length > maxBody) {
    throw new HttpProblem(413, 'Richiesta troppo grande');
  }
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBody) throw new HttpProblem(413, 'Richiesta troppo grande');
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

export function createAuthHttpHandler({ origin, login, getSessionUser, revokeSession, passwordReset = null, signupService = null, campaigns = null,characters = null,entityNotes = null,campaignNotes = null,campaignFolders = null }) {
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
  if(characters!==null && (typeof characters.list!=='function'||typeof characters.create!=='function'||typeof characters.save!=='function'||typeof characters.archive!=='function'||!campaigns))
    throw new TypeError('Invalid character service');
  if(entityNotes!==null && (!characters ||
   ['list','create','save','archive'].some(k=>typeof entityNotes[k]!=='function')))
    throw new TypeError('Invalid entity notes service');
  if(campaignNotes!==null && (!campaigns ||
   ['listForMember','create','save','archive'].some(key=>typeof campaignNotes[key]!=='function')))
    throw new TypeError('Invalid campaign notes service');
  if(campaignFolders!==null && (!campaignNotes ||
   ['list','create','update'].some(key=>typeof campaignFolders[key]!=='function')))
    throw new TypeError('Invalid campaign folders service');
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
      if(campaigns && req.url?.startsWith('/vtt/campaigns/') && req.url.length === '/vtt/campaigns/'.length + 36 && req.method==='PATCH'){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const campaignId=req.url.slice('/vtt/campaigns/'.length);
        const body=await readJson(req);
        return response(res,200,await campaigns.update(user.id,campaignId,body));
      }
      if(characters && req.url?.startsWith('/vtt/characters?') && req.method==='GET'){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const url=new URL(req.url,origin);
        if([...url.searchParams.keys()].some(key=>key!=='campaignId')||url.searchParams.getAll('campaignId').length!==1)
          throw new HttpProblem(400,'Query non valida');
        return response(res,200,await characters.list(user.id,url.searchParams.get('campaignId')));
      }
      if(characters && req.url==='/vtt/characters' && req.method==='POST'){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req);
        if(typeof body.campaignId!=='string'||Object.keys(body).sort().join(',')!=='campaignId,name')
          throw new HttpProblem(400,'Dati personaggio non validi');
        return response(res,201,await characters.create(user.id,body.campaignId,{name:body.name}));
      }
      if(characters && req.url?.startsWith('/vtt/characters/') && req.method==='PUT'){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const characterId=req.url.slice('/vtt/characters/'.length);
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(characterId))
          throw new HttpProblem(400,'Personaggio non valido');
        const body=await readJson(req,65536);
        return response(res,200,await characters.save(user.id,body.campaignId,characterId,body));
      }
      if(characters && req.url?.startsWith('/vtt/characters/') && req.method==='DELETE'){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const characterId=req.url.slice('/vtt/characters/'.length);
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(characterId))
          throw new HttpProblem(400,'Personaggio non valido');
        const body=await readJson(req);
        if(typeof body.campaignId!=='string'||Object.keys(body).length!==1)
          throw new HttpProblem(400,'Dati cancellazione non validi');
        return response(res,200,await characters.archive(user.id,body.campaignId,characterId));
      }
      // Original character custom tabs: isolated staging-only notes.
      // Exact URL patterns; query cannot smuggle owner or role.
      if(entityNotes && req.url?.startsWith('/vtt/entity-notes') &&
       ['GET','POST','PATCH','DELETE'].includes(req.method)){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method!=='GET' && req.headers.origin!==origin)
          throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='GET'){
          const url=new URL(req.url,origin);
          if(url.pathname!=='/vtt/entity-notes'||
            !['campaignId,characterId','campaignId,characterId,parentId'].includes([...url.searchParams.keys()].sort().join(','))||
            url.searchParams.getAll('campaignId').length!==1||
            url.searchParams.getAll('characterId').length!==1||
            url.searchParams.getAll('parentId').length>1)
            throw new HttpProblem(400,'Query note non valida');
          const campaignId=url.searchParams.get('campaignId');
          const characterId=url.searchParams.get('characterId');
          const parentId=url.searchParams.get('parentId');
          return response(res,200,parentId===null?
            await entityNotes.list(user.id,campaignId,characterId):
            await entityNotes.list(user.id,campaignId,characterId,parentId));
        }
        const body=await readJson(req,65536);
        if(typeof body.campaignId!=='string'||typeof body.characterId!=='string')
          throw new HttpProblem(400,'Identità nota non valida');
        if(req.method==='POST'){
          if(req.url!=='/vtt/entity-notes'||
             !['campaignId,characterId,tabName','campaignId,characterId,parentId,tabName']
              .includes(Object.keys(body).sort().join(',')))
            throw new HttpProblem(400,'Dati creazione nota non validi');
          return response(res,201,await entityNotes.create(user.id,
            body.campaignId,body.characterId,
            body.parentId===undefined?{tabName:body.tabName}:{tabName:body.tabName,parentId:body.parentId}));
        }
        if(req.method==='PATCH' && req.url?.startsWith('/vtt/entity-notes/order/')){
          const parentId=req.url.slice('/vtt/entity-notes/order/'.length);
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId))
            throw new HttpProblem(400,'Nota padre non valida');
          if(Object.keys(body).sort().join(',')!=='campaignId,characterId,tabOrder')
            throw new HttpProblem(400,'Ordine sottoschede non valido');
          if(typeof entityNotes.setSubtabOrder!=='function')throw new HttpProblem(503,'Sottoschede non disponibili');
          return response(res,200,await entityNotes.setSubtabOrder(user.id,
            body.campaignId,body.characterId,parentId,body.tabOrder));
        }
        const noteId=req.url?.startsWith('/vtt/entity-notes/')?
          req.url.slice('/vtt/entity-notes/'.length):'';
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noteId))
          throw new HttpProblem(400,'Nota non valida');
        if(req.method==='PATCH'){
          if(Object.keys(body).sort().join(',')!=='campaignId,characterId,content,contentRich,hidden,position,tabName,visibility')
            throw new HttpProblem(400,'Dati aggiornamento nota non validi');
          const {campaignId,characterId,...changes}=body;
          return response(res,200,await entityNotes.save(user.id,campaignId,characterId,noteId,changes));
        }
        if(Object.keys(body).sort().join(',')!=='campaignId,characterId')
          throw new HttpProblem(400,'Dati archivio nota non validi');
        return response(res,200,await entityNotes.archive(user.id,body.campaignId,body.characterId,noteId));
      }
      // Campaign Notes are a distinct model from character custom tabs.
      // Explicit staging-only opt-in. Ownership is derived only from the cookie.
      if(campaignNotes && ['GET','POST','PATCH','DELETE'].includes(req.method) &&
        (req.url?.startsWith('/vtt/campaign-notes?')||
         req.url==='/vtt/campaign-notes'||req.url?.startsWith('/vtt/campaign-notes/'))){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET'){
          const url=new URL(req.url,origin);
          if(url.pathname!=='/vtt/campaign-notes'||
             !['campaignId','campaignId,parentId'].includes([...url.searchParams.keys()].sort().join(','))||
             url.searchParams.getAll('campaignId').length!==1||
             url.searchParams.getAll('parentId').length>1)
            throw new HttpProblem(400,'Query Note non valida');
          return response(res,200,await campaignNotes.listForMember(user.id,
            url.searchParams.get('campaignId'),url.searchParams.get('parentId')));
        }
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req,65536);
        if(req.method==='POST'){
          if(req.url!=='/vtt/campaign-notes'||
             Object.keys(body).sort().join(',')!=='campaignId,parentId,title')
            throw new HttpProblem(400,'Creazione nota non valida');
          return response(res,201,await campaignNotes.create(user.id,body.campaignId,
            {title:body.title,parentId:body.parentId}));
        }
        const noteId=req.url?.startsWith('/vtt/campaign-notes/')?
          req.url.slice('/vtt/campaign-notes/'.length):'';
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noteId))
          throw new HttpProblem(400,'Nota non valida');
        if(req.method==='PATCH'){
          if(Object.keys(body).sort().join(',')!=='campaignId,contentRich,position,title,visibility')
            throw new HttpProblem(400,'Aggiornamento nota non valido');
          return response(res,200,await campaignNotes.save(user.id,body.campaignId,noteId,
            {title:body.title,contentRich:body.contentRich,
             position:body.position,visibility:body.visibility}));
        }
        if(Object.keys(body).sort().join(',')!=='campaignId')
          throw new HttpProblem(400,'Archiviazione nota non valida');
        return response(res,200,await campaignNotes.archive(user.id,body.campaignId,noteId));
      }
      // Campaign folder operations: authenticated session, isolated from PG tabs.
      // No client-provided role/owner/scope escalation. Explicit staging-only service.
      if(campaignFolders && ['GET','POST','PATCH'].includes(req.method) &&
       (req.url==='/vtt/campaign-note-folders'||
        req.url?.startsWith('/vtt/campaign-note-folders?')||
        req.url?.startsWith('/vtt/campaign-note-folders/'))){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET'){
          const url=new URL(req.url,origin);
          if(url.pathname!=='/vtt/campaign-note-folders'||
           [...url.searchParams.keys()].sort().join(',')!=='campaignId,scope'||
           url.searchParams.getAll('campaignId').length!==1||
           url.searchParams.getAll('scope').length!==1)
            throw new HttpProblem(400,'Query cartelle non valida');
          return response(res,200,await campaignFolders.list(user.id,
           url.searchParams.get('campaignId'),url.searchParams.get('scope')));
        }
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req);
        if(req.method==='POST'){
          if(req.url!=='/vtt/campaign-note-folders'||
           Object.keys(body).sort().join(',')!=='campaignId,name,parentId,scope')
            throw new HttpProblem(400,'Creazione cartella non valida');
          return response(res,201,await campaignFolders.create(user.id,body));
        }
        const folderId=req.url?.startsWith('/vtt/campaign-note-folders/')?
          req.url.slice('/vtt/campaign-note-folders/'.length):'';
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folderId))
          throw new HttpProblem(400,'Cartella non valida');
        if(Object.keys(body).sort().join(',')!=='campaignId,name,parentId')
          throw new HttpProblem(400,'Aggiornamento cartella non valido');
        return response(res,200,await campaignFolders.update(user.id,folderId,body));
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
            characters:{read:!!characters,write:!!characters},
            entityNotes:{read:!!entityNotes,write:!!entityNotes},
            campaignNotes:{read:!!campaignNotes,write:!!campaignNotes},
            campaignNoteFolders:{read:!!campaignFolders,write:!!campaignFolders},
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
