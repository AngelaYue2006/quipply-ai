import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config';

export const TOKEN_HEADER = 'x-quipply-token';

/** Hosts and origins the dashboard can be served from: the server itself and the Vite dev server. */
export function allowedHosts(cfg: Pick<AppConfig, 'port' | 'devWebPort'>) {
  const hosts = [cfg.port, cfg.devWebPort].flatMap((p) => [`127.0.0.1:${p}`, `localhost:${p}`]);
  return { hosts: new Set(hosts), origins: new Set(hosts.map((h) => `http://${h}`)) };
}

function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Localhost is reachable from any website, so treat the API as exposed:
 * check Host (blocks DNS rebinding), check Origin (blocks cross-site requests), require the token.
 */
export function registerSecurity(app: FastifyInstance, cfg: AppConfig) {
  const { hosts, origins } = allowedHosts(cfg);
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host ?? '';
    if (!hosts.has(host)) return reply.code(403).send({ error: 'Host not allowed.' });
    const origin = req.headers.origin;
    if (origin !== undefined && !origins.has(origin)) return reply.code(403).send({ error: 'Origin not allowed.' });
    if (!req.url.startsWith('/api/')) return;
    const token = req.headers[TOKEN_HEADER];
    if (!cfg.token || typeof token !== 'string' || !sameToken(token, cfg.token)) {
      return reply.code(401).send({ error: 'Missing or invalid token.' });
    }
  });
}
