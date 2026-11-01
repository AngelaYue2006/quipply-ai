import type { FastifyPluginAsync } from 'fastify';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import type { AppContext } from '../app';
import { PROFILE_SECTION_NAMES, type ProfileSection } from '../../shared/profile';
import { exportProfile, getProfile, importProfile, saveSection } from '../../profile/service';
import {
  UserError,
  acceptImport,
  deleteResume,
  discardImport,
  getImportReview,
  getResume,
  importFromResume,
  listResumes,
  saveResume,
  updateResume,
} from '../../profile/resumes';

const Id = z.object({ id: z.coerce.number().int().positive() });

export const profileRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (app) => {
    const { db, cfg } = ctx;

    app.get('/profile', async () => getProfile(db));

    app.put('/profile/sections/:section', async (req) => {
      const { section } = req.params as { section: string };
      if (!PROFILE_SECTION_NAMES.includes(section as ProfileSection)) throw new UserError('Unknown profile section.', 404);
      return saveSection(db, section as ProfileSection, req.body);
    });

    app.get('/profile/export', async (_req, reply) => {
      reply.header('Content-Disposition', 'attachment; filename="quipply-profile.json"');
      return exportProfile(db);
    });

    app.post('/profile/import', async (req) => importProfile(db, req.body));

    // ---- resumes ----
    app.get('/resumes', async () => listResumes(db));

    app.post('/resumes', async (req) => {
      const file = await req.file();
      if (!file) throw new UserError('No file uploaded.');
      const bytes = await file.toBuffer();
      if (file.file.truncated) throw new UserError('Resume must be 10 MB or smaller.');
      return saveResume(db, cfg, { filename: file.filename, bytes });
    });

    app.patch('/resumes/:id', async (req) => {
      const { id } = Id.parse(req.params);
      const body = z.object({ label: z.string().max(100).optional(), isDefault: z.boolean().optional() }).parse(req.body);
      updateResume(db, id, body);
      return { ok: true };
    });

    app.delete('/resumes/:id', async (req) => {
      deleteResume(db, Id.parse(req.params).id);
      return { ok: true };
    });

    app.get('/resumes/:id/file', async (req, reply) => {
      const row = getResume(db, Id.parse(req.params).id);
      return reply.type('application/pdf').header('Content-Disposition', 'inline').send(createReadStream(row.filePath));
    });

    // ---- resume import ----
    app.post('/resumes/:id/import', async (req) => importFromResume(db, cfg, ctx.llm(), Id.parse(req.params).id));

    app.get('/resume-imports/:id', async (req) => getImportReview(db, Id.parse(req.params).id));

    app.post('/resume-imports/:id/accept', async (req) => {
      const { itemIds } = z.object({ itemIds: z.array(z.string()) }).parse(req.body);
      return acceptImport(db, Id.parse(req.params).id, itemIds);
    });

    app.post('/resume-imports/:id/discard', async (req) => {
      discardImport(db, Id.parse(req.params).id);
      return { ok: true };
    });
  };
