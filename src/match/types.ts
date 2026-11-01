import type { Profile } from '../shared/profile';
import type { MatchResult } from '../shared/match';

/** The listing fields the matcher uses. */
export type MatchJob = {
  company: string;
  title: string;
  locations: string[];
  terms: string[];
  degrees: string[];
  sponsorship: string;
};

export type MatchInput = {
  profile: Profile;
  profileVersion: number;
  job: MatchJob;
  description: string | null;
};

export interface Matcher {
  /** Bump when the prompt, weights or rules change; stored results with another version show as stale. */
  readonly version: string;
  score(input: MatchInput): Promise<MatchResult>;
}
