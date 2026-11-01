import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app';
import { JobPatch, USER_STATUSES } from '../../shared/job';
import { latestPull, pullJobs } from '../../jobs/pull';
import { bulkSetStatus, getJobDetail, listJobs, patchJob } from '../../jobs/queries';
import { fetchAndStoreDescription, saveManualDescription } from '../../jobs/describe';
import { activeMatcher, scoreJob } from '../../match/service';
import { UserError } from '../../profile/resumes';

const Id = z.object({ id: z.coerce.number().int().positive() });

export const jobRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (app) => {
    const { db, cfg } = ctx;
    let pulling = false;

    app.get('/jobs', async (req) => {
      const { includeClosed } = z.object({ includeClosed: z.enum(['0', '1']).optional() }).parse(req.query);
      return { jobs: listJobs(db, { includeClosed: includeClosed === '1' }), lastPull: latestPull(db) };
    });

    app.post('/jobs/pull', async (req) => {
      const body = z.object({ windowDays: z.number().int().min(0).max(3650).optional() }).parse(req.body ?? {});
      if (pulling) throw new UserError('A pull is already running.', 409);
      pulling = true;
      try {
        return await pullJobs(db, ctx.source(), { windowDays: body.windowDays ?? cfg.pullWindowDays });
      } finally {
        pulling = false;
      }
    });

    app.get('/jobs/pulls/latest', async () => latestPull(db));

    app.get('/jobs/:id', async (req) => {
      const detail = getJobDetail(db, Id.parse(req.params).id);
      if (!detail) throw new UserError('Job not found.', 404);
      return detail;
    });

    app.patch('/jobs/:id', async (req) => {
      const { id } = Id.parse(req.params);
      if (!patchJob(db, id, JobPatch.parse(req.body))) throw new UserError('Job not found.', 404);
      return getJobDetail(db, id);
    });

    app.post('/jobs/bulk-status', async (req) => {
      const body = z.object({ ids: z.array(z.number().int().positive()).max(10_000), userStatus: z.enum(USER_STATUSES) }).parse(req.body);
      return { changed: bulkSetStatus(db, body.ids, body.userStatus) };
    });

    app.post('/jobs/:id/description/fetch', async (req) => {
      const { id } = Id.parse(req.params);
      const result = await fetchAndStoreDescription(db, id, ctx.fetchImpl);
      return { result, job: getJobDetail(db, id) };
    });

    app.put('/jobs/:id/description', async (req) => {
      const { id } = Id.parse(req.params);
      const { text } = z.object({ text: z.string().max(100_000) }).parse(req.body);
      if (!getJobDetail(db, id)) throw new UserError('Job not found.', 404);
      saveManualDescription(db, id, text);
      return getJobDetail(db, id);
    });

    app.post('/jobs/:id/match', async (req) => {
      const { id } = Id.parse(req.params);
      if (!getJobDetail(db, id)) throw new UserError('Job not found.', 404);
      await scoreJob(db, activeMatcher(db, cfg, ctx.llm()), id);
      return getJobDetail(db, id);
    });
  };
