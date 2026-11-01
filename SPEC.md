# V1 spec: profile, job board and matching scaffold

Oct 21, 2026 · @Aspire

V1 is where you enter your information once, pull the current internship list with one button, and browse it with a match score for each job against your profile: whether you're eligible, what matches, and what you're missing. Applying to jobs moves to V1 spec.

> **MVP status (Nov 1, 2026):** the core loop is built (profile, resume import, job board, single-job description fetch and Score match). Deferred from this spec for now: Score selected, bulk description fetch, `match:eval` with labeled jobs, and FTS5 search. The app lives at the repo root instead of `apply-engine/`, and UI components are hand-written Tailwind instead of shadcn/ui. See `CHANGELOG.md` for the full list of differences.

## Scope

**V1 is done when** you can:

1. Fill in your full profile in the dashboard, or import it from your resume PDF and correct it, and it survives a restart.
2. Click **Pull jobs** and see active postings from the Simplify/Pitt CSC internship list posted in the last 7 days (524 on Oct 16; the window is adjustable), with what's new since your last pull.
3. Filter and sort that list, open a job, fetch its description, and mark it interested, skipped or applied.
4. Click **Score match** on a job (or **Score selected** on many) and get a score, a verdict, eligibility blockers, strengths with evidence, and the skills you're missing. The verdicts agree with your own labels on at least 14 of 20 hand-labeled jobs.

**In V1:** profile entry with sections for identity, education, experience, projects, skills, preferences, standard application answers and writing samples; resume upload and import; on-demand job pulling; job board with filters and statuses; on-demand description fetching; match scoring (eligibility rules in code, one model call per job, the score computed in code) with its UI, a demo script and an evaluation script.

**Deferred:**

- **Cheaper bulk scoring** (Message Batches API, embedding pre-ranking) — only if scoring cost becomes a problem.
- **Applying to jobs** — that's V2.
- **Automatic or scheduled pulling** — jobs are pulled only when you click the button.
- **Job sources other than the Simplify internship list** — the source interface allows adding them.
- **Multiple users or accounts** — single user only.

## Hard rules

1. **Nothing runs on a timer.** Jobs are pulled, descriptions fetched and matches scored only when you click a button.
2. **Imports never overwrite the profile silently.** Resume import produces a draft you review field by field; nothing is saved until you accept it.
3. **Work authorization, sponsorship, citizenship and EEO answers are entered by you only.** Resume import never fills them, and no model infers them.
4. **Your data stays local.** The profile, resume and job data live on your machine. The only data sent to a model is what a specific action needs (the resume text for import; for scoring, the job description plus the education, experience, project and skill sections of your profile), and only when you trigger it.
5. **Be polite to job sites.** Description fetches go one at a time with at least 1 second between requests and a clear user agent, using public APIs where they exist.
6. **Every model call is logged** with the action, model, prompt version, token counts and cost.

## How the pieces connect

&#91;embedded content: V1 data flow · profile and jobs feed the matcher\]

Every arrow from the left column is a button you click; nothing moves on its own. Inside the matcher, only the fit check calls a model. Eligibility and the final score are plain code.

## Frameworks for the AI and agent parts

Use the plain Anthropic TypeScript SDK for anything that is one model call with a structured answer, and the Claude Agent SDK only where a model must use tools in a loop. Skip general agent frameworks; this project has no multi-agent orchestration that would justify them.

| Part | When | What it needs | Use | Why |
| --- | --- | --- | --- | --- |
| Resume import | V1 | PDF in, structured profile out, one call | Anthropic TS SDK (`@anthropic-ai/sdk`), PDF sent as a document block, output validated with Zod | One request; Claude reads PDFs directly, so no PDF-parsing library is needed for the model path |
| Match scoring | V1 | One call per job, structured score, many jobs | Anthropic TS SDK + Zod; Message Batches API for bulk scoring | No tools or loop needed; batches are cheaper for scoring hundreds of jobs |
| Job description fetch | V1 | HTTP + text extraction | No model: public ATS APIs, else `@mozilla/readability` on fetched HTML | Deterministic and free |
| Locator agent | V2 | Tool loop over a live browser | Claude Agent SDK + Playwright MCP, read-only tool allowlist | Needs MCP tools and multi-turn reasoning, which the Agent SDK provides |
| Company research + short answers | Later | Web search, then a draft | Decide then: SDK with tool use, or the Agent SDK with a search tool | Depends on how many steps research takes |

