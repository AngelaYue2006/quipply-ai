import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { jobDescriptions, jobs } from '../../db/schema';
import { politely } from '../http';
import {
  DescribeError,
  fetchAshby,
  fetchGreenhouse,
  fetchLever,
  fetchReadable,
  parseAshbyUrl,
  parseGreenhouseUrl,
  parseLeverUrl,
  type Fetched,
  type Fetcher,
} from './fetchers';
import { normalizeText } from './html';

/** Pick the fetcher from the URL: public ATS APIs first, Readability for everything else. */
export async function fetchDescriptionForUrl(url: string, fetchImpl: Fetcher = fetch): Promise<Fetched> {
  const gh = parseGreenhouseUrl(url);
  if (gh) return politely(() => fetchGreenhouse(fetchImpl, gh));
  const lever = parseLeverUrl(url);
  if (lever) return politely(() => fetchLever(fetchImpl, lever));
  const ashby = parseAshbyUrl(url);
  if (ashby) return politely(() => fetchAshby(fetchImpl, ashby));
  return politely(() => fetchReadable(fetchImpl, url));
}

function upsert(db: Db, jobId: number, values: Partial<typeof jobDescriptions.$inferInsert>) {
  const existing = db.select({ id: jobDescriptions.id }).from(jobDescriptions).where(eq(jobDescriptions.jobId, jobId)).get();
  if (existing) db.update(jobDescriptions).set(values).where(eq(jobDescriptions.id, existing.id)).run();
  else db.insert(jobDescriptions).values({ jobId, ...values }).run();
}

/** Fetch and store one job's description. On failure the error is stored and any earlier text is kept. */
export async function fetchAndStoreDescription(db: Db, jobId: number, fetchImpl: Fetcher = fetch) {
  const job = db.select({ url: jobs.url }).from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) throw new DescribeError('Job not found.', 'not_found');
  try {
    const got = await fetchDescriptionForUrl(job.url, fetchImpl);
    upsert(db, jobId, { text: got.text, html: got.html, method: got.method, fetchedAt: Date.now(), error: null });
    return { ok: true as const, method: got.method, length: got.text.length };
  } catch (err) {
    const code = err instanceof DescribeError ? err.code : 'http_error';
    const message = err instanceof Error ? err.message : String(err);
    upsert(db, jobId, { error: `${code}: ${message}`, fetchedAt: Date.now() });
    return { ok: false as const, code, message };
  }
}

export function saveManualDescription(db: Db, jobId: number, text: string) {
  const clean = normalizeText(text);
  upsert(db, jobId, { text: clean || null, html: null, method: clean ? 'manual' : null, fetchedAt: Date.now(), error: null });
}
