import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { jobDescriptions, jobMatches, jobs } from '../db/schema';
import type { AppConfig } from '../config';
import type { LlmClient } from '../llm/client';
import { emptyResult, type MatchResult } from '../shared/match';
import { getProfile } from '../profile/service';
import { makeLlmFit } from './llm-fit';
import { RubricMatcher } from './matcher';
import type { Matcher } from './types';

export function isStale(row: { profileVersion: number; matcherVersion: string }, profileVersion: number, matcherVersion: string) {
  return row.profileVersion !== profileVersion || row.matcherVersion !== matcherVersion;
}

export function activeMatcher(db: Db, cfg: AppConfig, client: LlmClient): Matcher {
  return new RubricMatcher(makeLlmFit({ db, client, model: cfg.matchModel }));
}

/** Score one job with the given matcher and save the result (replacing any earlier one). */
export async function scoreJob(db: Db, matcher: Matcher, jobId: number): Promise<MatchResult> {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) throw new Error('Job not found.');
  const desc = db.select({ text: jobDescriptions.text }).from(jobDescriptions).where(eq(jobDescriptions.jobId, jobId)).get();
  const { data: profile, version } = getProfile(db);

  let result: MatchResult;
  try {
    result = await matcher.score({ profile, profileVersion: version, job, description: desc?.text ?? null });
  } catch (err) {
    result = emptyResult('error', [err instanceof Error ? err.message : String(err)]);
  }

  const values = {
    jobId,
    profileVersion: version,
    matcherVersion: matcher.version,
    status: result.status,
    result,
    computedAt: Date.now(),
  };
  db.insert(jobMatches)
    .values(values)
    .onConflictDoUpdate({ target: jobMatches.jobId, set: values })
    .run();
  return result;
}