**One `llm` module.** Every model call goes through `src/llm/` with one function shape, roughly `structured({ schema, prompt, input, model, promptVersion })`. It handles retries, Zod validation (one repair retry on invalid JSON), logging to `llm_calls`, and cost. Prompts live as versioned files in `src/llm/prompts/`. If you ever want to swap providers, only this module changes.

**Considered and not recommended now:**

- **LangChain / LangGraph:** a large abstraction layer for chains and graphs you don't have. It adds debugging cost, and the TypeScript versions trail the Python ones.
- **Mastra (TypeScript agent framework):** reasonable, but its workflows, memory and agents duplicate what the `llm` module and SQLite already do here.
- **Vercel AI SDK:** a good choice if you want one API across several model providers (its `generateObject` with Zod is pleasant). Use it instead of the Anthropic SDK only if multi-provider support matters to you.

**No RAG or vector store in V1.** Matching scores one job at a time, and your whole profile (a few thousand tokens) fits in each request, so there is nothing to retrieve. Keyword search over jobs is handled by SQLite FTS5. Embeddings become worth adding in three later cases: pre-ranking hundreds of fetched descriptions against your profile so only the top ones get a model call; matching differently-worded application questions to stored answers (V2+); and picking your most similar past answers as style examples for written answers. When that happens, use `sqlite-vec` in the same database rather than a separate vector service.

Verify current option names (structured output, PDF input, batches) against the Anthropic docs when implementing; pin SDK versions.

## Stack and repo layout

One TypeScript app: a local server that stores data and serves a React dashboard. V2 adds the browser and runner folders to this same repo.

| Piece | Choice |
| --- | --- |
| Runtime | Node 22 LTS, TypeScript strict, pnpm |
| Server | Fastify on `127.0.0.1`, JSON REST API |
| Dashboard | React + Vite, Tailwind + shadcn/ui components, TanStack Query for data, TanStack Table (virtualized) for the job list, React Hook Form + Zod for profile forms |
| Database | SQLite via better-sqlite3, Drizzle ORM and migrations |
| Validation | Zod schemas in `src/shared/`, used by server and dashboard |
| Model calls | `@anthropic-ai/sdk` behind `src/llm/` (see Frameworks) |
| HTML extraction | `jsdom` + `@mozilla/readability` for descriptions without an API |
| Tests | Vitest; saved JSON and HTML fixtures, no live network in tests |
| Config | `.env`: `ANTHROPIC_API_KEY`, port, data folder, model IDs |

```text
apply-engine/
  src/
    server/            # Fastify app, routes
    db/                # Drizzle schema, migrations
    shared/            # Zod schemas: Profile, Job, MatchResult, API types
    profile/           # profile service, resume import
    jobs/
      sources/         # JobSource interface + simplify-internships.ts
      pull.ts          # on-demand pull, upsert, closed detection
      describe/        # description fetchers: greenhouse, lever, ashby, generic
    match/
      matcher.ts       # Matcher interface, RubricMatcher, NotScoredMatcher fallback
      eligibility.ts   # rules, no model
      llm-fit.ts       # one model call, returns FitChecklist
      score.ts         # checklist -> score + verdict
      eval.ts          # match:demo and match:eval scripts
    llm/               # client, structured(), prompts/, cost logging
  web/                 # React dashboard
  data/                # SQLite file + uploaded resumes (gitignored)
  fixtures/            # sample listings.json slice, API responses, HTML pages
  tests/
  SPEC.md  CLAUDE.md  CHANGELOG.md
```

