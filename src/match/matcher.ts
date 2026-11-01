import { emptyResult, type MatchResult } from '../shared/match';
import { matchProfileSubset } from '../shared/profile';
import { checkEligibility, type Eligibility } from './eligibility';
import type { FitCall } from './llm-fit';
import { verifyQuotes } from './quote-check';
import { assemble } from './score';
import type { Matcher, MatchInput } from './types';

export const NO_DESCRIPTION = 'No description yet; fetch it first.';

export function notScored(message: string): MatchResult {
  return emptyResult('not_scored', [message]);
}

export function ineligible(elig: Eligibility): MatchResult {
  return {
    ...emptyResult('scored', elig.warnings),
    verdict: 'ineligible',
    eligibility: { eligible: false, blockers: elig.blockers },
  };
}

/** Fallback for tests and for jobs that can't be scored. */
export class NotScoredMatcher implements Matcher {
  readonly version = 'not-scored@1';
  async score(): Promise<MatchResult> {
    return notScored('Not scored yet.');
  }
}

/** Rules in code, one model call for the checklist, score and verdict in code. */
export class RubricMatcher implements Matcher {
  readonly version = 'rubric@1';
  constructor(private llmFit: FitCall) {}

  async score(input: MatchInput): Promise<MatchResult> {
    if (!input.description?.trim()) return notScored(NO_DESCRIPTION);
    const elig = checkEligibility(input);
    if (!elig.eligible) return ineligible(elig); // stops here, no model call
    const { fit, truncated, description } = await this.llmFit(input);
    const checked = verifyQuotes(fit, description, matchProfileSubset(input.profile));
    return assemble(elig, checked.fit, { quoteFailures: checked.failed, truncated });
  }
}

/** The matcher version the app currently uses; stored results with another version are stale. */
export const ACTIVE_MATCHER_VERSION = 'rubric@1';
