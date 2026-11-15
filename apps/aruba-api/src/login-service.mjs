import { createOpaqueSessionToken, hashSessionToken } from './session-token.mjs';
import { canonicalEmail, rateLimitSubjectDigest } from './auth-abuse.mjs';

const GENERIC_ERROR = 'Credenziali non valide';
const ONE_HOUR = 60 * 60 * 1000;
const TTL = 12 * ONE_HOUR;

export class LoginRejected extends Error {
  constructor(status = 401, message = GENERIC_ERROR) {
    super(message);
    this.status = status;
  }
}

// Internal authentication domain service. No public auth routes call it yet.
// An operator must first supply a restricted database role, durable HMAC key,
// HTTPS cookie/origin policy, and a verified migration before enabling routes.
export function createLoginService({ pool, verifyPassword, hmacKey, now = () => new Date(), issueToken = createOpaqueSessionToken }) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('Pool required');
  if (typeof verifyPassword !== 'function') throw new TypeError('Password verifier required');
  if (!Buffer.isBuffer(hmacKey) || hmacKey.length < 32) throw new TypeError('HMAC key required');

  return async function login({ email, password, networkSubject }) {
    if (typeof password !== 'string' || password.length > 256) throw new LoginRejected();
    if (typeof networkSubject !== 'string' || networkSubject.length < 1 || networkSubject.length > 512) throw new LoginRejected();
    let address;
    try { address = canonicalEmail(email); } catch { throw new LoginRejected(); }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const instant = now();
      const minute = new Date(Math.floor(instant.getTime() / 60000) * 60000);
      // Two independent limits: distributed attempts on one account and
      // credential stuffing across many accounts from one network.
      for (const [category, value, threshold] of [
        ['account', address, 5],
        ['network', networkSubject, 20],
      ]) {
        const digest = rateLimitSubjectDigest({ secret:hmacKey, action:'login', category, value });
        const counter = await client.query(
          `INSERT INTO hollowgate_auth.rate_limit_buckets
              (action,subject_digest,window_start,hits)
            VALUES ('login',$1,$2,1)
            ON CONFLICT (action,subject_digest,window_start)
            DO UPDATE SET hits = hollowgate_auth.rate_limit_buckets.hits + 1,updated_at=now()
            RETURNING hits`, [digest, minute]
        );
        if (counter.rows[0].hits > threshold) {
          await client.query('COMMIT');
          throw new LoginRejected(429, 'Troppi tentativi, riprova più tardi');
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      // The rate-limit counters must remain committed even on rejected logins.
      try { await client.query('ROLLBACK'); } catch { /* retain original error */ }
      throw err;
    } finally {
      client.release();
    }

    const row = await pool.query(
      `SELECT u.id, u.status, u.email_verified_at, c.password_hash
       FROM hollowgate_auth.users u
       LEFT JOIN hollowgate_auth.password_credentials c ON c.user_id = u.id
       WHERE u.email=$1`,
      [address]
    );
    const user = row.rows[0];
    // Never allow pending-reset, disabled, unverified or OAuth-only users.
    if (!user || user.status !== 'active' || !user.email_verified_at ||
        !(await verifyPassword(user.password_hash, password))) {
      throw new LoginRejected();
    }

    const token = issueToken();
    const digest = hashSessionToken(token);
    const expiresAt = new Date(now().getTime() + TTL);
    await pool.query(
      `INSERT INTO hollowgate_auth.sessions(user_id,token_hash,expires_at)
       VALUES ($1,$2,$3)`,
      [user.id, digest, expiresAt]
    );
    return { token, expiresAt, userId:user.id };
  };
}
