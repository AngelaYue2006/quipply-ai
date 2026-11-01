import { z } from 'zod';
import { MatchResult } from './match';

export const USER_STATUSES = ['new', 'interested', 'skipped', 'applied'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ATS_TYPES = ['workday', 'greenhouse', 'lever', 'ashby', 'oracle', 'icims', 'smartrecruiters', 'other'] as const;
export type AtsType = (typeof ATS_TYPES)[number];

export const DESCRIPTION_METHODS = ['greenhouse_api', 'lever_api', 'ashby_api', 'readability', 'manual'] as const;
export type DescriptionMethod = (typeof DESCRIPTION_METHODS)[number];

/** One row of the job table, as sent to the dashboard. */
export type JobRow = {
  id: number;
  company: string;
  title: string;
  locations: string[];
  terms: string[];
  category: string;
  degrees: string[];
  sponsorship: string;
  url: string;
  atsType: AtsType;
  datePosted: number;
  active: boolean;
  userStatus: UserStatus;
  notes: string;
  isNew: boolean;
  hasDescription: boolean;
  match: { score: number | null; verdict: MatchResult['verdict']; status: MatchResult['status']; stale: boolean } | null;
};

export type JobDetail = JobRow & {
  companyUrl: string;
  dateUpdated: number;
  description: { text: string | null; method: string | null; fetchedAt: number | null; error: string | null } | null;
  matchResult: (MatchResult & { stale: boolean; computedAt: number; profileVersion: number; matcherVersion: string }) | null;
};

export type PullSummary = {
  id: number;
  startedAt: number;
  finishedAt: number | null;
  added: number;
  updated: number;
  closed: number;
  malformed: number;
  notModified: boolean;
  windowDays: number | null;
  error: string | null;
};

export const JobPatch = z.object({
  userStatus: z.enum(USER_STATUSES).optional(),
  notes: z.string().max(10_000).optional(),
});
