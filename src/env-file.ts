import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const ENV_PATH = path.join(ROOT, '.env');
const EXAMPLE_PATH = path.join(ROOT, '.env.example');

/** Make sure .env exists and has a non-empty QUIPPLY_TOKEN. Safe to call repeatedly. */
export function ensureEnvFile(): { created: boolean; tokenGenerated: boolean } {
  let created = false;
  if (!existsSync(ENV_PATH)) {
    if (existsSync(EXAMPLE_PATH)) copyFileSync(EXAMPLE_PATH, ENV_PATH);
    else writeFileSync(ENV_PATH, '');
    created = true;
  }
  const text = readFileSync(ENV_PATH, 'utf8');
  const match = /^QUIPPLY_TOKEN=(.*)$/m.exec(text);
  if (match && match[1]!.trim()) return { created, tokenGenerated: false };

  const token = randomBytes(24).toString('hex');
  const next = match
    ? text.replace(/^QUIPPLY_TOKEN=.*$/m, `QUIPPLY_TOKEN=${token}`)
    : `${text.trimEnd()}\nQUIPPLY_TOKEN=${token}\n`;
  writeFileSync(ENV_PATH, next);
  return { created, tokenGenerated: true };
}

/** Read the token straight from .env (used by the Vite dev server to inject it into the page). */
export function readTokenFromEnvFile(): string {
  if (!existsSync(ENV_PATH)) return '';
  const match = /^QUIPPLY_TOKEN=(.*)$/m.exec(readFileSync(ENV_PATH, 'utf8'));
  return match ? match[1]!.trim() : '';
}
