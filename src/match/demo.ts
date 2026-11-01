// pnpm match:demo <jobId>
// pnpm match:demo --profile profile.json --job job.json --description description.txt
// Prints the exact system prompt, the user message, the raw model JSON and the final MatchResult for one job.
// This calls the model (costs money) and runs only when you start it.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config';
import { openDb } from '../db/client';
import { jobDescriptions, jobs } from '../db/schema';
import { AnthropicLlmClient } from '../llm/client';
import { getProfile } from '../profile/service';
import { Profile } from '../shared/profile';
import { buildFitMessages, makeLlmFit } from './llm-fit';
import { checkEligibility } from './eligibility';
import { RubricMatcher } from './matcher';
import type { MatchInput, MatchJob } from './types';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { profile: { type: 'string' }, job: { type: 'string' }, description: { type: 'string' } },
});

const cfg = loadConfig();
const db = openDb(cfg.dbPath);

let input: MatchInput;
if (values.profile || values.job || values.description) {
  if (!values.profile || !values.job || !values.description) {
    console.error('File mode needs all three: --profile, --job and --description.');
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(values.profile, 'utf8'));
  const profile = Profile.parse(raw.format === 'quipply-profile' ? raw.profile : raw);
  const job = JSON.parse(readFileSync(values.job, 'utf8')) as MatchJob;
  input = { profile, profileVersion: 0, job, description: readFileSync(values.description, 'utf8') };
} else {
  const jobId = Number(positionals[0]);
  if (!jobId) {
    console.error('Usage: pnpm match:demo <jobId>   (or --profile --job --description files)');
    process.exit(1);
  }
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) {
    console.error(`No job with id ${jobId}.`);
    process.exit(1);
  }
  const desc = db.select().from(jobDescriptions).where(eq(jobDescriptions.jobId, jobId)).get();
  const { data, version } = getProfile(db);
  input = { profile: data, profileVersion: version, job, description: desc?.text ?? null };
}

const section = (title: string) => console.log(`\n${'='.repeat(20)} ${title} ${'='.repeat(20)}\n`);
const msg = buildFitMessages(input);
section('SYSTEM PROMPT (match-fit@1)');
console.log(msg.system);
section('USER MESSAGE');
console.log(msg.user);
section('ELIGIBILITY (code, no model)');
const elig = checkEligibility(input);
console.log(JSON.stringify({ ...elig, handled: [...elig.handled] }, null, 2));

let raw = '';
const client = new AnthropicLlmClient(cfg.anthropicApiKey);
const fitCall = makeLlmFit({ db, client, model: cfg.matchModel });
const matcher = new RubricMatcher(async (i) => {
  const out = await fitCall(i);
  raw = out.raw;
  return out;
});
let result;
try {
  result = await matcher.score(input);
} catch (err) {
  console.error(`\nModel call failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
section(`RAW MODEL JSON (${cfg.matchModel})`);
console.log(raw ? JSON.stringify(JSON.parse(raw), null, 2) : '(no model call: no description or ineligible)');
section('MATCH RESULT');
console.log(JSON.stringify(result, null, 2));
