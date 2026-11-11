import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createApp } from './app.mjs';

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

  const app = createApp({ checkDatabase: () => pool.query('SELECT 1') });
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
