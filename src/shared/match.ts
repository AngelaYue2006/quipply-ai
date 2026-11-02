import { z } from 'zod';

export const VERDICTS = ['strong', 'good', 'stretch', 'weak', 'ineligible'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const Blocker = z.object({ rule: z.string(), detail: z.string() });
export type Blocker = z.infer<typeof Blocker>;

/** What the dashboard renders. */
export const MatchResult = z.object({
  status: z.enum(['not_scored', 'scored', 'error']),
  score: z.number().int().min(0).max(100).nullable(),
  verdict: z.enum(VERDICTS).nullable(),
  eligibility: z.object({ eligible: z.boolean().nullable(), blockers: z.array(Blocker) }),
  strengths: z.array(z.object({ point: z.string(), evidence: z.object({ job: z.string(), profile: z.string() }) })),
  gaps: z.array(z.object({ point: z.string(), severity: z.enum(['required', 'preferred']) })),
  skills: z.object({
    // partial: met "partial" (have is false); missing on older results.
    required: z.array(z.object({ skill: z.string(), have: z.boolean(), partial: z.boolean().optional() })),
    preferred: z.array(z.object({ skill: z.string(), have: z.boolean(), partial: z.boolean().optional() })),
  }),
  summary: z.string().nullable(),
  warnings: z.array(z.string()),
  /**
   * Items the quote check threw out, with what the model claimed, so you can see why they don't count.
   * Never used for the score or for strengths. Missing on older results.
   */
  ignored: z
    .array(
      z.object({
        point: z.string(),
        kind: z.enum(['required', 'preferred']),
        claimed: z.enum(['yes', 'partial', 'no']),
        jobQuote: z.string(),
        profileEvidence: z.string().nullable(),
        reasons: z.array(z.enum(['job_quote_not_found', 'evidence_not_found'])),
      }),
    )
    .optional(),
  /** How many requirements the score rests on (judged = not "unclear"). Missing on results from rubric@1. */
  basis: z.object({ judged: z.number().int(), total: z.number().int() }).optional(),
});
export type MatchResult = z.infer<typeof MatchResult>;

/**
 * The matcher version the app uses; stored results with another version show as stale.
 * rubric@2: the quote check also accepts evidence that lists exact profile entries.
 * rubric@3: ...and parts built from whole field values of one entry ("BS Computer Science").
 */
export const MATCHER_VERSION = 'rubric@3';

/**
 * What the model returns. The model never returns a score.
 * Written without numeric/length constraints so it maps cleanly onto structured outputs.
 */
export const FitChecklist = z.object({
  requirements: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(['required', 'preferred']),
      category: z.enum(['skill', 'experience', 'education', 'other']),
      met: z.enum(['yes', 'partial', 'no', 'unclear']),
      jobQuote: z.string(),
      profileEvidence: z.string().nullable(),
    }),
  ),
  hardRequirements: z.array(z.object({ text: z.string(), jobQuote: z.string() })),
  summary: z.string(),
});
export type FitChecklist = z.infer<typeof FitChecklist>;
export type FitRequirement = FitChecklist['requirements'][number];

export function emptyResult(status: MatchResult['status'], warnings: string[] = []): MatchResult {
  return {
    status,
    score: null,
    verdict: null,
    eligibility: { eligible: null, blockers: [] },
    strengths: [],
    gaps: [],
    skills: { required: [], preferred: [] },
    summary: null,
    warnings,
  };
}
