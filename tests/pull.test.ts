import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { jobs } from '../src/db/schema';
import { pullJobs } from '../src/jobs/pull';
import { listJobs, patchJob } from '../src/jobs/queries';
import { detectAts } from '../src/jobs/ats';
import { SimplifyInternshipsSource } from '../src/jobs/sources/simplify-internships';
import { FakeSource, fixtureJson, testDb } from './helpers';

type Entry = { id: string; active: boolean; is_visible: boolean; date_posted: number; url: string };
const SLICE = fixtureJson<unknown[]>('listings-slice.json');
const VALID = SLICE.filter((e): e is Entry => typeof e === 'object' && e !== null && 'date_posted' in e && typeof (e as Entry).active === 'boolean');
const NEWEST = Math.max(...VALID.map((e) => e.date_posted));
const NOW = (NEWEST + 3600) * 1000;
const activeWithin = (days: number | null) =>
  VALID.filter((e) => e.active && e.is_visible && (days === null || e.date_posted >= NOW / 1000 - days * 86400)).length;

describe('pullJobs', () => {
  it('adds active postings inside the window, counts malformed entries, and maps ATS types', async () => {
    const db = testDb();
    const res = await pullJobs(db, new FakeSource(SLICE), { windowDays: 7, now: NOW });
    expect(res.added).toBe(activeWithin(7));
    expect(res.added).toBeGreaterThan(0);
    expect(res.malformed).toBe(3);
    expect(res.updated).toBe(0);
    expect(res.closed).toBe(0);
    const rows = db.select().from(jobs).all();
    expect(rows.every((r) => r.active)).toBe(true);
    for (const r of rows) expect(r.atsType).toBe(detectAts(r.url));
    expect(listJobs(db).every((j) => j.isNew)).toBe(true);
  });

  it('a second pull right after reports no changes (304 via ETag)', async () => {
    const db = testDb();
    const source = new FakeSource(SLICE);
    await pullJobs(db, source, { windowDays: 7, now: NOW });
    const second = await pullJobs(db, source, { windowDays: 7, now: NOW });
    expect(second).toMatchObject({ notModified: true, added: 0, updated: 0, closed: 0 });
    expect(source.calls[1]!.etag).toBe('"v1"');
  });

  it('without an ETag, re-pulling the same file still reports no changes', async () => {
    const db = testDb();
    const source = new FakeSource(SLICE, null);
    await pullJobs(db, source, { windowDays: 7, now: NOW });
    const second = await pullJobs(db, source, { windowDays: 7, now: NOW });
    expect(second).toMatchObject({ notModified: false, added: 0, updated: 0, closed: 0 });
    expect(listJobs(db).some((j) => j.isNew)).toBe(false); // nothing is new since the last pull
  });

  it('widening the window skips the ETag shortcut and adds older postings', async () => {
    const db = testDb();
    const source = new FakeSource(SLICE);
    await pullJobs(db, source, { windowDays: 3, now: NOW });
    const wider = await pullJobs(db, source, { windowDays: 30, now: NOW });
    expect(source.calls[1]!.etag).toBeNull();
    expect(wider.added).toBe(activeWithin(30) - activeWithin(3));
    const all = await pullJobs(db, source, { windowDays: null, now: NOW });
    expect(all.added).toBe(activeWithin(null) - activeWithin(30));
    expect(db.select().from(jobs).all()).toHaveLength(activeWithin(null));
  });

  it('marks stored postings closed when they go inactive or disappear, and updates changed ones', async () => {
    const db = testDb();
    const source = new FakeSource(SLICE, null);
    await pullJobs(db, source, { windowDays: 7, now: NOW });
    const stored = db.select().from(jobs).all();
    const [a, b, c] = stored;
    const entries = structuredClone(SLICE) as Record<string, unknown>[];
    const find = (id: string) => entries.find((e) => e && (e as { id?: string }).id === id)!;
    find(a!.sourceListingId).active = false;
    find(b!.sourceListingId).title = 'Renamed Intern';
    source.entries = entries.filter((e) => (e as { id?: string })?.id !== c!.sourceListingId);

    patchJob(db, b!.id, { userStatus: 'interested', notes: 'keep me' });
    const res = await pullJobs(db, source, { windowDays: 7, now: NOW });
    expect(res).toMatchObject({ added: 0, updated: 1, closed: 2 });
    expect(db.select().from(jobs).where(eq(jobs.id, a!.id)).get()!.active).toBe(false);
    expect(db.select().from(jobs).where(eq(jobs.id, c!.id)).get()!.active).toBe(false);
    const renamed = db.select().from(jobs).where(eq(jobs.id, b!.id)).get()!;
    expect(renamed).toMatchObject({ title: 'Renamed Intern', userStatus: 'interested', notes: 'keep me' });
    expect(listJobs(db).find((j) => j.id === a!.id)).toBeUndefined();
    expect(listJobs(db, { includeClosed: true }).find((j) => j.id === a!.id)).toBeDefined();
  });

  it('records a failed pull with its error', async () => {
    const db = testDb();
    const source = { id: 'simplify-internships', pull: async () => Promise.reject(new Error('boom')) };
    await expect(pullJobs(db, source, { windowDays: 7, now: NOW })).rejects.toThrow('boom');
  });
});

describe('SimplifyInternshipsSource', () => {
  it('sends If-None-Match and treats 304 as not modified', async () => {
    let seen: string | null = null;
    const impl = (async (_url: string, init?: RequestInit) => {
      seen = new Headers(init?.headers).get('if-none-match');
      return new Response(null, { status: 304 });
    }) as typeof fetch;
    const res = await new SimplifyInternshipsSource('https://example.test/listings.json', impl).pull({ etag: '"abc"' });
    expect(seen).toBe('"abc"');
    expect(res.notModified).toBe(true);
  });
});

describe('detectAts', () => {
  it.each([
    ['https://ngc.wd1.myworkdayjobs.com/x/job/y', 'workday'],
    ['https://wd5.myworkdaysite.com/recruiting/x', 'workday'],
    ['https://job-boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
    ['https://boards.eu.greenhouse.io/acme/jobs/123', 'greenhouse'],
    ['https://jobs.lever.co/acme/abc', 'lever'],
    ['https://jobs.ashbyhq.com/acme/abc', 'ashby'],
    ['https://eeho.fa.us2.oraclecloud.com/x', 'oracle'],
    ['https://careers-acme.icims.com/jobs/1', 'icims'],
    ['https://jobs.smartrecruiters.com/Acme/1', 'smartrecruiters'],
    ['https://notgreenhouse.io.example.com/', 'other'],
    ['not a url', 'other'],
  ])('%s → %s', (url, ats) => expect(detectAts(url)).toBe(ats));
});
