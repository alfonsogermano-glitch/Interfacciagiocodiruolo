import { hashSessionToken } from './session-token.mjs';

// Authenticated session queries are bound to the PostgreSQL database clock.
// Never trust user IDs or roles sent by a browser or a stale JWT.
const FIND = `
SELECT u.id, u.email, u.display_name, COALESCE(r.role, 'standard') AS role
FROM hollowgate_auth.sessions s
JOIN hollowgate_auth.users u ON u.id = s.user_id
LEFT JOIN hollowgate_auth.user_roles r ON r.user_id = u.id
WHERE s.token_hash = $1
  AND s.revoked_at IS NULL
  AND s.expires_at > now()
  AND u.status = 'active'
  AND u.email_verified_at IS NOT NULL
LIMIT 1
`;

const REVOKE = `
UPDATE hollowgate_auth.sessions
SET revoked_at = now()
WHERE token_hash = $1
  AND revoked_at IS NULL
  AND expires_at > now()
RETURNING user_id
`;

export function createSessionRepository({pool}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('PostgreSQL pool required');
  return {
    async getSessionUser(token) {
      let digest;
      try { digest = hashSessionToken(token); } catch { return null; }
      const result = await pool.query(FIND, [digest]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role === 'admin' ? 'admin' : 'standard',
      };
    },
    async revokeSession(token) {
      let digest;
      try { digest = hashSessionToken(token); } catch { return false; }
      const result = await pool.query(REVOKE, [digest]);
      return result.rowCount === 1;
    },
  };
}
