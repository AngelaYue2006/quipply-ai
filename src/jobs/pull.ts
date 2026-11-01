import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { jobPulls, jobs } from '../db/schema';
import type { PullSummary } from '../shared/job';
import { detectAts } from './ats';
import { RawListing, type JobSource } from './sources/types';

export type PullOptions = {
  /** Keep only postings from the last N days. Null means all. */
  windowDays: number | null;
  /** Current time in ms; injectable for tests. */
  now?: number;
};

type JobValues = Omit<typeof jobs.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'userStatus' | 'notes'>;

function toValues(source: string, l: RawListing): JobValues {
  return {
    source,
    sourceListingId: l.id,
    company: l.company_name,
    companyUrl: l.company_url,
    title: l.title,
    locations: l.locations,
    terms: l.terms,
    category: l.category,
    degrees: l.degrees,
    sponsorship: l.sponsorship,
    url: l.url,
    atsType: detectAts(l.url),
    datePosted: l.date_posted,
    dateUpdated: l.date_updated,
    active: l.active && l.is_visible,
  };
}

const COMPARED = [
  'company',
  'companyUrl',
  'title',
  'locations',
  'terms',
  'category',
  'degrees',
  'sponsorship',
  'url',
  'atsType',
  'datePosted',
  'dateUpdated',
  'active',
] as const;

function differs(a: Record<string, unknown>, b: Record<string, unknown>) {
  return COMPARED.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

export function toSummary(row: typeof jobPulls.$inferSelect): PullSummary {
  return {
    id: row.id,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    added: row.added,
    updated: row.updated,
    closed: row.closed,
    malformed: row.malformed,
    notModified: row.notModified,
    windowDays: row.windowDays,
    error: row.error,
  };
}

export function latestPull(db: Db): PullSummary | null {
  const row = db.select().from(jobPulls).orderBy(desc(jobPulls.id)).limit(1).get();
  return row ? toSummary(row) : null;
}

/** The pull whose additions get the "New" badge: the latest successful pull that downloaded the file. */
export function latestContentPullId(db: Db): number | null {
  const row = db
    .select({ id: jobPulls.id })
    .from(jobPulls)
    .where(and(isNull(jobPulls.error), eq(jobPulls.notModified, false)))
    .orderBy(desc(jobPulls.id))
    .limit(1)
    .get();
  return row?.id ?? null;
}

/**
 * Download the listings, then insert new postings inside the window, update stored ones (even outside
 * the window) and mark stored ones closed when they go inactive or disappear. One transaction.
 */
export async function pullJobs(db: Db, source: JobSource, opts: PullOptions): Promise<PullSummary> {
  const now = opts.now ?? Date.now();
  const windowDays = opts.windowDays && opts.windowDays > 0 ? opts.windowDays : null;

  const last = db
    .select()
    .from(jobPulls)
    .where(and(eq(jobPulls.source, source.id), isNull(jobPulls.error)))
    .orderBy(desc(jobPulls.id))
    .limit(1)
    .get();
  // A wider window than last time needs the full file even if it hasn't changed, so older postings get added.
  const widened = last
    ? windowDays === null
      ? last.windowDays !== null
      : last.windowDays !== null && windowDays > last.windowDays
    : false;
  const etag = last && !widened ? last.etag : null;

  const pull = db
    .insert(jobPulls)
    .values({ source: source.id, startedAt: Date.now(), windowDays })
    .returning()
    .get();

  try {
    const res = await source.pull({ etag });
    if (res.notModified) {
      const row = db
        .update(jobPulls)
        .set({ finishedAt: Date.now(), notModified: true, etag: res.etag })
        .where(eq(jobPulls.id, pull.id))
        .returning()
        .get();
      return toSummary(row);
    }

    const cutoff = windowDays === null ? -Infinity : now / 1000 - windowDays * 86_400;
    const counts = { added: 0, updated: 0, closed: 0, malformed: 0 };

    db.transaction((tx) => {
      const existing = new Map(
        tx
          .select()
          .from(jobs)
          .where(eq(jobs.source, source.id))
          .all()
          .map((j) => [j.sourceListingId, j]),
      );
      const seen = new Set<string>();

      for (const entry of res.entries) {
        const parsed = RawListing.safeParse(entry);
        if (!parsed.success) {
          counts.malformed++;
          continue;
        }
        const l = parsed.data;
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        const values = toValues(source.id, l);
        const stored = existing.get(l.id);

        if (stored) {
          const changed = differs(stored, values);
          if (stored.active && !values.active) counts.closed++;
          else if (changed) counts.updated++;
          tx.update(jobs)
            .set(changed ? { ...values, lastSeenPullId: pull.id } : { lastSeenPullId: pull.id })
            .where(eq(jobs.id, stored.id))
            .run();
        } else if (values.active && l.date_posted >= cutoff) {
          tx.insert(jobs)
            .values({ ...values, firstSeenPullId: pull.id, lastSeenPullId: pull.id })
            .run();
          counts.added++;
        }
      }

      // Stored postings missing from the file are no longer listed: mark them closed.
      for (const stored of existing.values()) {
        if (!seen.has(stored.sourceListingId) && stored.active) {
          tx.update(jobs).set({ active: false }).where(eq(jobs.id, stored.id)).run();
          counts.closed++;
        }
      }
    });

    const row = db
      .update(jobPulls)
      .set({ ...counts, finishedAt: Date.now(), etag: res.etag })
      .where(eq(jobPulls.id, pull.id))
      .returning()
      .get();
    return toSummary(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(jobPulls).set({ finishedAt: Date.now(), error: message }).where(eq(jobPulls.id, pull.id)).run();
    throw err;
  }
}
