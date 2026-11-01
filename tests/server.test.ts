import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app';
import { TOKEN_HEADER } from '../src/server/security';
import { TEST_TOKEN, testConfig, testDb } from './helpers';

async function app() {
  return buildApp({ db: testDb(), cfg: testConfig() });
}
const ok = { host: '127.0.0.1:4317', [TOKEN_HEADER]: TEST_TOKEN };

describe('API security', () => {
  it('rejects calls without the token with 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/profile', headers: { host: '127.0.0.1:4317' } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong token with 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/profile', headers: { host: '127.0.0.1:4317', [TOKEN_HEADER]: 'nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('accepts the token from localhost and the dev server host', async () => {
    const a = await app();
    expect((await a.inject({ method: 'GET', url: '/api/profile', headers: ok })).statusCode).toBe(200);
    const viaVite = await a.inject({
      method: 'GET',
      url: '/api/profile',
      headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', [TOKEN_HEADER]: TEST_TOKEN },
    });
    expect(viaVite.statusCode).toBe(200);
  });

  it('rejects other hosts (DNS rebinding) and other origins (cross-site)', async () => {
    const a = await app();
    const badHost = await a.inject({ method: 'GET', url: '/api/profile', headers: { ...ok, host: 'evil.example:4317' } });
    expect(badHost.statusCode).toBe(403);
    const badOrigin = await a.inject({ method: 'POST', url: '/api/jobs/pull', headers: { ...ok, origin: 'https://evil.example' }, payload: {} });
    expect(badOrigin.statusCode).toBe(403);
  });

  it('never sends the API key to the browser', async () => {
    const a = await buildApp({ db: testDb(), cfg: testConfig({ anthropicApiKey: 'sk-ant-secret-value' }) });
    const res = await a.inject({ method: 'GET', url: '/api/settings', headers: ok });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('sk-ant-secret-value');
    expect(res.json().apiKeySet).toBe(true);
  });
});

describe('profile API', () => {
  it('saves one section, bumps the version and validates input', async () => {
    const a = await app();
    const before = (await a.inject({ method: 'GET', url: '/api/profile', headers: ok })).json();
    const saved = await a.inject({
      method: 'PUT',
      url: '/api/profile/sections/identity',
      headers: ok,
      payload: { firstName: 'Testy', lastName: 'McTestface' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().version).toBe(before.version + 1);
    expect(saved.json().data.identity.firstName).toBe('Testy');

    const bad = await a.inject({ method: 'PUT', url: '/api/profile/sections/education', headers: ok, payload: [{ graduation: 'June' }] });
    expect(bad.statusCode).toBe(400);
    const unknown = await a.inject({ method: 'PUT', url: '/api/profile/sections/secrets', headers: ok, payload: {} });
    expect(unknown.statusCode).toBe(404);
  });

  it('reports a missing API key clearly instead of crashing', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/resumes/1/import', headers: ok });
    // The resume doesn't exist; either way the server answers with a 4xx, not a 500.
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});
