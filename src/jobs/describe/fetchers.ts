import { Readability } from '@mozilla/readability';
import type { DescriptionMethod } from '../../shared/job';
import { USER_AGENT } from '../http';
import { decodeEntities, htmlToText, normalizeText, quietDom } from './html';

export type Fetched = { text: string; html: string | null; method: DescriptionMethod };
export type Fetcher = typeof fetch;

export class DescribeError extends Error {
  constructor(
    message: string,
    readonly code: 'needs_browser' | 'not_found' | 'http_error',
  ) {
    super(message);
  }
}

/** Below this many characters, a Readability result is probably a JavaScript shell, not the posting. */
export const MIN_READABLE_CHARS = 500;

async function getJson(fetchImpl: Fetcher, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (res.status === 404) throw new DescribeError('The posting was not found (it may be closed).', 'not_found');
  if (!res.ok) throw new DescribeError(`HTTP ${res.status} from ${new URL(url).host}`, 'http_error');
  return res.json();
}

// ---------- Greenhouse: boards-api.greenhouse.io/v1/boards/<board>/jobs/<id> (verified 2026-11-01) ----------

export function parseGreenhouseUrl(raw: string): { board: string; jobId: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  // EU boards (*.eu.greenhouse.io) have no public API host that resolves, so they fall back to Readability.
  if (!/^(job-boards|boards)\.greenhouse\.io$/.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'embed') {
    const board = u.searchParams.get('for');
    const token = u.searchParams.get('token');
    return board && token && /^\d+$/.test(token) ? { board, jobId: token } : null;
  }
  if (parts.length >= 3 && parts[1] === 'jobs' && /^\d+$/.test(parts[2]!)) return { board: parts[0]!, jobId: parts[2]! };
  const ghJid = u.searchParams.get('gh_jid');
  if (parts.length >= 1 && ghJid && /^\d+$/.test(ghJid)) return { board: parts[0]!, jobId: ghJid };
  return null;
}

export async function fetchGreenhouse(fetchImpl: Fetcher, ref: { board: string; jobId: string }): Promise<Fetched> {
  const data = (await getJson(
    fetchImpl,
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.board)}/jobs/${ref.jobId}`,
  )) as { content?: string };
  if (!data.content) throw new DescribeError('Greenhouse returned no description.', 'not_found');
  // The API returns entity-escaped HTML ("&lt;p&gt;").
  const html = data.content.includes('&lt;') ? decodeEntities(data.content) : data.content;
  return { text: htmlToText(html), html, method: 'greenhouse_api' };
}

// ---------- Lever: api.lever.co/v0/postings/<company>/<id> (verified 2026-11-01) ----------

export function parseLeverUrl(raw: string): { company: string; postingId: string; eu: boolean } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const m = /^jobs\.(eu\.)?lever\.co$/.exec(u.hostname);
  if (!m) return null;
  const [company, postingId] = u.pathname.split('/').filter(Boolean);
  if (!company || !postingId || !/^[0-9a-f-]{36}$/i.test(postingId)) return null;
  return { company, postingId, eu: Boolean(m[1]) };
}

type LeverPosting = { description?: string; lists?: { text: string; content: string }[]; additional?: string };

export async function fetchLever(fetchImpl: Fetcher, ref: { company: string; postingId: string; eu: boolean }): Promise<Fetched> {
  const host = ref.eu ? 'api.eu.lever.co' : 'api.lever.co';
  const p = (await getJson(fetchImpl, `https://${host}/v0/postings/${encodeURIComponent(ref.company)}/${ref.postingId}`)) as LeverPosting;
  const html = [
    p.description ?? '',
    ...(p.lists ?? []).map((l) => `<h3>${l.text}</h3><ul>${l.content}</ul>`),
    p.additional ?? '',
  ].join('\n');
  const text = htmlToText(html);
  if (!text) throw new DescribeError('Lever returned no description.', 'not_found');
  return { text, html, method: 'lever_api' };
}

// ---------- Ashby: api.ashbyhq.com/posting-api/job-board/<board> (verified 2026-11-01) ----------

export function parseAshbyUrl(raw: string): { board: string; jobId: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.hostname !== 'jobs.ashbyhq.com') return null;
  const [board, jobId] = u.pathname.split('/').filter(Boolean);
  if (!board || !jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return null;
  return { board, jobId };
}

type AshbyBoard = { jobs?: { id: string; descriptionHtml?: string; descriptionPlain?: string }[] };

export async function fetchAshby(fetchImpl: Fetcher, ref: { board: string; jobId: string }): Promise<Fetched> {
  const data = (await getJson(
    fetchImpl,
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.board)}`,
  )) as AshbyBoard;
  const job = data.jobs?.find((j) => j.id.toLowerCase() === ref.jobId.toLowerCase());
  if (!job) throw new DescribeError('The posting is no longer on the Ashby board (it may be closed).', 'not_found');
  const html = job.descriptionHtml ?? null;
  const text = html ? htmlToText(html) : normalizeText(job.descriptionPlain ?? '');
  if (!text) throw new DescribeError('Ashby returned no description.', 'not_found');
  return { text, html, method: 'ashby_api' };
}

// ---------- Anything else: fetch the page and extract the main text with Readability ----------

export async function fetchReadable(fetchImpl: Fetcher, url: string): Promise<Fetched> {
  const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, redirect: 'follow' });
  if (res.status === 404) throw new DescribeError('The posting page was not found (it may be closed).', 'not_found');
  if (!res.ok) throw new DescribeError(`HTTP ${res.status} from ${new URL(url).host}`, 'http_error');
  const page = await res.text();
  const doc = quietDom(page, res.url || url).window.document;
  const article = new Readability(doc).parse();
  const text = article?.content ? htmlToText(article.content) : '';
  if (text.length < MIN_READABLE_CHARS) {
    throw new DescribeError(
      'This page needs a real browser to render its description. Open the posting and paste the description instead.',
      'needs_browser',
    );
  }
  return { text, html: article?.content ?? null, method: 'readability' };
}
