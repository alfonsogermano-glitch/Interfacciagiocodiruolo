import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createApp } from './app.mjs';
import { verifyPassword } from './password.mjs';
import { createLoginService } from './login-service.mjs';
import { createSessionRepository } from './session-repository.mjs';
import { createAuthHttpHandler } from './auth-http.mjs';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error('Missing required environment variable: ' + name);
  return value;
};

async function main() {
  const password = (await readFile(required('POSTGRES_PASSWORD_FILE'), 'utf8')).trim();
  if (!password) throw new Error('Empty database password file');

  const pool = new Pool({
    host: required('PGHOST'),
    port: Number(process.env.PGPORT ?? 5432),
    user: required('PGUSER'),
    database: required('PGDATABASE'),
    password,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', () => { /* idle connection error: readiness endpoint reports status */ });

  // Never enable auth on the main API, on another database, or with an owner role.
  let authHandler = null;
  if (process.env.AUTH_STAGING_ENABLED === 'true') {
    if (process.env.PGDATABASE !== 'hollowgate_auth_test' ||
        process.env.PGUSER !== 'hollowgate_auth_app') {
      throw new Error('Auth staging requires the dedicated test database and restricted user');
    }
    const keyPath = required('AUTH_RATE_LIMIT_KEY_FILE');
    const hmacKey = await readFile(keyPath);
    if (hmacKey.length < 32) throw new Error('Auth rate-limit key is too short');
    const origin = required('AUTH_ORIGIN');
    const login = createLoginService({pool, verifyPassword, hmacKey});
    const {getSessionUser, revokeSession} = createSessionRepository({pool});
    authHandler = createAuthHttpHandler({origin, login, getSessionUser, revokeSession});
  } else if (process.env.AUTH_STAGING_ENABLED) {
    throw new Error('Unsupported AUTH_STAGING_ENABLED value');
  }

  const app = createApp({ checkDatabase: () => pool.query('SELECT 1'), authHandler });
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, '0.0.0.0', () => console.log('Hollowgate API listening'));

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    app.close(async () => {
      try {
        await pool.end();
        process.exitCode = 0;
      } catch {
        process.exitCode = 1;
      }
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
main().catch((error) => {
  console.error('Failed to start Hollowgate API:', error.message);
  process.exitCode = 1;
});
