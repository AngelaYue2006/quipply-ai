import { describe, expect, it } from 'vitest';
import { jobDescriptions, jobs, llmCalls } from '../src/db/schema';
import { FakeLlmClient, LlmError } from '../src/llm/client';
import { buildFitMessages, makeLlmFit } from '../src/match/llm-fit';
import { NO_DESCRIPTION, NotScoredMatcher, RubricMatcher } from '../src/match/matcher';
import { verifyQuotes } from '../src/match/quote-check';
import { scoreJob } from '../src/match/service';
import { getJobDetail, listJobs } from '../src/jobs/queries';
import { saveSection, writeProfile } from '../src/profile/service';
import { FitChecklist, MatchResult } from '../src/shared/match';
import { matchProfileSubset } from '../src/shared/profile';
import type { MatchJob } from '../src/match/types';
import { fakeProfile, fixture, testDb } from './helpers';

const DESCRIPTION = fixture('match/description.txt');
const RECORDED = fixture('match/recorded-fit.json');
const JOB: MatchJob = { company: 'Example Logistics', title: 'Software Engineering Intern', locations: ['Chicago, IL'], terms: ['Summer 2027'], degrees: ["Bachelor's"], sponsorship: 'Other' };

function seed(description: string | null = DESCRIPTION) {
  const db = testDb();
  writeProfile(db, fakeProfile());
  const job = db
    .insert(jobs)
    .values({ source: 's', sourceListingId: '1', url: 'https://example.com/j', atsType: 'other', datePosted: 1, dateUpdated: 1, active: true, ...JOB })
    .returning()
    .get();
  if (description) db.insert(jobDescriptions).values({ jobId: job.id, text: description, method: 'manual' }).run();
  return { db, jobId: job.id };
}

describe('quote check', () => {
  it('downgrades items whose evidence is not in the profile or whose quote is not in the posting', () => {
    const fit = FitChecklist.parse(JSON.parse(RECORDED));
    const invented = { ...fit, requirements: [...fit.requirements, { ...fit.requirements[0]!, jobQuote: 'Ten years of Fortran' }] };
    const { fit: checked, failed } = verifyQuotes(invented, DESCRIPTION, matchProfileSubset(fakeProfile()));
    expect(failed).toBe(2); // the invented Kubernetes evidence + the invented job quote
    const k8s = checked.requirements.find((r) => r.text === 'Kubernetes in production')!;
    expect(k8s).toMatchObject({ met: 'unclear', profileEvidence: null });
    expect(checked.requirements.find((r) => r.text === 'Python or Java')!.met).toBe('yes');
  });

  it('reports each rejected item with what the model claimed and why it was rejected', () => {
    const fit = FitChecklist.parse(JSON.parse(RECORDED));
    const invented = { ...fit, requirements: [...fit.requirements, { ...fit.requirements[1]!, text: 'Fortran', jobQuote: 'Ten years of Fortran' }] };
    const { ignored } = verifyQuotes(invented, DESCRIPTION, matchProfileSubset(fakeProfile()));
    expect(ignored).toEqual([
      {
        point: 'Kubernetes in production',
        kind: 'required',
        claimed: 'yes',
        jobQuote: 'Experience with Kubernetes in production',
        profileEvidence: 'Ran Kubernetes clusters for three years',
        reasons: ['evidence_not_found'],
      },
      { point: 'Fortran', kind: 'required', claimed: 'yes', jobQuote: 'Ten years of Fortran', profileEvidence: 'Python', reasons: ['job_quote_not_found'] },
    ]);
  });

  it('ignores case, whitespace and curly quotes, and accepts quotes with ellipses', () => {
    const fit = FitChecklist.parse({
      requirements: [
        { text: 'x', kind: 'required', category: 'skill', met: 'yes', jobQuote: 'proficiency   in PYTHON', profileEvidence: 'Built REST APIs … 2k requests per minute' },
      ],
      hardRequirements: [],
      summary: '',
    });
    expect(verifyQuotes(fit, DESCRIPTION, matchProfileSubset(fakeProfile())).failed).toBe(0);
  });

  const evidenceCheck = (profileEvidence: string) =>
    verifyQuotes(
      FitChecklist.parse({
        requirements: [{ text: 'x', kind: 'required', category: 'skill', met: 'yes', jobQuote: 'proficiency in Python', profileEvidence }],
        hardRequirements: [],
        summary: '',
      }),
      DESCRIPTION,
      matchProfileSubset(fakeProfile()),
    ).failed === 0;

  it('accepts evidence that lists exact profile entries', () => {
    expect(evidenceCheck('Python, TypeScript, Rust')).toBe(true);
    expect(evidenceCheck('Git; Docker and PostgreSQL')).toBe(true);
    expect(evidenceCheck('BS in Computer Science')).toBe(true);
    expect(evidenceCheck('Software Engineering Intern at Acme Widgets')).toBe(true);
    expect(evidenceCheck('Tiny Compiler, Rust')).toBe(true);
  });

  it('accepts evidence stitched from whole fields of one entry, with field names', () => {
    // Real case: the model joined school, degree type, major and graduation from one education entry.
    expect(evidenceCheck('Example State University, BS Computer Science, graduation 2027-05')).toBe(true);
    expect(evidenceCheck('BS Computer Science')).toBe(true);
    expect(evidenceCheck('GPA: 3.70')).toBe(true);
    expect(evidenceCheck('Operating Systems coursework')).toBe(true);
    expect(evidenceCheck('Software Engineering Intern, Acme Widgets (2025-06 - 2025-08)')).toBe(true);
  });

  it('rejects stitched evidence with a wrong value, a partial value or fields from different entries', () => {
    expect(evidenceCheck('BS Data Science')).toBe(false); // wrong major
    expect(evidenceCheck('Example State University, graduation 2026-05')).toBe(false); // wrong date
    expect(evidenceCheck('Acme Widgets Computer Science')).toBe(false); // a job and a school
    expect(evidenceCheck('graduation')).toBe(false); // a field name with no value
    expect(evidenceCheck('Built Python APIs')).toBe(false); // words from bullets, not a whole value
  });

  it('still rejects lists with an invented or partial entry, and entries stitched across jobs or schools', () => {
    expect(evidenceCheck('Python, Kubernetes')).toBe(false); // Kubernetes isn't in the profile
    expect(evidenceCheck('PostgreSQL, SQL')).toBe(false); // SQL only appears inside "PostgreSQL"
    expect(evidenceCheck('Software Engineering Intern at Example State University')).toBe(false); // job + school
    expect(evidenceCheck('Built APIs and wrote scripts')).toBe(false); // paraphrase
    expect(evidenceCheck('Machine Learning coursework')).toBe(false); // not in this profile's coursework
  });
});