## Data model

Eight tables in one SQLite file. Every table has `id`, `created_at`, `updated_at`. The profile is one row of Zod-validated JSON sections, so adding a field later is a schema change in code, not a migration.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `profile` | Your information, single row | `data` (JSON matching the `Profile` Zod schema, see Profile), `version` (increments on every save; used to know when match scores are stale) |
| `resumes` | Uploaded resume files | file\_path, original\_name, label (e.g. "SWE"), is\_default, extracted\_text |
| `resume_imports` | Drafts from resume import | resume\_id, draft (JSON), status (pending / accepted / discarded), llm\_call\_id |
| `job_pulls` | One row per Pull jobs click | source, started\_at, finished\_at, added, updated, closed, error, etag |
| `jobs` | One row per posting | source, source\_listing\_id (unique with source), company, company\_url, title, locations\[\], terms\[\], category, degrees\[\], sponsorship, url, ats\_type, date\_posted, date\_updated, active, first\_seen\_pull\_id, last\_seen\_pull\_id, user\_status (new / interested / skipped / applied), notes |
| `job_descriptions` | Fetched description text | job\_id, text, html (optional), method (greenhouse\_api / lever\_api / ashby\_api / readability), fetched\_at, error |
| `job_matches` | Match results | job\_id, profile\_version, matcher\_version, status (not\_scored / scored / error), result (JSON matching `MatchResult`), computed\_at |
| `llm_calls` | Audit of every model call | action, model, prompt\_version, input\_tokens, output\_tokens, cost\_usd, duration\_ms, ok, error |

`ats_type` is derived from the posting URL's host at pull time (workday, greenhouse, lever, ashby, oracle, icims, smartrecruiters, other), since V2 will need it.

## Profile

The profile is the single source of truth for matching now and for filling applications in V2. Each section is its own form card with its own Save button; fields marked "you only" are never filled by resume import.

| Section | Fields | Notes |
| --- | --- | --- |
| Identity | legal first, middle, last name; preferred name; pronouns (optional) |  |
| Contact | email, phone, street, city, state, postal code, country |  |
| Links | LinkedIn, GitHub, portfolio/website, other (label + URL) |  |
| Education (list) | school, degree type (BS/BA/MS/PhD/other), major(s), minor(s), GPA + scale, start date, expected graduation (month + year), relevant coursework, honors | Ordered; first entry is the current one |
| Experience (list) | company, title, employment type (internship / full-time / part-time / research / TA), location, start, end or current, bullet points, skills used |  |
| Projects (list) | name, role, dates, description bullets, skills, link |  |
| Skills | languages, frameworks/libraries, tools/platforms, domains (e.g. ML, distributed systems), each with an optional level (familiar / proficient / expert) | Used heavily by matching |
| Preferences | target roles/categories, terms (e.g. Summer 2027), locations, remote OK, willing to relocate (yes / no / some places), company exclusions, minimum pay (optional) | Drives job filters and the eligibility step |
| Work authorization (you only) | authorized to work in the US, need sponsorship now, need sponsorship in the future, citizenship status, security clearance | Stored as explicit answers, never inferred |
| Standard answers (you only for EEO) | over 18, earliest start date, available for full term, how you heard about us (default), gender, race/ethnicity, veteran, disability (each with "decline to answer" as a choice) | Feeds the V2 answer ladder |
| Writing samples (list) | title, kind (essay / application answer / email / other), text | For voice matching later |
| Resumes | uploaded PDFs with a label and a default | Managed on the same screen |

Add **Export** and **Import** buttons for the whole profile as a JSON file, so you have a backup and can edit in bulk.

## Resume import

Uploading a resume can pre-fill the profile, but only as a draft you approve. This is V1's only model call.

