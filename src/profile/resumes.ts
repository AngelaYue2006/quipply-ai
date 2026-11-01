import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { and, desc, eq, ne } from 'drizzle-orm';
import { extractText } from 'unpdf';
import type { Db } from '../db/client';
import { resumeImports, resumes } from '../db/schema';
import type { AppConfig } from '../config';
import type { LlmClient } from '../llm/client';
import { loadPrompt, structured } from '../llm/structured';
import { ResumeDraft, applyDraftItems, buildDraftItems, normalizeDraft } from './resume-draft';
import { getProfile, writeProfile } from './service';

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const IMPORT_PROMPT_VERSION = 'resume-import@1';

export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Plain text of a PDF, without any model. Empty string if the PDF has no text layer. */
export async function pdfToText(bytes: Buffer): Promise<string> {
  try {
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
    return text.replace(/[ \t]+\n/g, '\n').trim();
  } catch {
    return '';
  }
}

export function listResumes(db: Db) {
  return db
    .select({
      id: resumes.id,
      originalName: resumes.originalName,
      label: resumes.label,
      isDefault: resumes.isDefault,
      createdAt: resumes.createdAt,
      textLength: resumes.extractedText,
    })
    .from(resumes)
    .orderBy(desc(resumes.createdAt))
    .all()
    .map((r) => ({ ...r, textLength: r.textLength.length }));
}

export async function saveResume(db: Db, cfg: AppConfig, file: { filename: string; bytes: Buffer }) {
  if (file.bytes.length > MAX_RESUME_BYTES) throw new UserError('Resume must be 10 MB or smaller.');
  if (file.bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new UserError('Only PDF resumes are supported.');
  mkdirSync(cfg.resumesDir, { recursive: true });
  const filePath = path.join(cfg.resumesDir, `${randomUUID()}.pdf`);
  writeFileSync(filePath, file.bytes);
  const extractedText = await pdfToText(file.bytes);
  const isFirst = db.select({ id: resumes.id }).from(resumes).limit(1).all().length === 0;
  return db
    .insert(resumes)
    .values({
      filePath,
      originalName: path.basename(file.filename).slice(0, 200),
      label: '',
      isDefault: isFirst,
      extractedText,
    })
    .returning({ id: resumes.id })
    .get();
}

export function getResume(db: Db, id: number) {
  const row = db.select().from(resumes).where(eq(resumes.id, id)).get();
  if (!row) throw new UserError('Resume not found.', 404);
  return row;
}

export function updateResume(db: Db, id: number, patch: { label?: string; isDefault?: boolean }) {
  getResume(db, id);
  db.transaction((tx) => {
    if (patch.isDefault) tx.update(resumes).set({ isDefault: false }).where(ne(resumes.id, id)).run();
    tx.update(resumes)
      .set({ ...(patch.label !== undefined && { label: patch.label }), ...(patch.isDefault !== undefined && { isDefault: patch.isDefault }) })
      .where(eq(resumes.id, id))
      .run();
  });
}

export function deleteResume(db: Db, id: number) {
  const row = getResume(db, id);
  db.delete(resumes).where(eq(resumes.id, id)).run();
  rmSync(row.filePath, { force: true });
  if (row.isDefault) {
    const next = db.select({ id: resumes.id }).from(resumes).orderBy(desc(resumes.createdAt)).limit(1).get();
    if (next) db.update(resumes).set({ isDefault: true }).where(eq(resumes.id, next.id)).run();
  }
}

/** Send the PDF to the model and store the result as a pending draft. Nothing touches the profile yet. */
export async function importFromResume(db: Db, cfg: AppConfig, client: LlmClient, resumeId: number) {
  const row = getResume(db, resumeId);
  const base64 = readFileSync(row.filePath).toString('base64');
  const result = await structured({
    db,
    client,
    action: 'resume_import',
    model: cfg.importModel,
    promptVersion: IMPORT_PROMPT_VERSION,
    system: loadPrompt(IMPORT_PROMPT_VERSION),
    userText: 'Extract the profile sections from the attached resume.',
    documents: [{ kind: 'pdf', base64 }],
    schema: ResumeDraft,
  });
  const draft = normalizeDraft(result.data);
  return db
    .insert(resumeImports)
    .values({ resumeId, draft, status: 'pending', llmCallId: result.callId })
    .returning({ id: resumeImports.id })
    .get();
}

function getImport(db: Db, id: number) {
  const row = db.select().from(resumeImports).where(eq(resumeImports.id, id)).get();
  if (!row) throw new UserError('Import not found.', 404);
  return row;
}

export function getImportReview(db: Db, id: number) {
  const row = getImport(db, id);
  const { data } = getProfile(db);
  const items = row.status === 'pending' ? buildDraftItems(data, ResumeDraft.parse(row.draft)) : [];
  return { id: row.id, resumeId: row.resumeId, status: row.status, createdAt: row.createdAt, items: items.map(({ op: _op, ...rest }) => rest) };
}

export function acceptImport(db: Db, id: number, itemIds: string[]) {
  const row = getImport(db, id);
  if (row.status !== 'pending') throw new UserError('This import was already accepted or discarded.');
  const current = getProfile(db);
  const next = applyDraftItems(current.data, ResumeDraft.parse(row.draft), itemIds);
  const saved = writeProfile(db, next);
  db.update(resumeImports)
    .set({ status: 'accepted' })
    .where(and(eq(resumeImports.id, id), eq(resumeImports.status, 'pending')))
    .run();
  return saved;
}

export function discardImport(db: Db, id: number) {
  getImport(db, id);
  db.update(resumeImports).set({ status: 'discarded' }).where(eq(resumeImports.id, id)).run();
}
