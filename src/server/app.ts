import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import type { AppConfig } from '../config';
import type { Db } from '../db/client';
import { AnthropicLlmClient, LlmError, type LlmClient } from '../llm/client';
import { UserError, MAX_RESUME_BYTES } from '../profile/resumes';
import type { JobSource } from '../jobs/sources/types';
import { SimplifyInternshipsSource } from '../jobs/sources/simplify-internships';
import { registerSecurity } from './security';
import { profileRoutes } from './routes/profile';
import { jobRoutes } from './routes/jobs';
import { settingsRoutes } from './routes/settings';

export type AppContext = {
  db: Db;
  cfg: AppConfig;
  /** Created on first use so a missing API key only fails the action that needs it. */
  llm: () => LlmClient;
  source: () => JobSource;
  fetchImpl: typeof fetch;
};

export type BuildOptions = {
  db: Db;
  cfg: AppConfig;
  llm?: LlmClient;
  source?: JobSource;
  fetchImpl?: typeof fetch;
  logger?: boolean;
};

export async function buildApp(opts: BuildOptions): Promise<FastifyInstance> {
  // Logs carry method, URL and status only; never request bodies, profile contents or resume text.
  const app = Fastify({ logger: opts.logger ? { level: 'info' } : false, bodyLimit: 5 * 1024 * 1024 });
  let llm: LlmClient | undefined = opts.llm;
  const ctx: AppContext = {
    db: opts.db,
    cfg: opts.cfg,
    llm: () => (llm ??= new AnthropicLlmClient(opts.cfg.anthropicApiKey)),
    source: () => opts.source ?? new SimplifyInternshipsSource(opts.cfg.listingsUrl, opts.fetchImpl),
    fetchImpl: opts.fetchImpl ?? fetch,
  };

  registerSecurity(app, opts.cfg);
  await app.register(multipart, { limits: { fileSize: MAX_RESUME_BYTES, files: 1 } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid input.', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (err instanceof UserError) return reply.code(err.status).send({ error: err.message });
    if (err instanceof LlmError) return reply.code(err.code === 'no_api_key' ? 400 : 502).send({ error: err.message, code: err.code });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on the server.' });
  });

  await app.register(profileRoutes(ctx), { prefix: '/api' });
  await app.register(jobRoutes(ctx), { prefix: '/api' });
  await app.register(settingsRoutes(ctx), { prefix: '/api' });

  // Production: serve the built dashboard, with the token injected into index.html.
  const webDir = path.resolve('dist/web');
  if (existsSync(path.join(webDir, 'index.html'))) {
    const indexHtml = readFileSync(path.join(webDir, 'index.html'), 'utf8').replace('__QUIPPLY_TOKEN__', opts.cfg.token);
    await app.register(fastifyStatic, { root: webDir, index: false, wildcard: false, prefix: '/' });
    const sendIndex = (_req: unknown, reply: import('fastify').FastifyReply) =>
      reply.type('text/html').header('Cache-Control', 'no-store').send(indexHtml);
    app.get('/', sendIndex);
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found.' });
      if (req.url.startsWith('/assets/')) return reply.code(404).send('Not found');
      return sendIndex(req, reply);
    });
  } else {
    app.get('/', async (_req, reply) =>
      reply.type('text/plain').send('Dashboard not built. In development, open the Vite URL printed by `pnpm dev`; or run `pnpm build`.'),
    );
  }
  return app;
}