describe('RubricMatcher', () => {
  it('scores end to end from a recorded model response; the model never picks the number', async () => {
    const { db } = seed();
    const client = new FakeLlmClient([RECORDED]);
    const matcher = new RubricMatcher(makeLlmFit({ db, client, model: 'claude-haiku-5-5' }));
    const result = MatchResult.parse(
      await matcher.score({ profile: fakeProfile(), profileVersion: 1, job: JOB, description: DESCRIPTION }),
    );
    // Judged after the quote check: req yes ×3 (9), pref no (0), pref yes (1) → 10 / 11
    expect(result.score).toBe(Math.round((100 * 10) / 11));
    expect(result.verdict).toBe('strong');
    expect(result.strengths.map((s) => s.point)).not.toContain('Kubernetes in production');
    expect(result.warnings.join('\n')).toMatch(/1 item\(s\) quoted text/);
    expect(result.eligibility).toEqual({ eligible: true, blockers: [] });
    expect(db.select().from(llmCalls).get()).toMatchObject({ action: 'match_fit', promptVersion: 'match-fit@1', ok: true });
  });

  it('sends only education, experience, projects and skills to the model', () => {
    const msg = buildFitMessages({ profile: fakeProfile(), profileVersion: 1, job: JOB, description: DESCRIPTION });
    expect(msg.user).toContain('<job title="Software Engineering Intern" company="Example Logistics">');
    expect(msg.user).not.toContain('testy@example.com');
    expect(msg.user).not.toContain('555-0100');
    expect(msg.user).not.toMatch(/citizenship|sponsorship(Now|Future)|workAuth|standardAnswers|writingSamples/);
  });

  it('returns not_scored without a model call when there is no description', async () => {
    const client = new FakeLlmClient([]);
    const matcher = new RubricMatcher(makeLlmFit({ db: testDb(), client, model: 'm' }));
    const r = await matcher.score({ profile: fakeProfile(), profileVersion: 1, job: JOB, description: null });
    expect(r).toMatchObject({ status: 'not_scored', score: null, warnings: [NO_DESCRIPTION] });
    expect(client.requests).toHaveLength(0);
  });

  it('stops at eligibility without a model call when a rule blocks', async () => {
    const client = new FakeLlmClient([]);
    const matcher = new RubricMatcher(makeLlmFit({ db: testDb(), client, model: 'm' }));
    const r = await matcher.score({ profile: fakeProfile(), profileVersion: 1, job: { ...JOB, degrees: ['PhD'] }, description: DESCRIPTION });
    expect(r.verdict).toBe('ineligible');
    expect(r.score).toBeNull();
    expect(r.eligibility.blockers[0]!.rule).toBe('degree');
    expect(client.requests).toHaveLength(0);
  });

  it('NotScoredMatcher always says not scored', async () => {
    expect((await new NotScoredMatcher().score()).status).toBe('not_scored');
  });
});

describe('stored matches', () => {
  it('saves the result and marks it stale when the profile changes', async () => {
    const { db, jobId } = seed();
    const matcher = new RubricMatcher(makeLlmFit({ db, client: new FakeLlmClient([RECORDED]), model: 'claude-haiku-5-5' }));
    await scoreJob(db, matcher, jobId);
    expect(getJobDetail(db, jobId)!.matchResult).toMatchObject({ status: 'scored', stale: false });
    expect(listJobs(db)[0]!.match).toMatchObject({ verdict: 'strong', stale: false });

    saveSection(db, 'skills', { languages: [{ name: 'Go' }] });
    expect(getJobDetail(db, jobId)!.matchResult!.stale).toBe(true);
    expect(listJobs(db)[0]!.match!.stale).toBe(true);
  });

  it('marks a result stale when the matcher version changes', async () => {
    const { db, jobId } = seed();
    const old = { version: 'rubric@0', score: async () => new NotScoredMatcher().score() };
    await scoreJob(db, old, jobId);
    expect(getJobDetail(db, jobId)!.matchResult!.stale).toBe(true);
  });

  it('stores model failures as an error result instead of crashing', async () => {
    const { db, jobId } = seed();
    const matcher = new RubricMatcher(makeLlmFit({ db, client: new FakeLlmClient([new LlmError('Rate limited', 'api_error')]), model: 'm' }));
    const r = await scoreJob(db, matcher, jobId);
    expect(r).toMatchObject({ status: 'error', warnings: ['Rate limited'] });
  });
});
