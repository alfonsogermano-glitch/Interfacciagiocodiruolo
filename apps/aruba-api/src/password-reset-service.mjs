import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { canonicalEmail, rateLimitSubjectDigest, publicPasswordResetAcknowledgement } from './auth-abuse.mjs';
import { hashPassword, validateNewPassword } from './password.mjs';
import { createPasswordActionEmail } from './transactional-mail.mjs';

const ACK = publicPasswordResetAcknowledgement();
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export class PasswordActionRejected extends Error {
  constructor(message = 'Collegamento non valido o scaduto') {
    super(message);
    this.status = 400;
  }
}

export function createPasswordResetService({
  pool, mailer, hmacKey, now = () => new Date(),
  issueToken = () => randomBytes(32).toString('base64url'),
  hashNewPassword = hashPassword,
}) {
  if (typeof pool?.connect !== 'function' || typeof pool?.query !== 'function') throw new TypeError('Pool required');
  if (typeof mailer?.send !== 'function') throw new TypeError('Mailer required');
  if (!Buffer.isBuffer(hmacKey) || hmacKey.length < 32) throw new TypeError('HMAC key required');

  async function request({email, networkSubject}) {
    if (typeof networkSubject !== 'string' || !networkSubject || networkSubject.length > 512) {
      throw new PasswordActionRejected('Richiesta non valida');
    }
    let address;
    try { address = canonicalEmail(email); } catch { return ACK; }
    const bucket = new Date(Math.floor(now().getTime() / 60000) * 60000);
    const client = await pool.connect();
    let limited = false;
    try {
      await client.query('BEGIN');
      for (const [category,value,threshold] of [['account',address,3],['network',networkSubject,10]]) {
        const digest = rateLimitSubjectDigest({secret:hmacKey,action:'password_reset',category,value});
        const r = await client.query(
          "INSERT INTO hollowgate_auth.rate_limit_buckets (action,subject_digest,window_start,hits) " +
          "VALUES ('password_reset',$1,$2,1) " +
          "ON CONFLICT (action,subject_digest,window_start) " +
          "DO UPDATE SET hits=hollowgate_auth.rate_limit_buckets.hits+1,updated_at=now() RETURNING hits",
          [digest,bucket]);
        if (Number(r.rows[0].hits) > threshold) limited = true;
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally { client.release(); }
    if (limited) return ACK;

    const found = await pool.query(
      "SELECT id FROM hollowgate_auth.users WHERE email=$1 AND status='active' AND email_verified_at IS NOT NULL",
      [address]);
    if (found.rowCount !== 1) return ACK;
    const token = issueToken();
    if (!TOKEN_REGEX.test(token)) throw new TypeError('Invalid token generator');
    const digest = createHash('sha256').update(token).digest();
    await pool.query(
      "INSERT INTO hollowgate_auth.password_actions (user_id,purpose,token_hash,expires_at) " +
      "VALUES ($1,'password_reset',$2,$3)",
      [found.rows[0].id,digest,new Date(now().getTime()+30*60*1000)]);
    const body = createPasswordActionEmail({purpose:'password_reset',token});
    try {
      await mailer.send({to:address,subject:body.subject,text:body.text,
        idempotencyKey:'pwreset_'+randomUUID().replaceAll('-','')});
    } catch {
      // Email provider failures cannot reveal whether the address exists.
    }
    return ACK;
  }

  async function redeem({token,newPassword}) {
    if (typeof token !== 'string' || !TOKEN_REGEX.test(token)) throw new PasswordActionRejected();
    try { validateNewPassword(newPassword); }
    catch { throw new PasswordActionRejected('Password non valida: minimo 12 caratteri'); }
    const encoded = await hashNewPassword(newPassword);
    const digest = createHash('sha256').update(token).digest();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const claim = await client.query(
        "UPDATE hollowgate_auth.password_actions p SET consumed_at=now() " +
        "WHERE p.token_hash=$1 AND p.purpose='password_reset' AND p.consumed_at IS NULL " +
        "AND p.expires_at > now() AND EXISTS " +
        "(SELECT 1 FROM hollowgate_auth.users u WHERE u.id=p.user_id " +
        "AND u.status='active' AND u.email_verified_at IS NOT NULL) RETURNING p.user_id",
        [digest]);
      if (claim.rowCount !== 1) throw new PasswordActionRejected();
      const id=claim.rows[0].user_id;
      await client.query(
        "INSERT INTO hollowgate_auth.password_credentials (user_id,password_hash) VALUES ($1,$2) " +
        "ON CONFLICT (user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,changed_at=now()",
        [id,encoded]);
      await client.query(
        "UPDATE hollowgate_auth.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [id]);
      await client.query('COMMIT');
      return {status:'ok'};
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {client.release();}
  }
  return {request,redeem};
}
