import { ensureEnvFile } from '../env-file';

ensureEnvFile();
// Load config only after .env is guaranteed to have a token.
const { loadConfig } = await import('../config');
const { openDb } = await import('../db/client');
const { buildApp } = await import('./app');

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const app = await buildApp({ db, cfg, logger: true });

await app.listen({ host: '127.0.0.1', port: cfg.port });
console.log(`\nquipply-ai API on http://127.0.0.1:${cfg.port}`);
console.log(`Dashboard (dev): http://127.0.0.1:${cfg.devWebPort}`);
if (!cfg.anthropicApiKey) console.log('Note: ANTHROPIC_API_KEY is empty in .env; resume import and Score match need it.');
