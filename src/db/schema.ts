import { sqliteTable, integer, text, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import type { Profile } from '../shared/profile';
import type { MatchResult } from '../shared/match';
import type { ResumeDraft } from '../profile/resume-draft';

// Every table has id, created_at, updated_at (epoch milliseconds).
const base = {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at')
    .notNull()
    .$defaultFn(() => Date.now())
    .$onUpdateFn(() => Date.now()),
};

export const profile = sqliteTable('profile', {
  ...base,
  data: text('data', { mode: 'json' }).$type<Profile>().notNull(),
  /** Increments on every save; used to know when match scores are stale. */
  version: integer('version').notNull().default(1),
});

export const resumes = sqliteTable('resumes', {
  ...base,
  filePath: text('file_path').notNull(),
  originalName: text('original_name').notNull(),
  label: text('label').notNull().default(''),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  extractedText: text('extracted_text').notNull().default(''),
});

export const resumeImports = sqliteTable('resume_imports', {
  ...base,
  resumeId: integer('resume_id')
    .notNull()
    .references(() => resumes.id, { onDelete: 'cascade' }),
  draft: text('draft', { mode: 'json' }).$type<ResumeDraft>().notNull(),
  status: text('status', { enum: ['pending', 'accepted', 'discarded'] }).notNull().default('pending'),
  llmCallId: integer('llm_call_id').references(() => llmCalls.id),
});

export const jobPulls = sqliteTable('job_pulls', {
  ...base,
  source: text('source').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  added: integer('added').notNull().default(0),
  updated: integer('updated').notNull().default(0),
  closed: integer('closed').notNull().default(0),
  malformed: integer('malformed').notNull().default(0),
  notModified: integer('not_modified', { mode: 'boolean' }).notNull().default(false),
  /** Null means "all". */
  windowDays: integer('window_days'),
  error: text('error'),
  etag: text('etag'),
});

export const jobs = sqliteTable(
  'jobs',
  {
    ...base,
    source: text('source').notNull(),
    sourceListingId: text('source_listing_id').notNull(),
    company: text('company').notNull(),
    companyUrl: text('company_url').notNull().default(''),
    title: text('title').notNull(),
    locations: text('locations', { mode: 'json' }).$type<string[]>().notNull(),
    terms: text('terms', { mode: 'json' }).$type<string[]>().notNull(),
    category: text('category').notNull().default(''),
    degrees: text('degrees', { mode: 'json' }).$type<string[]>().notNull(),
    sponsorship: text('sponsorship').notNull().default(''),
    url: text('url').notNull(),
    atsType: text('ats_type').notNull(),
    /** Unix seconds, as in the listings file. */
    datePosted: integer('date_posted').notNull(),
    dateUpdated: integer('date_updated').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull(),
    firstSeenPullId: integer('first_seen_pull_id').references(() => jobPulls.id),
    lastSeenPullId: integer('last_seen_pull_id').references(() => jobPulls.id),
    userStatus: text('user_status', { enum: ['new', 'interested', 'skipped', 'applied'] })
      .notNull()
      .default('new'),
    notes: text('notes').notNull().default(''),
  },
  (t) => [uniqueIndex('jobs_source_listing').on(t.source, t.sourceListingId), index('jobs_active').on(t.active)],
);

export const jobDescriptions = sqliteTable('job_descriptions', {
  ...base,
  jobId: integer('job_id')
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  text: text('text'),
  html: text('html'),
  method: text('method'),
  fetchedAt: integer('fetched_at'),
  error: text('error'),
});

export const jobMatches = sqliteTable('job_matches', {
  ...base,
  jobId: integer('job_id')
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  profileVersion: integer('profile_version').notNull(),
  matcherVersion: text('matcher_version').notNull(),
  status: text('status', { enum: ['not_scored', 'scored', 'error'] }).notNull(),
  result: text('result', { mode: 'json' }).$type<MatchResult>().notNull(),
  computedAt: integer('computed_at').notNull(),
});

export const llmCalls = sqliteTable('llm_calls', {
  ...base,
  action: text('action').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  error: text('error'),
});
