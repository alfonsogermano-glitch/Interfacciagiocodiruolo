import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {canonicalEmail,rateLimitSubjectDigest} from './auth-abuse.mjs';
import {hashPassword,validateNewPassword} from './password.mjs';

const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;
const ACK=Object.freeze({message:'Se la registrazione è valida, riceverai un link di verifica via email.'});

export class SignupRejected extends Error {
  constructor(message='Collegamento non valido o scaduto') {
    super(message);
    this.status=400;
  }
}

export function createSignupService({
  pool,mailer,hmacKey,now=()=>new Date(),
  issueToken=()=>randomBytes(32).toString('base64url'),
  hashNewPassword=hashPassword,
}) {
  if(typeof pool?.query!=='function'||typeof pool?.connect!=='function')throw new TypeError('Pool required');
  if(typeof mailer?.send!=='function')throw new TypeError('Mailer required');
  if(!Buffer.isBuffer(hmacKey)||hmacKey.length<32)throw new TypeError('HMAC key required');

  async function signup({email,displayName,password,networkSubject}) {
    let address;
    try {
      address=canonicalEmail(email);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error();
      if(typeof displayName!=='string'||displayName.trim().length<1||displayName.trim().length>100)throw new Error();
      validateNewPassword(password);
      if(typeof networkSubject!=='string'||networkSubject.length<1||networkSubject.length>512)throw new Error();
    } catch {throw new SignupRejected('Dati di registrazione non validi');}

    const client=await pool.connect();
    let limited=false;
    try {
      await client.query('BEGIN');
      const minute=new Date(Math.floor(now().getTime()/60000)*60000);
      for(const [category,value,max] of [['account',address,3],['network',networkSubject,10]]) {
        const digest=rateLimitSubjectDigest({secret:hmacKey,action:'signup',category,value});
        const r=await client.query(
          "INSERT INTO hollowgate_auth.rate_limit_buckets (action,subject_digest,window_start,hits)"+
          " VALUES ('signup',$1,$2,1) ON CONFLICT (action,subject_digest,window_start)"+
          " DO UPDATE SET hits=hollowgate_auth.rate_limit_buckets.hits+1,updated_at=now() RETURNING hits",
          [digest,minute]);
        if(Number(r.rows[0].hits)>max) limited=true;
      }
      await client.query('COMMIT');
    }catch(err){try{await client.query('ROLLBACK');}catch{}throw err;}
    finally{client.release();}
    if(limited)return ACK;

    const token=issueToken();
    if(!TOKEN_RE.test(token))throw new TypeError('Invalid token generator');
    const digest=createHash('sha256').update(token).digest();
    const encoded=await hashNewPassword(password);
    // DB SECURITY DEFINER function is atomic; duplicate identities never change.
    const registered=await pool.query(
      'SELECT hollowgate_auth.register_local_user($1,$2,$3,$4) AS created',
      [address,displayName.trim(),encoded,digest]);
    if(registered.rows[0]?.created!==true)return ACK;

    const link='https://staging.hollowgate.quest/account/verify-email?token='+encodeURIComponent(token);
    try {
      await mailer.send({
        to:address,
        subject:'Hollowgate - Verifica il tuo indirizzo email',
        text:[
          'Benvenuto su Hollowgate!',
          '',
          'Per confermare la tua registrazione, apri questo link:',
          link,'',
          'Il collegamento è valido per 24 ore e può essere usato una sola volta.',
          'Se non hai richiesto questa registrazione, ignora il messaggio.',
        ].join('\n'),
        idempotencyKey:'signup_'+randomUUID().replaceAll('-',''),
      });
    }catch{
      // Do not disclose whether the identity was created or provider failed.
    }
    return ACK;
  }

  async function verify({token}) {
    if(typeof token!=='string'||!TOKEN_RE.test(token))throw new SignupRejected();
    const digest=createHash('sha256').update(token).digest();
    const result=await pool.query(
      'SELECT hollowgate_auth.confirm_local_email($1) AS confirmed',[digest]);
    if(result.rows[0]?.confirmed!==true)throw new SignupRejected();
    return {status:'ok'};
  }
  return {signup,verify};
}
