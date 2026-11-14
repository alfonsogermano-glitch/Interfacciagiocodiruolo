// Transactional email transport for future account verification/reset.
// Does not send unless a caller explicitly invokes send. Credentials are
// supplied at runtime by a secure secret file, never by the browser.
const ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'Hollowgate <no-reply@hollowgate.quest>';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createTransactionalMailer({apiKey, fetchImpl = fetch}) {
  if (typeof apiKey !== 'string' || !apiKey.startsWith('re_') || apiKey.length < 10) {
    throw new TypeError('Missing valid Resend API key');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation required');
  return {
    async send({to, subject, text, idempotencyKey}) {
      if (typeof to !== 'string' || !EMAIL_RE.test(to) || to.length > 320) throw new TypeError('Invalid recipient');
      if (typeof subject !== 'string' || subject.length < 1 || subject.length > 180) throw new TypeError('Invalid subject');
      if (typeof text !== 'string' || text.length < 1 || text.length > 10000) throw new TypeError('Invalid email content');
      if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
        throw new TypeError('Invalid idempotency key');
      }
      let response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method:'POST',
          headers:{
            Authorization: 'Bearer ' + apiKey,
            'Content-Type':'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body:JSON.stringify({from:FROM,to:[to],subject,text}),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new Error('Mail provider unavailable');
      }
      if (!response.ok) {
        // Do not leak provider response bodies, tokens or addresses to clients.
        throw new Error('Mail provider rejected request');
      }
      const payload = await response.json();
      if (typeof payload?.id !== 'string' || !payload.id) throw new Error('Invalid mail provider response');
      return {messageId:payload.id};
    },
  };
}

// The base URL is fixed by deployment config and cannot be supplied by users.
// Never embed account data or passwords in a URL; use only a random one-time token.
export function createPasswordActionEmail({purpose, token, baseUrl = 'https://staging.hollowgate.quest'}) {
  if (!['password_setup','password_reset'].includes(purpose)) throw new TypeError('Invalid purpose');
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TypeError('Invalid token');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.origin !== baseUrl) throw new TypeError('HTTPS origin required');
  const link = url.origin + '/account/password?action=' + encodeURIComponent(purpose) +
    '&token=' + encodeURIComponent(token);
  const subject = purpose === 'password_setup' ? 'Hollowgate - Imposta la password' : 'Hollowgate - Recupera la password';
  const text = [
    'Hai richiesto di ' + (purpose === 'password_setup' ? 'impostare' : 'reimpostare') + ' la password di Hollowgate.',
    '',
    'Apri questo link: ' + link,
    '',
    'Il link scade dopo 30 minuti e può essere utilizzato una sola volta.',
    'Se non hai richiesto questa operazione, ignora il messaggio.',
  ].join('\n');
  return {subject,text};
}