1. You upload a PDF (stored under `data/resumes/`) and click **Import from resume**.
2. The server sends the PDF to Claude as a document with a prompt asking for the profile sections that a resume can contain: identity, contact, links, education, experience, projects, skills. The response must match a Zod schema (a subset of `Profile`); invalid output gets one repair retry.
3. The draft is stored in `resume_imports` and shown as a side-by-side review: current profile value vs. imported value for each field, with a checkbox per field (new fields pre-checked, changed fields unchecked).
4. **Accept selected** merges the checked fields into the profile and bumps its `version`. **Discard** drops the draft.

Prompt rules: extract only what is written; never guess dates, GPA or contact details; leave a field empty rather than infer it; keep bullet text verbatim. Work authorization, standard answers and preferences are excluded from the schema entirely.

Also store plain extracted text of the resume (with a PDF text library such as `pdf-parse`, no model) in `resumes.extracted_text`, for search and later matching.

## Job board

Jobs come from the public `listings.json` that powers the Simplify/Pitt CSC internship repo, a structured stand-in for the SWElist emails. It's pulled only when you click **Pull jobs**.

**Source** (`jobs/sources/simplify-internships.ts`, implementing a `JobSource` interface with `pull(): Promise<RawListing[]>`):

- URL, configurable: `https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json`. The repo name changes each recruiting season, so keep it in config.
- About 13 MB, about 17,000 entries, about 4,800 with `active && is_visible` (checked Oct 16).
- Send the last pull's `ETag` as `If-None-Match`; a 304 means nothing changed.
- Fields used: `id`, `company_name`, `company_url`, `title`, `locations`, `terms`, `category`, `degrees`, `sponsorship`, `url`, `active`, `is_visible`, `date_posted`, `date_updated`. Validate each entry with Zod and skip (and count) malformed ones rather than failing the pull. `date_posted` is a Unix timestamp in seconds.
- `sponsorship` is "Other" for nearly all active entries, so show it but don't filter on it by default.

**Pull window:** keep only postings whose `date_posted` falls in the last N days. N defaults to 7 and can be changed in Settings or in a dropdown next to the button (3, 7, 14, 30, or all). The file has no date query, so it is always downloaded whole and the window is a filter applied before the upsert. On Oct 16, the windows kept 315 (3 days), 524 (7), 1,069 (14) and 2,048 (30) of 4,821 active postings. Jobs already stored are still updated and still marked closed when they go inactive, even if they've aged out of the window. If the window was widened since the last pull, skip the ETag shortcut so older postings get added.

**Pull steps:** create a `job_pulls` row → download → validate → upsert into `jobs` in one transaction (insert new, update changed, set `active = false` on entries no longer active or visible) → record added/updated/closed counts → show them in a toast and on the Jobs screen header.

**Browsing:**

- Default view: active jobs, newest first, with a "New" badge on jobs first seen in the latest pull.
- Filters: text search over company, title and fetched descriptions (SQLite FTS5), category, term, location (text + "remote"), ATS, posted within N days, degree, user status, and later match score. "Apply my preferences" sets filters from your profile preferences.
- Row actions: open posting (new tab), mark interested / skipped / applied, add a note. Bulk actions on selected rows.
- Job detail panel: all listing fields, description (with a **Fetch description** button), match panel, your notes.

A second source (the Simplify new-grad repo) can be added later through the same interface; check its file path and schema before adding it.

## Job descriptions

The listings file has no description text, and matching needs it. Descriptions are fetched on demand: from the job detail panel, or for selected rows with **Fetch descriptions** (one at a time, at least 1 second apart, with a progress bar and a cancel button).

**Fetchers**, tried in order by `ats_type` (verify each endpoint against current docs and save a sample response as a fixture):

