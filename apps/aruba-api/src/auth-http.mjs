// HTTP boundary for future Aruba authentication; NOT enabled by index.mjs.
// Production activation requires a trusted reverse proxy, separate restricted
// DB role, and a rehearsal with disposable accounts. No server-side logging
// of credentials or raw bearer/session tokens is permitted.
import { LoginRejected } from './login-service.mjs';
import { PasswordActionRejected } from './password-reset-service.mjs';
import { SignupRejected } from './signup-service.mjs';
import { CampaignRejected } from './campaign-service.mjs';
import { ChapterRejected } from './chapter-contract.mjs';
import { NarrativeContentRejected } from './narrative-content-contract.mjs';
import { EquipmentCatalogRejected } from './equipment-catalog-contract.mjs';
import { CampaignDocumentRejected } from './campaign-document-contract.mjs';
import { VisualAssetRejected } from './visual-asset-contract.mjs';
import { CatalogRejected } from './unassigned-catalog-contract.mjs';

const COOKIE = '__Host-hg_session';
const COOKIE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOGOUT_COOKIE = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
const OAUTH_COOKIE='__Host-hg_oauth';
const CLEAR_OAUTH=`${OAUTH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const MAX_BODY = 4096;
const MAX_NOTE_BODY = 1100000;

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

function binaryResponse(res, status, mimeType, bytes) {
  const headers = {
    'content-type': mimeType,
    'content-length': String(bytes.length),
    'cache-control': 'private, max-age=300',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
  res.writeHead(status, headers);
  res.end(Buffer.from(bytes));
}

function extractSession(req) {
  const cookies = req.headers.cookie;
  if (typeof cookies !== 'string') return null;
  const matches = cookies.split(';').map(s => s.trim()).filter(s => s.startsWith(COOKIE + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(COOKIE.length + 1);
  return COOKIE_PATTERN.test(value) ? value : null;
}

function extractOAuthBrowser(req){
  const cookies=req.headers.cookie;
  if(typeof cookies!=='string')return null;
  const matches=cookies.split(';').map(s=>s.trim()).filter(s=>s.startsWith(OAUTH_COOKIE+'='));
  if(matches.length!==1)return null;
  const value=matches[0].slice(OAUTH_COOKIE.length+1);
  return COOKIE_PATTERN.test(value)?value:null;
}

function oauthRedirect(res,location,cookies){
  res.writeHead(303,{'location':location,'set-cookie':cookies,'cache-control':'no-store',
    'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; frame-ancestors 'none'"});
  res.end();
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

export function createAuthHttpHandler({ origin, login, getSessionUser, revokeSession, oauth = null, passwordReset = null, signupService = null, campaigns = null,campaignInvites = null,chapters = null,scenes = null,narrativeContent = null,unassignedCatalog = null,unassignedCatalogNotes = null,equipmentCatalog = null,campaignDocuments = null,campaignChat = null,diceFormulas = null,visualAssets = null,characters = null,entityNotes = null,narrativeEntityNotes = null,campaignNotes = null,campaignFolders = null,notesPanelEnabled = false,campaignRoster = null,characterAvailability = null,characterAssignments = null,playerCharacters = null,characterClaims = null,characterPortraits = null, logicalCharacters = null, turnCredentials = null, gameSessionBootstrap = null }) {
  if(typeof notesPanelEnabled!=='boolean'||(notesPanelEnabled&&(!campaignNotes||!campaignFolders)))
    throw new TypeError('Original Notes panel requires both authenticated Notes and folders');
  const allowedOrigin = new URL(origin);
  if (allowedOrigin.protocol !== 'https:' || allowedOrigin.origin !== origin ||
      !allowedOrigin.hostname) throw new TypeError('HTTPS origin required');
  for (const [name, fn] of Object.entries({ login, getSessionUser, revokeSession })) {
    if (typeof fn !== 'function') throw new TypeError(name + ' required');
  }
  if(turnCredentials!==null&&typeof turnCredentials.issue!=='function')
    throw new TypeError('Invalid TURN credential service');
  if (passwordReset !== null && (typeof passwordReset.request !== 'function' || typeof passwordReset.redeem !== 'function')) {
    throw new TypeError('Invalid passwordReset service');
  }
  if (signupService !== null && (typeof signupService.signup !== 'function' || typeof signupService.verify !== 'function')) {
    throw new TypeError('Invalid signupService');
  }
  if(oauth!==null&&(!oauth.start||!oauth.finish))throw new TypeError('Invalid OAuth service');
  if (campaigns !== null && (typeof campaigns.list !== 'function' || typeof campaigns.create !== 'function' || typeof campaigns.update !== 'function'))
    throw new TypeError('Invalid campaign service');
  if(campaignInvites!==null&&(!campaigns||['rotate','preview','join'].some(key=>typeof campaignInvites[key]!=='function')))
    throw new TypeError('Campaign invites require campaigns and a valid invite service');
  if(chapters!==null&&(!campaigns||['list','save','remove'].some(k=>typeof chapters[k]!=='function')))
    throw new TypeError('Chapter endpoints require campaigns and a valid chapter service');
  if(scenes!==null&&(!chapters||['list','save','remove'].some(k=>typeof scenes[k]!=='function')))
    throw new TypeError('Scene endpoints require chapters and a valid scene service');
  if(narrativeContent!==null&&(!scenes||['list','save','remove'].some(k=>typeof narrativeContent[k]!=='function')))
    throw new TypeError('Narrative content endpoints require scenes and a valid service');
  if(unassignedCatalog!==null&&['list','read','create','save','saveMedia','readMedia'].some(k=>typeof unassignedCatalog[k]!=='function'))
    throw new TypeError('Invalid unassigned catalog service');
  if(unassignedCatalogNotes!==null&&(!unassignedCatalog||['list','create','save','archive','reorder'].some(k=>typeof unassignedCatalogNotes[k]!=='function')))
    throw new TypeError('Catalog notes require unassigned catalog and a valid notes service');
  if(campaignChat!==null&&(!campaigns||['list','send','remove','clear','react','participants','privateList','privateSend','privateRemove','privateClear','saveAttachment','readAttachment','removeAttachment'].some(k=>typeof campaignChat[k]!=='function')))
    throw new TypeError('Campaign chat endpoints require campaigns and a valid service');
  if(diceFormulas!==null&&(!campaigns||['list','create','update','remove','reorder'].some(k=>typeof diceFormulas[k]!=='function')))
    throw new TypeError('Dice formula endpoints require campaigns and a valid service');
  if(characterPortraits!==null&&(!characters||typeof characterPortraits.save!=='function'||typeof characterPortraits.read!=='function'||typeof characterPortraits.readSource!=='function'||typeof characterPortraits.saveSource!=='function'))
    throw new TypeError('Portrait service requires characters');
  if(characterAvailability!==null&&(!characters||
      typeof characterAvailability.list!=='function'||typeof characterAvailability.set!=='function'))
    throw new TypeError('Invalid character availability service');
  if(playerCharacters!==null&&(!characterAssignments||(typeof playerCharacters.list!=='function'||typeof playerCharacters.listCampaigns!=='function')))
    throw new TypeError('Player character reads require assignments');
  if(characterAssignments!==null&&(!characters||!campaignRoster||!characterAvailability||
      typeof characterAssignments.list!=='function'||typeof characterAssignments.set!=='function'))
    throw new TypeError('Character assignments require characters, roster and availability');
  if(characterClaims!==null&&(!playerCharacters||!characterAssignments||typeof characterClaims.list!=='function'||typeof characterClaims.current!=='function'||typeof characterClaims.owned!=='function'||
      typeof characterClaims.claim!=='function'||typeof characterClaims.release!=='function'||typeof characterClaims.save!=='function'))
    throw new TypeError('Character claims require player reads and assignments');
  if(logicalCharacters!==null&&(!characters||typeof logicalCharacters.list!=='function'||typeof logicalCharacters.assign!=='function'))
    throw new TypeError('Logical character lifecycle requires characters and a valid service');
  if(campaignRoster!==null&&(!campaigns||typeof campaignRoster.list!=='function'))
    throw new TypeError('Invalid campaign roster service');
  if(characters!==null && (typeof characters.list!=='function'||typeof characters.create!=='function'||typeof characters.save!=='function'||typeof characters.archive!=='function'||!campaigns))
    throw new TypeError('Invalid character service');
  if(entityNotes!==null && (!characters ||
    ['list','create','save','archive'].some(k=>typeof entityNotes[k]!=='function')))
    throw new TypeError('Invalid entity notes service');
  if(narrativeEntityNotes!==null && (!narrativeContent ||
    ['list','create','save','archive','setSubtabOrder'].some(k=>typeof narrativeEntityNotes[k]!=='function')))
    throw new TypeError('Invalid narrative entity notes service');
  if(campaignNotes!==null && (!campaigns ||
   ['listForMember','create','save','archive'].some(key=>typeof campaignNotes[key]!=='function')))
    throw new TypeError('Invalid campaign notes service');
  if(campaignFolders!==null && (!campaignNotes ||
   ['list','create','update','presentation','archive'].some(key=>typeof campaignFolders[key]!=='function')))
    throw new TypeError('Invalid campaign folders service');
  return async (req, res) => {
    try {
      if(req.url==='/auth/oauth/complete'&&req.method==='GET'){
        // A same-origin document navigation makes the Strict session cookie
        // available to the VTT after the cross-site provider redirect. Never
        // put the authorization code or session token in this URL or page.
        res.writeHead(200,{'content-type':'text/html; charset=utf-8',
          'cache-control':'no-store','referrer-policy':'no-referrer',
          'x-content-type-options':'nosniff',
          'content-security-policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
        return res.end('<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=/vtt/"><title>Hollowgate</title></head><body><a href="/vtt/">Entra in Hollowgate</a></body></html>');
      }
      if(req.url==='/auth/oauth/providers'&&req.method==='GET')
        return response(res,200,{providers:oauth?['google','discord']:[]});
      if(oauth&&['GET','POST'].includes(req.method)&&typeof req.url==='string'&&req.url.length<=4096){
        const match=/^\/auth\/oauth\/(google|discord)\/(start|callback)(?:\?|$)/.exec(req.url);
        if(match){
          const [,provider,action]=match;
          const url=new URL(req.url,origin);
          if(action==='start'){
            if([...url.searchParams.keys()].some(key=>key!=='link')||
              url.searchParams.getAll('link').length>1||
              (url.searchParams.has('link')&&url.searchParams.get('link')!=='1'))
              return response(res,400,{error:'Richiesta OAuth non valida'});
            const link=url.searchParams.get('link')==='1';
            if(link?(req.method!=='POST'||req.headers.origin!==origin):req.method!=='GET')
              return response(res,405,{error:'Metodo OAuth non consentito'});
            if(link&&!extractSession(req))return response(res,401,{error:'Non autenticato'});
            const result=await oauth.start({provider,networkSubject:req.socket.remoteAddress,
              linkSession:link?extractSession(req):null,requireLink:link});
            const cookie=`${OAUTH_COOKIE}=${result.browser}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
            return link?response(res,200,{url:result.url},cookie):oauthRedirect(res,result.url,cookie);
          }
          if(req.method!=='GET')return response(res,405,{error:'Metodo OAuth non consentito'});
          try{
            // Google may append these informational fields to a successful
            // authorization-code redirect. Never use them for identity or state.
            const allowed=provider==='google'
              ?['code','state','iss','error','scope','authuser','prompt']
              :['code','state','iss','error'];
            if([...url.searchParams.keys()].some(key=>!allowed.includes(key))||
              allowed.some(key=>url.searchParams.getAll(key).length>1)||
              url.searchParams.has('error'))throw new Error('OAuth callback rejected');
            const result=await oauth.finish({provider,state:url.searchParams.get('state'),
              code:url.searchParams.get('code'),issuer:url.searchParams.get('iss'),
              browser:extractOAuthBrowser(req)});
            return oauthRedirect(res,'/auth/oauth/complete',[CLEAR_OAUTH,
              `${COOKIE}=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`]);
          }catch{return oauthRedirect(res,'/login?oauth=failed',CLEAR_OAUTH);}
        }
      }
      // Staging-only, authenticated and same-origin. No persistent TURN secret
      // or browser-supplied identity is accepted. Do not cache credentials.
      if(turnCredentials&&req.url==='/vtt/ice-credentials'&&req.method==='POST'){
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const sessionToken=extractSession(req);
        if(!sessionToken)return response(res,401,{error:'Non autenticato'});
        const body=await readJson(req);
        if(Object.keys(body).sort().join(',')!=='campaignId,role')
          throw new HttpProblem(400,'Richiesta TURN non valida');
        return response(res,200,await turnCredentials.issue({
          sessionToken,campaignId:body.campaignId,connectionRole:body.role,
        }));
      }
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
      // GM-owned chapter documents; disabled unless explicitly enabled in staging.
      if(chapters&&/^\/vtt\/campaigns\/[^/]+\/chapters(?:\/[^/]+)?$/.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/chapters(?:\/([0-9a-f-]{36}))?$/i.exec(req.url);
        if(!match)throw new HttpProblem(400,'Percorso capitoli non valido');
        if(!['GET','PUT','DELETE'].includes(req.method))throw new HttpProblem(405,'Metodo non consentito');
        if(req.method==='GET'&&match[2])throw new HttpProblem(405,'Metodo non consentito');
        if(req.method==='DELETE'&&!match[2])throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')return response(res,200,await chapters.list(user.id,match[1]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='DELETE')return response(res,200,await chapters.remove(user.id,match[1],match[2]));
        if(match[2])throw new HttpProblem(405,'Metodo non consentito');
        return response(res,200,await chapters.save(user.id,match[1],await readJson(req,100000)));
      }
      // Original GM Scenes; disabled unless explicit staging opt-in.
      if(scenes&&/^\/vtt\/campaigns\/[^/]+\/scenes(?:\/[^/]+)?$/.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/scenes(?:\/([0-9a-f-]{36}))?$/i.exec(req.url);
        if(!match)throw new HttpProblem(400,'Percorso scene non valido');
        if(!['GET','PUT','DELETE'].includes(req.method))throw new HttpProblem(405,'Metodo non consentito');
        if(req.method==='GET'&&match[2]||req.method==='DELETE'&&!match[2]||req.method==='PUT'&&match[2])
          throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')return response(res,200,await scenes.list(user.id,match[1]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='DELETE')return response(res,200,await scenes.remove(user.id,match[1],match[2]));
        return response(res,200,await scenes.save(user.id,match[1],await readJson(req,100000)));
      }
      // LOCAL opt-in only: native unassigned entities, not the complete global
      // catalog. index.mjs deliberately does not construct/inject this service.
      if(unassignedCatalog&&req.url?.startsWith('/vtt/catalog/unassigned/')){
        const url=new URL(req.url,origin);
        const match=/^\/vtt\/catalog\/unassigned\/(characters|npcs|monsters)(?:\/([0-9a-f-]{36})(\/.*)?)?$/i.exec(url.pathname);
        if(!match)throw new HttpProblem(400,'Percorso catalogo non valido');
        const [,kind,id,tail]=match;
        const media=tail&&/^\/media\/(portrait|source|cover)$/.exec(tail);
        const notes=tail&&/^\/notes(?:\/([0-9a-f-]{36})(\/order)?)?$/i.exec(tail);
        const duplicate=tail==='/duplicate';
        const copyToCampaign=tail==='/campaign'&&id;
        if(tail&&!media&&!notes&&!duplicate&&!copyToCampaign)throw new HttpProblem(400,'Percorso catalogo non valido');
        if(notes&&!unassignedCatalogNotes||duplicate&&typeof unassignedCatalog.duplicate!=='function'||copyToCampaign&&typeof unassignedCatalog.copyToCampaign!=='function')
          return response(res,404,{error:'Not found'});
        const role=media?.[1];
        const methods=duplicate||copyToCampaign?['POST']:notes?(notes[2]?['PUT']:notes[1]?['PUT','DELETE']:['GET','POST']):['GET',id?'PUT':'POST'];
        if(!methods.includes(req.method))throw new HttpProblem(405,'Metodo non consentito');
        const keys=[...url.searchParams.keys()];
        const allowedQuery=notes&&!notes[1]?'parentId':!id?'after':null;
        if(keys.length&&(req.method!=='GET'||!allowedQuery||keys.length!==1||keys[0]!==allowedQuery))
          throw new HttpProblem(400,'Query catalogo non valida');
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET'){
          if(notes)return response(res,200,await unassignedCatalogNotes.list(user.id,kind,id,url.searchParams.get('parentId')));
          if(role)return response(res,200,await unassignedCatalog.readMedia(user.id,kind,id,role));
          if(id)return response(res,200,await unassignedCatalog.read(user.id,kind,id));
          return response(res,200,await unassignedCatalog.list(user.id,kind,url.searchParams.get('after')));
        }
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req,role?2800000:notes?1100000:100000);
        if(copyToCampaign)return response(res,200,await unassignedCatalog.copyToCampaign(user.id,kind,id,body));
        if(duplicate)return response(res,200,await unassignedCatalog.duplicate(user.id,kind,id,body));
        if(notes){
          if(!notes[1])return response(res,201,await unassignedCatalogNotes.create(user.id,kind,id,body));
          if(notes[2])return response(res,200,await unassignedCatalogNotes.reorder(user.id,kind,id,notes[1],body));
          if(req.method==='DELETE')return response(res,200,await unassignedCatalogNotes.archive(user.id,kind,id,notes[1],body));
          return response(res,200,await unassignedCatalogNotes.save(user.id,kind,id,notes[1],body));
        }
        if(role)return response(res,200,await unassignedCatalog.saveMedia(user.id,kind,id,role,body));
        if(id)return response(res,200,await unassignedCatalog.save(user.id,kind,id,body));
        return response(res,201,await unassignedCatalog.create(user.id,kind,body));
      }
      // Original NPC, Monster, Clue and Situation documents. Explicit staging opt-in only.
      if(narrativeContent&&/^\/vtt\/campaigns\/[^/]+\/narrative\/(?:npcs|monsters|clues|events)(?:\/[^/]+)?$/.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/narrative\/(npcs|monsters|clues|events)(?:\/([0-9a-f-]{36}))?$/i.exec(req.url);
        if(!match)throw new HttpProblem(400,'Percorso contenuti non valido');
        if(!['GET','PUT','DELETE'].includes(req.method)||req.method==='GET'&&match[3]||req.method==='PUT'&&match[3]||req.method==='DELETE'&&!match[3])
          throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')return response(res,200,await narrativeContent.list(user.id,match[1],match[2]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='DELETE')return response(res,200,await narrativeContent.remove(user.id,match[1],match[2],match[3]));
        return response(res,200,await narrativeContent.save(user.id,match[1],match[2],await readJson(req,100000)));
      }
      if(campaignChat&&/^\/vtt\/campaigns\/[0-9a-f-]{36}\/chat\/participants$/i.test(req.url??'')){
        if(req.method!=='GET')throw new HttpProblem(405,'Metodo non consentito');const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/chat\/participants$/i.exec(req.url);
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        return response(res,200,await campaignChat.participants(user.id,match[1]));
      }
      if(campaignChat&&/^\/vtt\/campaigns\/[0-9a-f-]{36}\/chat\/attachments(?:\/[0-9a-f-]{36})?$/i.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/chat\/attachments(?:\/([0-9a-f-]{36}))?$/i.exec(req.url);if(!['GET','POST','DELETE'].includes(req.method))throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET'&&match[2]){const file=await campaignChat.readAttachment(user.id,match[1],match[2]);return binaryResponse(res,200,file.mimeType,file.bytes);}
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='POST'&&!match[2])return response(res,201,await campaignChat.saveAttachment(user.id,match[1],await readJson(req,70000000)));
        if(req.method==='DELETE'&&match[2])return response(res,200,await campaignChat.removeAttachment(user.id,match[1],match[2]));
        throw new HttpProblem(405,'Metodo non consentito');
      }
      if(campaignChat&&/^\/vtt\/campaigns\/[0-9a-f-]{36}\/chat\/private(?:\/[0-9a-f-]{36})?$/i.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/chat\/private(?:\/([0-9a-f-]{36}))?$/i.exec(req.url);if(!['GET','POST','DELETE'].includes(req.method))throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')return response(res,200,await campaignChat.privateList(user.id,match[1],match[2]??null));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='POST'&&!match[2])return response(res,201,await campaignChat.privateSend(user.id,match[1],await readJson(req,100000)));
        if(req.method==='DELETE'&&match[2])return response(res,200,await campaignChat.privateRemove(user.id,match[1],match[2]));
        throw new HttpProblem(405,'Metodo non consentito');
      }
      if(campaignChat&&/^\/vtt\/campaigns\/[0-9a-f-]{36}\/chat\/private-clear\/[0-9a-f-]{36}$/i.test(req.url??'')){
        if(req.method!=='DELETE')throw new HttpProblem(405,'Metodo non consentito');const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/chat\/private-clear\/([0-9a-f-]{36})$/i.exec(req.url);
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');return response(res,200,await campaignChat.privateClear(user.id,match[1],match[2]));
      }
      if(campaignChat&&/^\/vtt\/campaigns\/[0-9a-f-]{36}\/chat\/[0-9a-f-]{36}\/reaction$/i.test(req.url??'')){
        if(req.method!=='PUT')throw new HttpProblem(405,'Metodo non consentito');const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/chat\/([0-9a-f-]{36})\/reaction$/i.exec(req.url);
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');const body=await readJson(req);if(Object.keys(body).join(',')!=='char')throw new HttpProblem(400,'Reazione non valida');return response(res,200,await campaignChat.react(user.id,match[1],match[2],body.char));
      }
      if(campaignChat&&/^\/vtt\/campaigns\/[^/]+\/chat(?:\/[^/]+)?$/.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/chat(?:\/([0-9a-f-]{36}))?$/i.exec(req.url);
        if(!match||!['GET','POST','DELETE'].includes(req.method)||req.method==='GET'&&match[2]||req.method==='POST'&&match[2])throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')return response(res,200,await campaignChat.list(user.id,match[1]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='POST')return response(res,201,await campaignChat.send(user.id,match[1],await readJson(req,100000)));
        if(match[2])return response(res,200,await campaignChat.remove(user.id,match[1],match[2]));
        return response(res,200,await campaignChat.clear(user.id,match[1]));
      }
      if(diceFormulas&&/^\/vtt\/campaigns\/[0-9a-f-]{36}\/dice-formulas(?:\/[0-9a-f-]{36})?$/i.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/dice-formulas(?:\/([0-9a-f-]{36}))?$/i.exec(req.url);
        if(!['GET','POST','PUT','PATCH','DELETE'].includes(req.method))throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET'&&!match[2])return response(res,200,await diceFormulas.list(user.id,match[1]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='POST'&&!match[2])return response(res,201,await diceFormulas.create(user.id,match[1],await readJson(req)));
        if((req.method==='PUT'||req.method==='PATCH')&&match[2])return response(res,200,await diceFormulas.update(user.id,match[2],await readJson(req)));
        if(req.method==='DELETE'&&match[2])return response(res,200,await diceFormulas.remove(user.id,match[2]));
        throw new HttpProblem(405,'Metodo non consentito');
      }
      if(diceFormulas&&/^\/vtt\/campaigns\/[0-9a-f-]{36}\/dice-formulas\/reorder$/i.test(req.url??'')){
        if(req.method!=='POST')throw new HttpProblem(405,'Metodo non consentito');
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/dice-formulas\/reorder$/i.exec(req.url);
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req);if(!Array.isArray(body.ids))throw new HttpProblem(400,'Lista ordinamento non valida');
        return response(res,200,await diceFormulas.reorder(user.id,match[1],body.ids));
      }
      if(equipmentCatalog&&/^\/vtt\/campaigns\/[^/]+\/equipment(?:\/[^/]+)?$/.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/equipment(?:\/([0-9a-f-]{36}))?$/i.exec(req.url);
        if(!match)throw new HttpProblem(400,'Percorso oggetti non valido');
        if(!['GET','PUT','DELETE'].includes(req.method)||req.method==='GET'&&match[2]||req.method==='PUT'&&match[2]||req.method==='DELETE'&&!match[2])throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')return response(res,200,await equipmentCatalog.list(user.id,match[1]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='DELETE')return response(res,200,await equipmentCatalog.remove(user.id,match[1],match[2]));
        return response(res,200,await equipmentCatalog.save(user.id,match[1],await readJson(req,100000)));
      }
      if(campaignDocuments&&/^\/vtt\/campaigns\/[^/]+\/documents\/[^/]+$/.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/documents\/([a-z-]+)$/i.exec(req.url);
        if(!match)throw new HttpProblem(400,'Percorso documento non valido');
        if(!['GET','PUT','DELETE'].includes(req.method))throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')return response(res,200,await campaignDocuments.read(user.id,match[1],match[2]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='DELETE')return response(res,200,await campaignDocuments.remove(user.id,match[1],match[2]));
        const body=await readJson(req,510000);return response(res,200,await campaignDocuments.save(user.id,match[1],match[2],body.value));
      }
      if(visualAssets&&/^\/vtt\/campaigns\/[^/]+\/visual-assets\/[^/]+\/content$/.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/visual-assets\/([0-9a-f-]{36})\/content$/i.exec(req.url);
        if(!match||req.method!=='GET')throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const asset=await visualAssets.read(user.id,match[1],match[2]);
        return binaryResponse(res,200,asset.mimeType,asset.bytes);
      }
      if(visualAssets&&/^\/vtt\/campaigns\/[^/]+\/visual-assets(?:\/[^/]+)?$/.test(req.url??'')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/visual-assets(?:\/([0-9a-f-]{36}))?$/i.exec(req.url);
        if(!match)throw new HttpProblem(400,'Percorso asset non valido');
        if(!['GET','PUT','DELETE'].includes(req.method)||req.method==='GET'&&match[2]||req.method==='PUT'&&match[2]||req.method==='DELETE'&&!match[2])throw new HttpProblem(405,'Metodo non consentito');
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')return response(res,200,await visualAssets.list(user.id,match[1]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='DELETE')return response(res,200,await visualAssets.remove(user.id,match[1],match[2]));
        return response(res,200,await visualAssets.save(user.id,match[1],await readJson(req,9*1024*1024)));
      }
      // Read-only roster. No membership changes or email addresses in the response.
      if(campaignRoster && req.method==='GET' &&
         req.url?.startsWith('/vtt/campaigns/') &&
         req.url.endsWith('/roster')){
        const match=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/roster$/i.exec(req.url);
        if(!match)throw new HttpProblem(400,'Campagna non valida');
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        return response(res,200,await campaignRoster.list(user.id,match[1]));
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
      // Campaign logo/cover references. Same-origin, cookie-only owner write;
      // the SQL routine also verifies that each asset belongs to the campaign.
      if(campaigns && typeof campaigns.setBranding==='function' && req.method==='PUT' &&
         /^\/vtt\/campaigns\/[0-9a-f-]{36}\/branding$/i.test(req.url??'')){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const campaignId=req.url.slice('/vtt/campaigns/'.length,-'/branding'.length);
        return response(res,200,await campaigns.setBranding(user.id,campaignId,await readJson(req)));
      }
      if(campaignInvites&&req.method==='POST'&&
         /^\/vtt\/campaigns\/[0-9a-f-]{36}\/invite-code$/i.test(req.url??'')){
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const campaignId=req.url.slice('/vtt/campaigns/'.length,-'/invite-code'.length);
        return response(res,200,await campaignInvites.rotate(user.id,campaignId));
      }
      if(campaignInvites&&req.method==='GET'&&req.url?.startsWith('/vtt/campaign-invites/preview?')){
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const url=new URL(req.url,origin);
        if(url.pathname!=='/vtt/campaign-invites/preview'||
           [...url.searchParams.keys()].join(',')!=='code'||url.searchParams.getAll('code').length!==1)
          throw new HttpProblem(400,'Query invito non valida');
        return response(res,200,await campaignInvites.preview(user.id,url.searchParams.get('code')));
      }
      if(campaignInvites&&req.method==='POST'&&req.url==='/vtt/campaign-invites/join'){
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req);
        if(Object.keys(body).join(',')!=='code'||typeof body.code!=='string')
          throw new HttpProblem(400,'Codice invito non valido');
        return response(res,200,await campaignInvites.join(user.id,body.code));
      }
      // Current player memberships are queried independently from GM-owned campaigns.
      if(playerCharacters&&req.method==='GET'&&req.url==='/vtt/player-campaigns'){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        return response(res,200,await playerCharacters.listCampaigns(user.id));
      }
      // Read-only player access to visual assets CURRENTLY referenced by the
      // player's assigned sheets. Owner list/save/remove stay on /vtt/campaigns.
      if(visualAssets&&playerCharacters&&req.method==='GET'&&
         /^\/vtt\/player-campaigns\/[0-9a-f-]{36}\/visual-assets$/.test(req.url??'')){
        const match=/^\/vtt\/player-campaigns\/([0-9a-f-]{36})\/visual-assets$/i.exec(req.url);
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        return response(res,200,await visualAssets.listForPlayer(user.id,match[1]));
      }
      // Read-only player access to CURRENTLY assigned sheets; no owner write API.
      // The SQL function checks the logged-in player, membership and campaign.
      if(playerCharacters&&req.method==='GET'&&
         req.url?.startsWith('/vtt/player-characters?')){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const url=new URL(req.url,origin);
        if(url.pathname!=='/vtt/player-characters'||
           [...url.searchParams.keys()].join(',')!=='campaignId'||
           url.searchParams.getAll('campaignId').length!==1)
          throw new HttpProblem(400,'Query non valida');
        return response(res,200,await playerCharacters.list(user.id,url.searchParams.get('campaignId')));
      }
      // Original portrait source: restricted to active GM owner, never players.
      // Feature flag is the same as cropped portrait, but schema 032 must be applied.
      if(characterPortraits&&req.url?.startsWith('/vtt/character-portrait-source/')){
        const match=/^\/vtt\/character-portrait-source\/([0-9a-f-]{36})\?campaignId=([0-9a-f-]{36})$/i.exec(req.url);
        if(!match||!['GET','PUT'].includes(req.method))
         throw new HttpProblem(400,'Richiesta sorgente non valida');
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')return response(res,200,
         await characterPortraits.readSource(user.id,match[2],match[1]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req,2900000);
        return response(res,200,await characterPortraits.saveSource(user.id,match[2],match[1],body));
      }
      // Isolated owner-managed portrait binary. Exact query and same-origin
      // checks apply even to authenticated sessions. Player reads are SQL gated.
      if(characterPortraits&&req.url?.startsWith('/vtt/character-portrait/')){
        const match=/^\/vtt\/character-portrait\/([0-9a-f-]{36})\?campaignId=([0-9a-f-]{36})$/i.exec(req.url);
        if(!match||!['GET','PUT'].includes(req.method))
         throw new HttpProblem(400,'Richiesta ritratto non valida');
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method==='GET')
         return response(res,200,await characterPortraits.read(user.id,match[2],match[1]));
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req,700000);
        return response(res,200,await characterPortraits.save(user.id,match[2],match[1],body));
      }
      // Owner-authorized character assignments; SQL verifies campaign and active membership.
      // This capability is disabled unless the CI-only 028 schema is explicitly enabled.
      if(characterAssignments&&req.method==='GET'&&
         req.url?.startsWith('/vtt/character-assignments?')){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const url=new URL(req.url,origin);
        if(url.pathname!=='/vtt/character-assignments'||
           [...url.searchParams.keys()].join(',')!=='campaignId'||
           url.searchParams.getAll('campaignId').length!==1)
          throw new HttpProblem(400,'Query non valida');
        return response(res,200,await characterAssignments.list(user.id,url.searchParams.get('campaignId')));
      }
      if(characterAssignments&&req.method==='PATCH'&&
         req.url?.startsWith('/vtt/character-assignments/')){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const charId=req.url.slice('/vtt/character-assignments/'.length);
        const body=await readJson(req);
        if(Object.keys(body).sort().join(',')!=='campaignId,playerId')
          throw new HttpProblem(400,'Assegnazione non valida');
        return response(res,200,await characterAssignments.set(user.id,
          body.campaignId,charId,body.playerId));
      }
      if(characterClaims&&req.method==='POST'){
        const match=/^\/vtt\/player-characters\/([0-9a-f-]{36})\/(claim|release)$/i.exec(req.url??'');
        if(match){
          const token=extractSession(req);
          if(!token)return response(res,401,{error:'Non autenticato'});
          const user=await getSessionUser(token);
          if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
          if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
          if(req.headers['transfer-encoding']||(req.headers['content-length']&&req.headers['content-length']!=='0'))
            throw new HttpProblem(400,'Il claim non accetta dati client');
          return response(res,200,await characterClaims[match[2].toLowerCase()](user.id,match[1]));
        }
      }
      if(characterClaims&&req.method==='PUT'){
        const match=/^\/vtt\/player-characters\/([0-9a-f-]{36})$/i.exec(req.url??'');
        if(match){
          const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
          const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
          if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
          const body=await readJson(req);
          return response(res,200,await characterClaims.save(user.id,body.campaignId,match[1],body));
        }
      }
      if(characterClaims&&req.method==='GET'&&req.url?.startsWith('/vtt/player-character-claims?')){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const url=new URL(req.url,origin);
        if(url.pathname!=='/vtt/player-character-claims'||[...url.searchParams.keys()].join(',')!=='campaignId'||url.searchParams.getAll('campaignId').length!==1)
          throw new HttpProblem(400,'Query non valida');
        return response(res,200,await characterClaims.list(user.id,url.searchParams.get('campaignId')));
      }
      if(characterClaims&&req.method==='GET'&&req.url?.startsWith('/vtt/player-character-claim?')){
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const url=new URL(req.url,origin);
        if(url.pathname!=='/vtt/player-character-claim'||[...url.searchParams.keys()].join(',')!=='campaignId'||url.searchParams.getAll('campaignId').length!==1)throw new HttpProblem(400,'Query non valida');
        return response(res,200,await characterClaims.current(user.id,url.searchParams.get('campaignId')));
      }
      if(characterClaims&&req.method==='GET'&&req.url?.startsWith('/vtt/owned-character-claims?')){
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const url=new URL(req.url,origin);
        if(url.pathname!=='/vtt/owned-character-claims'||[...url.searchParams.keys()].join(',')!=='campaignId'||url.searchParams.getAll('campaignId').length!==1)throw new HttpProblem(400,'Query non valida');
        return response(res,200,await characterClaims.owned(user.id,url.searchParams.get('campaignId')));
      }
      // Availability is a GM-only preparatory flag; it never assigns a PG.
      if(characterAvailability&&req.method==='GET'&&
         req.url?.startsWith('/vtt/character-availability?')){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const url=new URL(req.url,origin);
        if(url.pathname!=='/vtt/character-availability'||
           [...url.searchParams.keys()].join(',')!=='campaignId'||
           url.searchParams.getAll('campaignId').length!==1)
          throw new HttpProblem(400,'Query non valida');
        return response(res,200,await characterAvailability.list(user.id,url.searchParams.get('campaignId')));
      }
      if(characterAvailability&&req.method==='PATCH'&&
         req.url?.startsWith('/vtt/character-availability/')){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const charId=req.url.slice('/vtt/character-availability/'.length);
        const body=await readJson(req);
        if(Object.keys(body).sort().join(',')!=='availableForPlayers,campaignId')
          throw new HttpProblem(400,'Dati disponibilità non validi');
        return response(res,200,await characterAvailability.set(user.id,
          body.campaignId,charId,body.availableForPlayers));
      }
      if(logicalCharacters && (req.url==='/vtt/characters'||req.url?.startsWith('/vtt/characters?')) && req.method==='GET'){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        const url=new URL(req.url,origin);
        if(url.pathname!=='/vtt/characters')
          throw new HttpProblem(400,'Query personaggi non valida');
        const keys=[...url.searchParams.keys()];
        const after=url.searchParams.get('after');
        if(keys.length===0)return response(res,200,await logicalCharacters.list(user.id,null));
        if(keys.length!==1||keys[0]!=='after'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after||''))
          throw new HttpProblem(400,'Query personaggi non valida');
        return response(res,200,await logicalCharacters.list(user.id,after));
      }
      if(logicalCharacters && req.method==='PATCH' &&
         /^\/vtt\/characters\/[0-9a-f-]{36}\/campaign$/i.test(req.url??'')){
        const token=extractSession(req);
        if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);
        if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const characterId=/^\/vtt\/characters\/([0-9a-f-]{36})\/campaign$/i.exec(req.url??'')[1];
        const body=await readJson(req);
        if(Object.keys(body).sort().join(',')!=='campaignId'||!(body.campaignId===null||typeof body.campaignId==='string'))
          throw new HttpProblem(400,'Assegnazione non valida');
        return response(res,200,await logicalCharacters.assign(user.id,characterId,body.campaignId));
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
      // Original custom tabs for Aruba-native PNG and Monster documents.
      if(narrativeEntityNotes&&req.url?.startsWith('/vtt/narrative-entity-notes')&&
       ['GET','POST','PATCH','DELETE'].includes(req.method)){
        const token=extractSession(req);if(!token)return response(res,401,{error:'Non autenticato'});
        const user=await getSessionUser(token);if(!user)return response(res,401,{error:'Non autenticato'},LOGOUT_COOKIE);
        if(req.method!=='GET'&&req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        if(req.method==='GET'){
          const url=new URL(req.url,origin);
          if(url.pathname!=='/vtt/narrative-entity-notes'||
           !['campaignId,entityId,kind','campaignId,entityId,kind,parentId'].includes([...url.searchParams.keys()].sort().join(','))||
           ['campaignId','entityId','kind'].some(key=>url.searchParams.getAll(key).length!==1)||url.searchParams.getAll('parentId').length>1)
            throw new HttpProblem(400,'Query note narrative non valida');
          const args=[user.id,url.searchParams.get('campaignId'),url.searchParams.get('kind'),url.searchParams.get('entityId')];
          const parentId=url.searchParams.get('parentId');
          return response(res,200,parentId===null?await narrativeEntityNotes.list(...args):await narrativeEntityNotes.list(...args,parentId));
        }
        const body=await readJson(req,MAX_NOTE_BODY);
        if(typeof body.campaignId!=='string'||typeof body.kind!=='string'||typeof body.entityId!=='string')
          throw new HttpProblem(400,'Identità nota narrativa non valida');
        const scope=[user.id,body.campaignId,body.kind,body.entityId];
        if(req.method==='POST'){
          if(req.url!=='/vtt/narrative-entity-notes'||
           !['campaignId,entityId,kind,tabName','campaignId,entityId,kind,parentId,tabName'].includes(Object.keys(body).sort().join(',')))
            throw new HttpProblem(400,'Dati creazione nota narrativa non validi');
          return response(res,201,await narrativeEntityNotes.create(...scope,
           body.parentId===undefined?{tabName:body.tabName}:{tabName:body.tabName,parentId:body.parentId}));
        }
        if(req.method==='PATCH'&&req.url?.startsWith('/vtt/narrative-entity-notes/order/')){
          const parentId=req.url.slice('/vtt/narrative-entity-notes/order/'.length);
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId)||
           Object.keys(body).sort().join(',')!=='campaignId,entityId,kind,tabOrder')
            throw new HttpProblem(400,'Ordine sottoschede narrative non valido');
          return response(res,200,await narrativeEntityNotes.setSubtabOrder(...scope,parentId,body.tabOrder));
        }
        const noteId=req.url?.startsWith('/vtt/narrative-entity-notes/')?req.url.slice('/vtt/narrative-entity-notes/'.length):'';
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noteId))
          throw new HttpProblem(400,'Nota narrativa non valida');
        if(req.method==='PATCH'){
          if(Object.keys(body).sort().join(',')!=='campaignId,content,contentRich,entityId,hidden,kind,position,tabName,visibility')
            throw new HttpProblem(400,'Dati aggiornamento nota narrativa non validi');
          const {campaignId,kind,entityId,...changes}=body;
          return response(res,200,await narrativeEntityNotes.save(user.id,campaignId,kind,entityId,noteId,changes));
        }
        if(Object.keys(body).sort().join(',')!=='campaignId,entityId,kind')throw new HttpProblem(400,'Dati archivio nota narrativa non validi');
        return response(res,200,await narrativeEntityNotes.archive(...scope,noteId));
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
        const body=await readJson(req,MAX_NOTE_BODY);
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
          if(url.pathname==='/vtt/campaign-notes/trash'){
            if([...url.searchParams.keys()].sort().join(',')!=='campaignId'||
               url.searchParams.getAll('campaignId').length!==1||
               typeof campaignNotes.listTrash!=='function')
              throw new HttpProblem(400,'Query Cestino non valida');
            return response(res,200,await campaignNotes.listTrash(
              user.id,url.searchParams.get('campaignId')));
          }
          if(url.pathname!=='/vtt/campaign-notes'||
             !['campaignId','campaignId,parentId'].includes([...url.searchParams.keys()].sort().join(','))||
             url.searchParams.getAll('campaignId').length!==1||
             url.searchParams.getAll('parentId').length>1)
            throw new HttpProblem(400,'Query Note non valida');
          return response(res,200,await campaignNotes.listForMember(user.id,
            url.searchParams.get('campaignId'),url.searchParams.get('parentId')));
        }
        if(req.headers.origin!==origin)throw new HttpProblem(403,'Origine non consentita');
        const body=await readJson(req,MAX_NOTE_BODY);
        if(req.method==='POST'){
          if(req.url==='/vtt/campaign-notes/trash/restore'){
            if(Object.keys(body).sort().join(',')!=='campaignId,itemId,kind'||
               !['note','folder'].includes(body.kind)||
               typeof campaignNotes.restoreTrash!=='function')
              throw new HttpProblem(400,'Ripristino Cestino non valido');
            return response(res,200,await campaignNotes.restoreTrash(
              user.id,body.campaignId,body.kind,body.itemId));
          }
          if(req.url!=='/vtt/campaign-notes'||
             !['campaignId,parentId,title','campaignId,parentId,scope,title']
             .includes(Object.keys(body).sort().join(',')))
            throw new HttpProblem(400,'Creazione nota non valida');
          return response(res,201,await campaignNotes.create(user.id,body.campaignId,
            body.scope===undefined?
              {title:body.title,parentId:body.parentId}:
              {title:body.title,parentId:body.parentId,scope:body.scope}));
        }
        if(req.method==='PATCH' &&
           req.url?.startsWith('/vtt/campaign-notes/scope/')){
          const scopeId=req.url.slice('/vtt/campaign-notes/scope/'.length);
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scopeId)||
             Object.keys(body).sort().join(',')!=='campaignId,scope'||
             !['gm','shared'].includes(body.scope)||
             typeof campaignNotes.changeScope!=='function')
            throw new HttpProblem(400,'Cambio sezione Nota non valido');
          return response(res,200,await campaignNotes.changeScope(
            user.id,body.campaignId,scopeId,body.scope));
        }
        if(req.method==='PATCH' &&
           req.url?.startsWith('/vtt/campaign-notes/folder/')){
          const movingId=req.url.slice('/vtt/campaign-notes/folder/'.length);
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(movingId))
            throw new HttpProblem(400,'Nota non valida');
          if(Object.keys(body).sort().join(',')!=='campaignId,folderId' ||
             typeof campaignNotes.moveToFolder!=='function')
            throw new HttpProblem(400,'Spostamento Nota non valido');
          return response(res,200,await campaignNotes.moveToFolder(
            user.id,body.campaignId,movingId,body.folderId));
        }
        if(req.method==='PATCH' &&
           req.url?.startsWith('/vtt/campaign-notes/icon/')){
          const iconNoteId=req.url.slice('/vtt/campaign-notes/icon/'.length);
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(iconNoteId)||
             Object.keys(body).sort().join(',')!=='campaignId,titleIcon'||
             typeof campaignNotes.setTitleIcon!=='function')
            throw new HttpProblem(400,'Icona Nota non valida');
          return response(res,200,await campaignNotes.setTitleIcon(
            user.id,body.campaignId,iconNoteId,body.titleIcon));
        }
        if(req.method==='PATCH' &&
           req.url?.startsWith('/vtt/campaign-notes/order/')){
          const parentNoteId=req.url.slice('/vtt/campaign-notes/order/'.length);
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentNoteId)||
             Object.keys(body).sort().join(',')!=='campaignId,tabOrder'||
             typeof campaignNotes.setSubtabOrder!=='function')
            throw new HttpProblem(400,'Ordine sottoschede non valido');
          return response(res,200,await campaignNotes.setSubtabOrder(
            user.id,body.campaignId,parentNoteId,body.tabOrder));
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
      if(campaignFolders && ['GET','POST','PATCH','DELETE'].includes(req.method) &&
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
        if(req.method==='PATCH' &&
          req.url?.startsWith('/vtt/campaign-note-folders/presentation/')){
          const presentationId=req.url.slice('/vtt/campaign-note-folders/presentation/'.length);
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(presentationId))
            throw new HttpProblem(400,'Cartella non valida');
          if(Object.keys(body).sort().join(',')!=='campaignId,icon,position')
            throw new HttpProblem(400,'Presentazione cartella non valida');
          return response(res,200,await campaignFolders.presentation(user.id,presentationId,body));
        }
        const folderId=req.url?.startsWith('/vtt/campaign-note-folders/')?
          req.url.slice('/vtt/campaign-note-folders/'.length):'';
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folderId))
          throw new HttpProblem(400,'Cartella non valida');
        if(req.method==='DELETE'){
          if(Object.keys(body).sort().join(',')!=='campaignId,cascade'||typeof body.cascade!=='boolean')
            throw new HttpProblem(400,'Archiviazione cartella non valida');
          return response(res,200,await campaignFolders.archive(user.id,folderId,body));
        }
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
        const memberships=gameSessionBootstrap ? await gameSessionBootstrap(user) : null;
        if(memberships!==null){
          const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if(!Array.isArray(memberships)||memberships.length>100||
            !memberships.every(m=>m&&m.userId===user.id&&uuid.test(m.campaignId??'')&&['gm','player'].includes(m.role))||
            new Set(memberships.map(m=>m.campaignId)).size!==memberships.length)
            throw new Error('Invalid game session memberships');
        }
        return response(res, 200, {
          user,
          ...(memberships ? {campaignMemberships:memberships} : {}),
          backend:'aruba-staging',
          capabilities:{
            campaigns:{read:!!campaigns,write:!!campaigns},
            campaignInvites:{read:!!campaignInvites,write:!!campaignInvites},
            chapters:{read:!!chapters,write:!!chapters},
            scenes:{read:!!scenes,write:!!scenes},
            narrativeContent:{read:!!narrativeContent,write:!!narrativeContent},
            equipmentCatalog:{read:!!equipmentCatalog,write:!!equipmentCatalog},
            campaignDocuments:{read:!!campaignDocuments,write:!!campaignDocuments},
            campaignChat:{read:!!campaignChat,write:!!campaignChat},
            diceFormulas:{read:!!diceFormulas,write:!!diceFormulas},
            visualAssets:{read:!!visualAssets,write:!!visualAssets},
            campaignRoster:{read:!!campaignRoster,write:false},
            characters:{read:!!characters,write:!!characters},
            characterAvailability:{read:!!characterAvailability,write:!!characterAvailability},
            characterAssignments:{read:!!characterAssignments,write:!!characterAssignments},
            playerCharacters:{read:!!playerCharacters,write:false},
            characterClaims:{read:!!characterClaims,write:!!characterClaims},
            characterPortraits:{read:!!characterPortraits,write:!!characterPortraits},
            logicalCharacters:{read:!!logicalCharacters,write:!!logicalCharacters},
            entityNotes:{read:!!entityNotes,write:!!entityNotes},
            narrativeEntityNotes:{read:!!narrativeEntityNotes,write:!!narrativeEntityNotes},
            campaignNotes:{read:!!campaignNotes,write:!!campaignNotes},
            campaignNoteFolders:{read:!!campaignFolders,write:!!campaignFolders},
            originalNotesPanel:{read:notesPanelEnabled,write:notesPanelEnabled},
            gameSession:memberships!==null,
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
      if (error instanceof CatalogRejected) return response(res,error.status,{error:error.message});
      if (error instanceof VisualAssetRejected) return response(res,error.status,{error:error.message});
      if (error instanceof CampaignDocumentRejected) return response(res,error.status,{error:error.message});
      if (error instanceof EquipmentCatalogRejected) return response(res,error.status,{error:error.message});
      if (error instanceof NarrativeContentRejected) return response(res,error.status,{error:error.message});
      if (error instanceof ChapterRejected) return response(res,error.status,{error:error.message});
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
