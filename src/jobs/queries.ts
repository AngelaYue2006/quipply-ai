import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { jobDescriptions, jobMatches, jobs } from '../db/schema';
import type { AtsType, JobDetail, JobRow, UserStatus } from '../shared/job';
import { getProfile } from '../profile/service';
import { ACTIVE_MATCHER_VERSION } from '../match/matcher';
import { isStale } from '../match/service';
import { latestContentPullId } from './pull';

type JobSelect = typeof jobs.$inferSelect;

function toRow(
  j: JobSelect,
  extra: { newPullId: number | null; hasDescription: boolean; match: typeof jobMatches.$inferSelect | null; profileVersion: number },
): JobRow {
  return {
    id: j.id,
    company: j.company,
    title: j.title,
    locations: j.locations,
    terms: j.terms,
    category: j.category,
    degrees: j.degrees,
    sponsorship: j.sponsorship,
    url: j.url,
    atsType: j.atsType as AtsType,
    datePosted: j.datePosted,
    active: j.active,
    userStatus: j.userStatus as UserStatus,
    notes: j.notes,
    isNew: extra.newPullId !== null && j.firstSeenPullId === extra.newPullId,
    hasDescription: extra.hasDescription,
    match: extra.match
      ? {
          score: extra.match.result.score,
          verdict: extra.match.result.verdict,
          status: extra.match.status,
          stale: isStale(extra.match, extra.profileVersion, ACTIVE_MATCHER_VERSION),
        }
      : null,
  };
}

/** All jobs for the board, newest first. Closed jobs are included only when asked for. */
export function listJobs(db: Db, opts: { includeClosed?: boolean } = {}): JobRow[] {
  const newPullId = latestContentPullId(db);
  const profileVersion = getProfile(db).version;
  const rows = db
    .select({
      job: jobs,
      hasDescription: sql<number>`(${jobDescriptions.text} is not null)`,
      match: jobMatches,
    })
    .from(jobs)
    .leftJoin(jobDescriptions, eq(jobDescriptions.jobId, jobs.id))
    .leftJoin(jobMatches, eq(jobMatches.jobId, jobs.id))
    .where(opts.includeClosed ? undefined : eq(jobs.active, true))
    .orderBy(desc(jobs.datePosted))
    .all();
  return rows.map((r) => toRow(r.job, { newPullId, hasDescription: Boolean(r.hasDescription), match: r.match, profileVersion }));
}

export function getJobDetail(db: Db, id: number): JobDetail | null {
  const j = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!j) return null;
  const d = db.select().from(jobDescriptions).where(eq(jobDescriptions.jobId, id)).get() ?? null;
  const m = db.select().from(jobMatches).where(eq(jobMatches.jobId, id)).get() ?? null;
  const profileVersion = getProfile(db).version;
  const row = toRow(j, { newPullId: latestContentPullId(db), hasDescription: Boolean(d?.text), match: m, profileVersion });
  return {
    ...row,
    companyUrl: j.companyUrl,
    dateUpdated: j.dateUpdated,
    description: d ? { text: d.text, method: d.method, fetchedAt: d.fetchedAt, error: d.error } : null,
    matchResult: m
      ? {
          ...m.result,
          stale: isStale(m, profileVersion, ACTIVE_MATCHER_VERSION),
          computedAt: m.computedAt,
          profileVersion: m.profileVersion,
          matcherVersion: m.matcherVersion,
        }
      : null,
  };
}

export function patchJob(db: Db, id: number, patch: { userStatus?: UserStatus; notes?: string }) {
  const res = db.update(jobs).set(patch).where(eq(jobs.id, id)).run();
  return res.changes > 0;
}

export function bulkSetStatus(db: Db, ids: number[], userStatus: UserStatus) {
  if (ids.length === 0) return 0;
  return db.update(jobs).set({ userStatus }).where(inArray(jobs.id, ids)).run().changes;
}