| ATS | Method |
| --- | --- |
| Greenhouse | Public Job Board API: `boards-api.greenhouse.io/v1/boards/<board>/jobs/<id>` (board and id parsed from the URL) |
| Lever | Public postings API: `api.lever.co/v0/postings/<company>/<posting id>` |
| Ashby | Public posting API for the job board (check Ashby's docs for the endpoint) |
| Everything else, including Workday | Fetch the posting URL, extract the main text with `@mozilla/readability`; if the result is under about 500 characters, mark it `error: needs_browser` |

Store plain text (HTML stripped, whitespace normalized) in `job_descriptions`. Workday and other JavaScript-rendered pages may often need a real browser; those can be handled in V2 once Playwright exists. Show the error state in the UI with an "Open posting" link and a box to paste the description manually.

## Matching

V1 scores each job in three steps. Code checks hard eligibility rules first. Then one model call lists the posting's qualifications and checks each against your profile, quoting evidence. Finally, code turns that checklist into a score and a verdict. The model never picks the number, so scores stay consistent across jobs, and a job with no description is not scored at all.

**Interface and types** (`src/match/` and `src/shared/match.ts`; `NotScoredMatcher` stays as the fallback for tests and for jobs without a description):

```ts
export interface Matcher {
  readonly version: string;                  // 'rubric@1'; bump when prompt, weights or rules change
  score(input: MatchInput): Promise<MatchResult>;
}

export type MatchInput = {
  profile: Profile; profileVersion: number;
  job: Job; description: string | null;
};

// What the dashboard renders (Zod schema)
export type MatchResult = {
  status: 'not_scored' | 'scored' | 'error';
  score: number | null;                                   // 0-100, computed in code
  verdict: 'strong' | 'good' | 'stretch' | 'weak' | 'ineligible' | null;
  eligibility: { eligible: boolean | null; blockers: { rule: string; detail: string }[] };
  strengths: { point: string; evidence: { job: string; profile: string } }[];
  gaps: { point: string; severity: 'required' | 'preferred' }[];
  skills: { required: { skill: string; have: boolean }[];
            preferred: { skill: string; have: boolean }[] };
  summary: string | null;
  warnings: string[];   // e.g. 'posting mentions a clearance requirement', 'low confidence'
};

// What the model returns (Zod schema); the model never returns a score
export type FitChecklist = {
  requirements: {
    text: string;                                  // short paraphrase
    kind: 'required' | 'preferred';
    category: 'skill' | 'experience' | 'education' | 'other';
    met: 'yes' | 'partial' | 'no' | 'unclear';
    jobQuote: string;                              // exact words from the posting
    profileEvidence: string | null;                // exact words from the profile
  }[];                                             // at most 15
  hardRequirements: { text: string; jobQuote: string }[];  // citizenship, clearance, grad window, location
  summary: string;
};

export class RubricMatcher implements Matcher {
  version = 'rubric@1';
  async score(input: MatchInput): Promise<MatchResult> {
    if (!input.description) return notScored('No description yet; fetch it first.');
    const elig = checkEligibility(input);           // eligibility.ts, no model
    if (!elig.eligible) return ineligible(elig);    // stops here, no model call
    const fit = await llmFit(input);                // llm-fit.ts, one call via src/llm
    return assemble(elig, verifyQuotes(fit, input)); // score.ts
  }
}
```

**Step 1 — Eligibility, no model** (`eligibility.ts`). A rule blocks only when the posting clearly states the requirement and your profile clearly conflicts; anything uncertain becomes a warning instead.

| Rule | Blocks when | Source of truth |
| --- | --- | --- |
| `term` | The listing's terms don't overlap your preferred terms (ignored when the listing says N/A) | Listing `terms`, profile preferences |
| `degree` | Your current degree level isn't in the listing's `degrees` list (check its exact values in the data) | Listing `degrees`, profile education |
| `citizenship` | The listing's `sponsorship` says citizenship is required, or the description matches phrases like "must be a U.S. citizen" / "U.S. citizenship is required", and you aren't a citizen | Description, work authorization |
| `clearance` | The description requires an active security clearance and you don't have one | Description, work authorization |
| `sponsorship` | The description says the company won't sponsor ("unable to sponsor", "will not provide sponsorship") and you need sponsorship now or later | Description, work authorization |
| `grad_window` | The description gives a graduation range ("graduating between Dec 2026 and Jun 2027") and your expected graduation is outside it | Description, education |

Location mismatches are a warning, not a blocker. Keep the phrase lists in one file with tests for wordings that must and must not trigger ("sponsorship is available" must not block).

**Step 2 — Fit check, one model call** (`llm-fit.ts`, prompt in `src/llm/prompts/match-fit@1.md`). The model gets the job title, company and description (truncated at 15,000 characters with a warning) and only the education, experience, projects and skills sections of the profile, as JSON. It never sees contact details, work authorization, EEO answers or writing samples. Use a small model from config (`MATCH_MODEL`) and compare it against a stronger one on the labeled set before settling.

System prompt, version 1:

```text
You compare one job posting with one candidate profile and return a requirements
checklist as JSON. You do not score or rank; code does that.

Rules:
1. List each distinct qualification the posting asks for, at most 15. Merge
   duplicates. Skip benefits, company descriptions and application instructions.
2. kind = "required" if the posting says required, must, minimum or basic
   qualifications, or gives no qualifier. kind = "preferred" for preferred,
   nice to have, bonus or plus.
3. met:
   - "yes" only if the profile explicitly shows it. Close synonyms count
     (JS = JavaScript, Postgres = PostgreSQL); related but different things do
     not (React is not Vue, C is not C++).
   - "partial" if the profile shows part of it (one year when two are asked;
     coursework but no project).
   - "no" if the profile is specific enough to show it is missing.
   - "unclear" for soft skills or anything a profile cannot show.
4. jobQuote: copy the exact words from the posting. profileEvidence: copy the
   exact words from the profile, or null when met is "no" or "unclear".
5. Put citizenship, security clearance, sponsorship, graduation-date and
   location requirements in hardRequirements with an exact quote. Do not decide
   eligibility.
6. Never invent experience, skills or numbers. If the posting lists no real
   qualifications, return an empty requirements list.
7. summary: one or two plain sentences naming the biggest strength and the
   biggest gap.
Return only JSON matching the schema.
```

User message: `<job title="…" company="…">{description}</job>` followed by `<profile>{profile subset as JSON}</profile>`.

**Quote check (code).** For every requirement, `jobQuote` must appear in the description and `profileEvidence` must appear in the serialized profile, compared after normalizing whitespace and case. An item whose evidence isn't found is downgraded to `unclear` and counted in a warning, so invented evidence can't raise a score.

**Step 3 — Score and verdict, in code** (`score.ts`):

- Weights: required items 3, preferred 1. Values: yes 1, partial 0.5, no 0. Unclear items are left out.
- `score = round(100 × Σ(weight × value) / Σ weight)` over the judged items.
- Two or more required items marked "no" cap the score at 59.
- Fewer than 3 judged items add the warning "low confidence".
- Verdict: 80+ strong, 65–79 good, 50–64 stretch, below 50 weak; `ineligible` comes only from step 1. Keep the weights and thresholds in config and tune them on your labels.
- Strengths = items met "yes" with their evidence; gaps = items met "no" or "partial", required first; the skills checklist = items in the skill category.
- `hardRequirements` the model found that no step-1 rule handled become warnings ("posting mentions a clearance requirement").

**In the app:**

- **Score match** on the job panel and **Score selected** on the board. Score selected first shows the job count and an estimated cost (about 4 characters per token, prices from config) and asks to confirm; then it runs two jobs at a time with a progress bar and cancel.
- Results are saved to `job_matches` and reused until the profile version or the matcher version changes; then the panel says "profile changed, rescore".
- The match panel shows the score, verdict, blockers, strengths with evidence, gaps, skills checklist, summary and warnings. The board gets a sortable score column and a minimum-score filter.

**Demo and evaluation scripts:**

- `pnpm match:demo <jobId>` prints the exact system prompt, the user message, the raw model JSON and the final `MatchResult` for one job. Use it to show one real input and output.
- `pnpm match:eval` runs the matcher on `fixtures/match-labels.json`: about 20 jobs with saved descriptions, each labeled by you with the expected verdict, eligibility and key gaps. It reports verdict agreement, agreement within one step ("good" vs. "strong"), eligibility accuracy, and how many quotes failed the check, and lists every disagreement. It calls the model, so it runs by hand only, never in tests.

## Dashboard screens

Three screens and a settings page, at `http://127.0.0.1:<port>`.

| Screen | Shows | Actions |
| --- | --- | --- |
| Profile | Section cards (see Profile), resumes, completeness meter (which sections are empty) | Edit and save per section; upload resume; Import from resume → review screen; export/import JSON |
| Resume import review | Current vs. imported value per field | Check fields, Accept selected, Discard |
| Jobs | Pull jobs button with last-pull time and counts; filterable, sortable job table; detail panel with description and match panel | Pull jobs; filter; mark status; add note; fetch descriptions; score match; score selected (with a cost estimate) |
| Settings | Data folder, model IDs, API key status, listings source URL, pull window (default 7 days), cost so far (from `llm_calls`) | Save |

### V1 frontend design (2026-11-01)

- Dark ink surfaces, lilac accents, softly rounded shapes, and no decorative gradients or emoji. A persistent desktop sidebar becomes compact navigation on mobile.
- Jobs use a virtualized table with role/company together, location/term together, score, posted date, and status. The table shares the page's vertical scroll area, so the heading and filters scroll away and jobs can fill the viewport. Only wide columns use horizontal scrolling; there is no nested vertical list scrollbar. Listing metadata remains available in the detail dialog.
- Status tabs separate Explore (hides skipped), Interested, Applied, Skipped, and All jobs. Search, category, term, and minimum score stay visible; location, remote, platform, posting age, degree, profile preferences, and closed postings live under Filters.
- Minimum score accepts any integer from 0 to 100. Empty means any score; entering 0 includes numeric scores of zero but excludes unscored, failed, and ineligible results without a numeric score. Posting age accepts a custom number of days; empty means any date.
- Reset all restores the default filters and hides closed postings. Changing filters clears selections; bulk actions target only the visible selected jobs and retain that target set while the request is running.
- The job detail dialog supports Escape, keyboard focus containment, and return of focus to the prior control. Notes retain their existing save-on-blur behavior with visible save feedback.
- Profile retains every section and its own Save button, with section shortcuts and saved-section indicators. Profile saves/imports refresh cached match results so stale scores are shown correctly.
- Settings accepts a custom default pull window (0?3650 days; 0 means all). The Jobs pull selector also displays a custom saved default.
- Empty states explain the next action: before the first pull, show the empty board, the listing source, and a Pull jobs action; a filtered empty result offers Reset filters.

## Security and testing

**Security:**

- Server binds to `127.0.0.1` only and checks `Host`/`Origin`; a random token generated on first run (in `.env`) is required on every API call.
- `data/` (SQLite file, resumes), `.env` and any fixtures with real personal data are gitignored from the first commit. Committed fixtures use fake profiles.
- Logs never include profile contents or resume text; log IDs and counts.
- The API key is read from `.env` only and never sent to the browser.

**Testing:**

- **Profile:** Zod schema round-trips; partial saves per section; export then import gives an identical profile; `version` increments on every write path, including resume import.
- **Resume import:** schema validation and the merge logic with recorded model responses (no live calls); sensitive sections can't appear in a draft.
- **Job pull:** run against a saved slice of `listings.json` (a few hundred entries plus deliberately malformed ones); assert counts, the pull window, upsert behavior, closed detection, 304 handling and `ats_type` mapping.
- **Descriptions:** each fetcher against a saved API response or HTML fixture.
- **Matching:** each eligibility rule against description snippets that must and must not trigger it; score and verdict math from fixed checklists (including the cap and low-confidence cases); the quote check downgrades invented evidence; `RubricMatcher` end to end with a recorded model response; no description returns `not_scored` without a model call; stale results flip when the profile or matcher version changes.
- No test touches the network or calls a model. `match:eval` is a manual script, not a test.

## Milestones

Build in order and stop for review after each acceptance check.

### M0 — Skeleton

- [ ] Repo: pnpm, TypeScript strict, ESLint, Vitest, `.gitignore`, `.env.example`, `CHANGELOG.md`.
- [ ] Fastify server with token check; React + Vite dashboard with Tailwind and shadcn/ui, three empty screens and navigation.
- [ ] Drizzle schema and first migration for all eight tables.
- [ ] `src/llm/` module with `structured()`, logging to `llm_calls`, and a fake client for tests.

**Accept:** `pnpm dev` serves the dashboard on localhost; API calls without the token get 401; tests pass.

### M1 — Profile

- [ ] `Profile` Zod schema covering every section in the Profile table.
- [ ] Section forms with validation and per-section save; list editing for education, experience, projects, writing samples.
- [ ] Resume upload and storage, default resume, plain-text extraction.
- [ ] Export/import JSON; completeness meter.

**Accept:** you enter your real profile, restart the app, and everything is still there; exporting and re-importing gives an identical profile.

### M2 — Resume import

- [ ] Import prompt (versioned) and draft schema excluding sensitive sections.
- [ ] Review screen with per-field checkboxes; accept and discard.

**Accept:** importing your resume fills education, experience, projects and skills correctly enough that you change fewer than five fields; work authorization and standard answers stay untouched; the call appears in `llm_calls` with its cost.

### M3 — Job board

- [ ] `JobSource` interface and the Simplify internships source with ETag support.
- [ ] Pull jobs button, `job_pulls` record, upsert and closed detection, counts toast.
- [ ] Job table with filters, sorting, New badge, statuses, notes, bulk actions; "Apply my preferences".

**Accept:** one click loads the last 7 days of active postings in under 30 seconds; a second click right after reports no changes; switching the window to 30 days adds the older postings; filtering stays responsive with the window set to all (about 4,800 rows).

### M4 — Descriptions and matching scaffold

- [ ] Greenhouse, Lever, Ashby and Readability fetchers; single and bulk fetch with progress and cancel; manual paste.
- [ ] `Matcher` interface, `MatchResult` schema, `NotScoredMatcher`, `job_matches` storage, staleness rule.
- [ ] Match panel and score column wired to the stub.

**Accept:** descriptions load for 10 Greenhouse, 5 Lever and 5 Ashby postings; every job shows the match panel with "Not scored yet"; changing the profile marks stored results stale.

### M5 — Match scoring

- [ ] `eligibility.ts` with the six rules, its phrase lists and tests.
- [ ] `match-fit@1` prompt, `FitChecklist` schema, `llm-fit.ts` through `src/llm/`, and the quote check.
- [ ] `score.ts` with weights and thresholds from config; `RubricMatcher` replaces the stub as the active matcher.
- [ ] Score match and Score selected (cost estimate, confirm, two at a time, progress, cancel); score column and minimum-score filter.
- [ ] `match:demo` and `match:eval` scripts; label about 20 jobs in `fixtures/match-labels.json` (roughly 5 strong, 5 weak, 5 in between, 3 ineligible, 2 without a description).

**Accept:** `match:eval` agrees with your verdict on at least 14 of 20 jobs and is within one step on at least 18; every job you labeled ineligible is caught; no evidence that failed the quote check appears in the panel; `match:demo` prints the prompt, input and output for one real job.

**Building matching first:** M5 needs only M0, the `Profile` schema from M1, and job descriptions. To build it before the rest, give `match:demo` file inputs (`--profile profile.json --job job.json --description description.txt`) and work from saved fixtures; wire it into the dashboard once M3 and M4 exist.

**Next after V1:** V2 applying (see the V2 spec tab).