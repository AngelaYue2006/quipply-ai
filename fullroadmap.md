# Build spec: job application autofiller

Oct 16, 2026 · @Aspire

V1 is a local, single-user tool: a Chrome MV3 extension fills ATS forms page by page, a local TypeScript backend orchestrates runs and keeps memory in SQLite, and the owner always clicks Submit. The Plan review tab holds the reasoning behind these choices.

## Goal and scope

The owner selects 5–10 internship postings, walks away, and comes back to an inbox where each application is either parked at its final review page or stalled on a specific question. Nothing is ever submitted by the software.

**V1 is done when** 10 postings selected from the daily listings, mixed across Greenhouse, Lever, Ashby and Workday, end roughly as: 6 ready for review, 2 needing one answer, 1 needing a CAPTCHA or focus, 1 unsupported. Every filled field must show its value and source on the review screen.

**In V1:**

- Job ingestion from the Simplify/Pitt CSC `listings.json`, with filters and a select-to-queue list.
- A structured profile, filled through an onboarding form (identity, education, experience, skills, work authorization, EEO choices, links, writing samples, resume variants).
- Adapters for Greenhouse, Lever, Ashby and Workday, plus a conservative generic adapter that only fills what it can map confidently.
- Question memory with scope and polarity, a stall-and-answer loop, and pre-flight questions.
- AI-written short answers with research, voice matching and an approval gate.
- Parallel runs (2–3 actively filling, up to 10 open), each a resumable state machine.
- A review summary with per-field provenance.

**Not in V1:** job matching or ranking, resume tailoring, cover letters, LinkedIn Easy Apply, iCIMS/Oracle/SmartRecruiters/Taleo adapters, cloud hosting, any submission, CAPTCHA solving or anti-detection tricks.

## Hard rules

Each rule needs at least one automated test. A change that breaks one is a bug, whatever else it fixes.

1. **Never submit.** The runner may click only allowlisted controls (Next, Continue, Save and continue, Add, Upload, dropdown options, radio/checkbox inputs). Any control whose text, `type=submit` or `data-automation-id` suggests submit/apply/send/finish is blocked unless the adapter has positively identified the current page as a mid-flow step. Single-page forms are always treated as final pages.
2. **Work authorization, sponsorship, EEO, disability, veteran and criminal-history answers come only from the profile.** No model may infer or generate them. If the profile has no answer or the options don't map cleanly, stall.
3. **Attestations and signatures always stall** ("I certify…", "Did you use AI…", e-signature fields), unless the owner has pre-approved that exact canonical question.
4. **AI output never becomes a fact.** Only owner-entered or owner-confirmed answers are stored as facts or style exemplars.
5. **Required fields are never left blank silently.** Unknown required field → stall. Unknown optional field → configured default or blank, listed in the review summary.
6. **Every filled field is logged** with value, source tier, match score (if any) and timestamp.
7. **Never bypass CAPTCHAs or bot checks.** Detect them and move the run to `NEEDS_CAPTCHA`.
8. **No secrets or sensitive IDs leave the machine.** Passwords never go to an LLM; SSNs are never stored; LLM prompts include only the profile fields relevant to the question.
9. **One active run per Workday tenant** at a time.

## Architecture

&#91;embedded content: components · Chrome extension, local backend, storage and external services\]

The extension holds no state: the orchestrator persists every run, and the answer engine reads and writes memory in SQLite. The answer engine also calls the Claude API for equivalence checks and option mapping; calls to the Claude API, the search API and the listings file are the only traffic that leaves the machine.

## Tech stack and repo layout

All TypeScript in one pnpm monorepo, so the field and message schemas are shared by the extension, backend and dashboard. (Python backend is an open decision below; default is TypeScript.)

| Layer | Choice |
| --- | --- |
| Language / runtime | TypeScript (strict), Node 22 LTS, pnpm workspaces |
| Shared schemas | Zod, exported from `packages/shared` |
| Extension | Chrome Manifest V3, Vite build, `chrome.tabs`, `chrome.scripting`, `chrome.sidePanel`, `chrome.storage.session` |
| Backend | Fastify, WebSocket for the extension, REST for the dashboard |
| Database | SQLite via better-sqlite3, Drizzle ORM and migrations, `sqlite-vec` for embeddings |
| Dashboard | React + Vite, served by the backend at `http://127.0.0.1:<port>` |
| LLM | Claude API via the official SDK; model IDs in config (small model for classification, stronger model for essays) |
| Embeddings | Configurable provider behind one interface; cache vectors in SQLite |
| Web research | One search API behind an interface (Brave, Exa or Tavily) |
| Secrets | OS keychain through a maintained Node binding |
| Tests | Vitest for units; Playwright only to load saved fixture pages offline, never against live sites |

```text
apply-engine/
  packages/
    shared/          # Zod schemas: DetectedField, FillAction, messages, enums
    extension/       # MV3: service worker, content scripts, side panel
      src/adapters/  # greenhouse.ts, lever.ts, ashby.ts, workday.ts, generic.ts
      src/dom/       # field extraction, fill primitives, interlock
    backend/
      src/orchestrator/  # run state machine, scheduler, concurrency
      src/answers/       # resolution ladder, canonical questions, option mapping
      src/generate/      # research, essay pipeline, style retrieval
      src/ingest/        # listings.json poller
      src/db/            # Drizzle schema, migrations
      src/llm/           # Claude client, prompts, model config
    dashboard/       # React UI
  fixtures/          # captured form pages: <ats>/<company>-<page>.html + .png + meta.json
  seeds/             # canonical_questions.json
  SPEC.md            # this document
  CLAUDE.md          # agent working notes (last section)
```

## Data model

One SQLite file in the user's app-data folder. Every table has `id`, `created_at`, `updated_at`. Scope and polarity live on questions and answers, because that is where reuse goes wrong.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `profile` | Single row of core facts | JSON columns per section: identity, contact, links, education\[\], experience\[\], skills, work\_auth, eeo\_policy, preferences, defaults |
| `resume_variants` | PDFs per role family | name, role\_tags\[\], file\_path, is\_default |
| `writing_samples` | Owner's own writing for style | text, kind (essay/email/answer), embedding |
| `canonical_questions` | Question types the system knows | key (e.g. `requires_sponsorship`), category, answer\_type (bool/enum/text/date/number/multi), polarity\_note, default\_scope, sensitivity, embedding, seen\_count |
| `question_variants` | Every raw label seen | raw\_text, normalized\_text, hash, ats, canonical\_key (nullable), match\_score, verified (bool) |
| `answers` | Reusable answers | canonical\_key, value (JSON), scope (global/company/application), company\_id?, condition (JSON, nullable), source (owner/owner\_confirmed/ai\_unreviewed), expires\_at?, last\_confirmed\_at |
| `option_mappings` | Stored answer → chosen option | canonical\_key, value\_hash, options\_hash, chosen\_option\_text |
| `companies` | Normalized companies | name, domains\[\], workday\_tenant? |
| `company_research` | Cached research | company\_id, program\_summary, eng\_summary, recent\_items (JSON), source\_urls\[\], retrieved\_at (30-day TTL) |
| `jobs` | Ingested postings | listing\_id (from source), company\_id, title, locations\[\], terms\[\], url, ats\_type, date\_posted, active, status (new/queued/skipped/applied/closed) |
| `application_runs` | One per application attempt | job\_id, state, ats\_type, tab\_id?, page\_index, page\_fingerprint, resume\_variant\_id, error?, started\_at, ready\_at?, submitted\_at? |
| `field_log` | Every field touched | run\_id, page\_index, label, field\_type, value (JSON), source\_tier, match\_score?, canonical\_key?, status (filled/stalled/skipped/verified/reverted) |
| `pending_questions` | Stalls and pre-flight items | run\_id?, job\_id?, raw\_text, field\_type, options\[\], required, canonical\_key?, status (open/answered/dismissed), answer\_id? |
| `essays` | Generated long answers | run\_id, question, draft, final?, status (draft/approved/edited/rejected), research\_id?, exemplar\_ids\[\] |
| `credentials` | Per-tenant login metadata only | host, username, keychain\_ref (the password lives in the OS keychain) |
| `selector_cache` | Generic adapter memory | domain, field\_signature, locator |
| `page_captures` | Fixture metadata | run\_id, ats, url, html\_path, png\_path, captured\_at |

## Application run state machine

The backend owns every run's state; the extension is stateless and can be killed at any moment. Each transition is persisted before the next action, so a crash or restart resumes from the last state.

```ts
type RunState =
  | 'QUEUED'            // selected, waiting for a slot
  | 'OPENING'           // tab created, navigating to posting, clicking Apply
  | 'AUTH_REQUIRED'     // sign-in or sign-up page detected (Workday tenants)
  | 'ANALYZING_PAGE'    // detect ATS + page kind, extract fields
  | 'FILLING'           // resolving and setting fields
  | 'VALIDATING'        // read-back + scrape validation errors
  | 'ADVANCING'         // clicking an allowlisted Next, waiting for the next page
  | 'READY_FOR_REVIEW'  // final page reached; parked
  | 'NEEDS_INPUT'       // required unknowns on this page (page otherwise filled)
  | 'NEEDS_FOCUS'       // a widget/upload failed in the background tab
  | 'NEEDS_CAPTCHA'
  | 'SUBMITTED'         // owner submitted; confirmation page detected
  | 'CLOSED'            // posting no longer accepting applications
  | 'UNSUPPORTED'       // no adapter could make progress
  | 'FAILED';           // unexpected error, with captured page

// Main path
QUEUED -> OPENING -> ANALYZING_PAGE -> FILLING -> VALIDATING
VALIDATING -> ADVANCING        // all required filled, no errors, page is mid-flow
VALIDATING -> FILLING          // validation errors mapped to fields (max 2 retries)
VALIDATING -> READY_FOR_REVIEW // page is final
ADVANCING -> ANALYZING_PAGE    // new page fingerprint seen

// Exits that wait for the owner, then return to ANALYZING_PAGE
OPENING | ANALYZING_PAGE -> AUTH_REQUIRED | NEEDS_CAPTCHA | CLOSED
FILLING -> NEEDS_INPUT | NEEDS_FOCUS
READY_FOR_REVIEW -> SUBMITTED  // only by observing the confirmation page
any -> FAILED | UNSUPPORTED
```

- **Concurrency:** at most 3 runs in `OPENING`–`ADVANCING` at once; up to 10 open tabs total; one active run per Workday tenant. All configurable.
- **Timeouts:** page load 30 s, fill step 15 s per field, advance 45 s; a timeout captures the page and goes to `FAILED`.
- **Loop guard:** the same page fingerprint seen 3 times after advancing → `FAILED`.
- **Resume:** on restart, re-attach to the run's tab if it exists, else reopen the URL and re-enter `ANALYZING_PAGE`; fill is idempotent (already-correct fields are skipped).

## Extension–backend protocol

One WebSocket from the extension's service worker to `ws://127.0.0.1:<port>/ext`, authenticated with the install token (see Security). The backend decides; the extension observes and acts. All messages are Zod-validated in `packages/shared` and carry `runId` and a `seq` for idempotency.

```ts
// backend -> extension
{ type: 'open_run', runId, url }                        // create tab, report tabId
{ type: 'analyze', runId }                              // detect page + extract fields
{ type: 'fill', runId, actions: FillAction[] }          // set values, then read back
{ type: 'advance', runId, controlId }                   // click an allowlisted control
{ type: 'capture', runId }                              // save HTML + screenshot
{ type: 'focus', runId, fieldId? }                      // bring tab forward, scroll to field
{ type: 'park', runId }                                 // stop acting on this tab

// extension -> backend
{ type: 'hello', extVersion, token }
{ type: 'tab_opened', runId, tabId }
{ type: 'page_analyzed', runId, ats, pageKind, fingerprint, fields: DetectedField[], controls: Control[] }
{ type: 'fill_result', runId, results: { fieldId, ok, readBack, error? }[] }
{ type: 'validation', runId, errors: { fieldId?, message }[] }
{ type: 'navigated', runId, url, fingerprint }
{ type: 'blocked', runId, reason: 'captcha'|'auth'|'closed'|'focus_needed'|'submit_blocked', detail }
{ type: 'confirmation_seen', runId }                    // owner submitted
{ type: 'capture_saved', runId, htmlPath, pngPath }
```

- Content scripts are reinjected after every navigation and must re-send `page_analyzed`; they hold no state.
- The service worker reconnects with backoff when it wakes, and keeps the socket active with a heartbeat every 20 s while runs are open.
- The side panel subscribes to run state over the same backend so it shows live status beside any tab.

## Browser layer

Adapters run as page-context JavaScript inside content scripts, with no Chrome-API calls of their own, so the same code could later be injected by another host (separate windows or Electron).

```ts
interface DetectedField {
  fieldId: string;          // stable within the page: adapter key or DOM path hash
  label: string;            // best label text (see extraction order)
  helpText?: string;
  fieldType: 'text'|'textarea'|'email'|'tel'|'number'|'date'|'select'|'combobox'
           |'radio'|'checkbox'|'checkbox_group'|'multiselect'|'file';
  required: boolean;
  maxLength?: number;
  options?: string[];       // custom dropdowns: open, read, close
  currentValue?: unknown;
  adapterKey?: string;      // e.g. 'workday:legalNameSection_firstName'
  section?: string;         // fieldset legend or page section heading
}

interface AtsAdapter {
  id: 'greenhouse'|'lever'|'ashby'|'workday'|'generic';
  matches(url: URL, doc: Document): boolean;
  pageKind(doc: Document): 'posting'|'auth'|'form'|'review'|'confirmation'|'closed'|'unknown';
  isMidFlowStep(doc: Document): boolean;     // gates the interlock
  extractFields(doc: Document): Promise<DetectedField[]>;
  setValue(field: DetectedField, value: FillValue): Promise<void>;
  readBack(field: DetectedField): Promise<unknown>;
  validationErrors(doc: Document): { fieldId?: string; message: string }[];
  controls(doc: Document): Control[];        // classified: next | add | upload | submit | other
  fingerprint(doc: Document): string;        // page identity for loop detection
}
```

**Label extraction order:** `<label for>` → `aria-labelledby` → `aria-label` → wrapping `<label>` → fieldset `<legend>` + option text (radio groups) → nearest preceding text node within the same container → `placeholder`. Normalize whitespace; keep the raw text too.

**Fill primitives** (in `src/dom/`):

- **Text inputs:** focus, set via the native value setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`), dispatch bubbling `input` and `change`, blur. Same for textarea with its prototype.
- **Native selects:** set `value`, dispatch `change`.
- **Custom dropdowns / comboboxes:** click to open, wait for the listbox, type to filter when supported, click the option whose text matches, verify the displayed value. Workday prompts ("How did you hear about us?") may be multi-level.
- **Radios / checkboxes:** click the input or its label, then verify `checked`.
- **Dates:** prefer typing into the text part in the site's format; fall back to the picker.
- **Files:** fetch the resume bytes from the backend, build a `File`, attach through `DataTransfer` to the input, dispatch `change`; verify the filename appears. On failure → `NEEDS_FOCUS`.
- **Dependent questions:** after each fill pass, re-extract until the field list is stable for 2 consecutive passes (max 5).

**Submit interlock** (`src/dom/interlock.ts`): every click goes through `safeClick(control)`. It throws `SubmitBlocked` unless the control is classified `next | add | upload | option` **and** `adapter.isMidFlowStep()` is true for navigation controls. Classification uses text, `type`, `aria-label`, `data-automation-id` and form position. The runner never calls `element.click()` directly; a lint rule forbids it outside `interlock.ts`.

**Adapter notes:**

- **Greenhouse:** usually one page, hosted at `job-boards.greenhouse.io` or embedded in a company site through a cross-origin iframe (content scripts need `all_frames`). One page = always final.
- **Lever:** single page at `jobs.lever.co/.../apply`; standard fields plus custom question cards.
- **Ashby:** single page at `jobs.ashbyhq.com`; React form, custom selects.
- **Workday:** multi-step at `*.myworkdayjobs.com`; target elements by `data-automation-id`; detect step headings (My Information, My Experience, Application Questions, Voluntary Disclosures, Self Identify, Review). Choose "Apply Manually". Handle sign-in vs create-account (see Security). The Review step is final.
- **Generic:** fills only fields that resolve at rung 1–3 of the answer ladder, never clicks navigation, and always ends in `READY_FOR_REVIEW` or `UNSUPPORTED`.

## Answer engine

For each field, the engine first identifies which canonical question it is, then gets the answer for that canonical question. Identification and answering are separate steps, so a fuzzy match can never invent a value.

**Resolution ladder** (stop at the first rung that answers):

1. **Adapter mapping:** a known `adapterKey` maps directly to a profile path (e.g. `workday:legalNameSection_firstName` → `profile.identity.firstName`).
2. **Exact variant:** hash of the normalized label (lowercase, punctuation and company names stripped) found in `question_variants` with `verified = true`.
3. **Semantic match:** embedding similarity to `canonical_questions`. Starting thresholds, to be tuned on fixtures: ≥ 0.92 accept; 0.80–0.92 → small-model equivalence check that must also confirm polarity; < 0.80 → no match. Sensitive categories never auto-accept on similarity alone.
4. **Derived answer:** computed from structured data (skills ∩ options, years of experience, graduation term from date).
5. **Option mapping:** stored value → one of this field's options. Try `option_mappings`, then fuzzy text match, then the small model constrained to return one listed option or `UNSURE`.
6. **Generate:** only for `long_text` questions whose category allows it (next section).
7. **Stall:** create a `pending_questions` row and move on to the next field.

**Category policies:**

| Category | Examples | Answer source | Model allowed? | If unknown |
| --- | --- | --- | --- | --- |
| identity\_contact | name, email, phone, address, links | profile | no | stall |
| education | school, degree, major, GPA, grad date | profile | option mapping only | stall |
| experience | employer, title, dates, years of X | profile / derived | option mapping only | stall |
| work\_authorization | authorized to work, requires sponsorship, citizenship | profile only | no | stall |
| eeo | gender, race, veteran, disability | profile policy (default: decline to answer) | no | use "decline" option, else stall |
| logistics | start date, relocation, location preference, in-office | answers (may be conditional) | option mapping only | stall |
| company\_specific | worked here before, know anyone here, applied before | answers, scope = company | no | stall |
| attestation | certify true, AI-use disclosure, signature | owner pre-approval only | no | always stall |
| sourcing | how did you hear about us | profile default | option mapping | default option |
| long\_text | why us, why this role, describe a project | essay pipeline | yes | generate, mark AI draft |
| other\_short | anything else | answers | option mapping + equivalence | stall |

**Polarity:** opposite-meaning questions are separate canonical keys, each derived from the same profile fact. Seed at least these pairs in `seeds/canonical_questions.json`:

- `requires_sponsorship_now_or_future` vs `authorized_without_sponsorship`
- `currently_employed` vs `previously_employed_at_company`
- `willing_to_relocate_anywhere` vs `willing_to_relocate_to_location` (conditional on location)
- `over_18` vs `under_18`
- `has_criminal_conviction` (sensitive; always stall unless set in profile)

**Scope and conditions:**

- `global` answers apply everywhere; `company` answers only to that company; `application` answers never reuse.
- An answer's `condition` (e.g. relocation: yes, except a listed city) is checked against the job; if the condition can't be evaluated, stall.
- Answers with `expires_at` (GPA, enrollment, availability) are re-asked after expiry.

**Learning:** when the owner answers a stall, store the raw label as a verified variant, link or create the canonical question, save the answer with the scope the owner picks (default from the category), and increment `seen_count`. Questions seen 5+ times without a profile field are suggested on the Profile screen as new fields; the model never adds fields itself.

**Pre-flight:** before a batch starts, fetch each Greenhouse job's questions from the public job-board API (verify the endpoint shape against Greenhouse's docs), plus questions already captured for other single-page forms, run them through the ladder, and show every would-stall question on one screen.

## Generated answers

Long-text answers are drafts until the owner approves them. The pipeline runs per question and is cached per company.

1. **Classify the question** (small model): `needs_company_context` (why us, why this team), `needs_role_context` (why this role), or `candidate_only` (describe a project, a challenge). Only the first triggers web research.
2. **Job context:** scrape the posting's description from the posting page during `OPENING`; store it on the job.
3. **Company research** (only if needed, cached 30 days in `company_research`): search for the company's internship or university program page and engineering blog, fetch 2–4 pages, and summarize into program summary, engineering summary and 3 recent relevant items, with source URLs.
4. **Retrieve the owner's material:** the 3 most similar approved answers and writing samples (style exemplars), plus the profile experiences and projects most relevant to the role.
5. **Draft** (stronger model) with: the question, the character limit from `maxLength` (default 1,500), job summary, research summary, relevant experiences, exemplars, and a style note extracted once from the writing samples (length, formality, contractions, sentence length).
6. **Check** (small model): every claim about the owner traces to the profile; length fits; no generic filler phrases. Retry once on failure, else stall with the draft attached.
7. **Fill** and log as `ai_unreviewed`; the review screen marks it as an AI draft.
8. **Approve:** when the owner approves or edits on the review screen, the final text is stored in `essays` as `approved`/`edited` and becomes eligible as an exemplar. If the owner edits in the page directly, read the field back before submit is detected and store the edited text.

Prompt rules: experiences may come only from the profile; never invent numbers, dates or names; write in first person; match the exemplars' voice; stay within the limit. Prompts live in `src/llm/prompts/` as versioned files.

## Job ingestion

Poll the listings file every 3 hours (and on demand from the dashboard), upsert by `id`, and surface new active postings.

- **Source URL (configurable):** `https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json` (about 13 MB, 17,000+ entries, about 4,800 active as of 2026-10-16). Use `ETag`/`If-None-Match` to skip unchanged downloads.
- **Fields present:** `id`, `company_name`, `company_url`, `title`, `locations`, `terms`, `category`, `degrees`, `sponsorship`, `url`, `active`, `is_visible`, `date_posted`, `date_updated`, `source`.
- **Keep** entries with `active && is_visible`. Mark previously ingested jobs `closed` when they turn inactive.
- **ATS detection** from the `url` host: `myworkdayjobs.com` → workday, `greenhouse.io` → greenhouse, `jobs.lever.co` → lever, `jobs.ashbyhq.com` → ashby, `oraclecloud.com` → oracle, `icims.com` → icims, `smartrecruiters.com` → smartrecruiters, else `other`.
- **Filters:** term, category, location text, ATS (supported only by default), posted within N days, hide applied/skipped. Do not rely on `sponsorship`; it is "Other" for nearly all active entries.
- **Dedupe:** never queue a job with a run in `SUBMITTED`; warn when the same company + title was submitted in the last 90 days.
- **Source abstraction:** a `JobSource` interface so a SWElist email parser or another repo can be added later.

## Dashboard screens

The dashboard is the control surface; the Chrome side panel is a compact view of the same state.

| Screen | What it shows | Actions |
| --- | --- | --- |
| Jobs | New postings with company, title, location, ATS, posted date | Queue, skip, save; queue many at once |
| Pre-flight | Questions that would stall for the queued batch | Answer once (with scope); start batch |
| Runs | One row per run: company, role, state, page n of m, waiting reason | Open tab (focus), retry, cancel; filter by state |
| Questions inbox | Open stalls across all runs | Answer → saved to memory → filled into the page → run resumes |
| Run review | Field table: label, value, source tier, match score, status; AI drafts highlighted; validation history; page screenshots | Approve or edit essays, jump to field in tab, mark not applying |
| Profile | Structured profile sections, resume variants, writing samples, suggested new fields | Edit, add field from suggestion |
| Memory | Canonical questions, variants, answers with scope, source and expiry | Edit, merge, split, delete, change scope |
| Settings | Concurrency, defaults, model IDs, search provider, API keys, Workday email | Save |

Source tiers use one fixed color each: profile (green), remembered (blue), AI draft (purple), needs owner (yellow). Never show a percentage that isn't a measured match score.

## Security and privacy

The backend holds PII and portal passwords and listens on localhost, which any website can reach. Treat it as an exposed service.

- **Bind to `127.0.0.1` only**, on a configurable port.
- **Install token:** generated on first run, stored in the OS keychain, entered once in the extension's options page. Required on the WebSocket `hello` and on every dashboard API call (the dashboard receives it via an HTTP-only cookie set by the backend).
- **Origin checks:** WebSocket accepts only `chrome-extension://<configured id>`; REST accepts only the dashboard's own origin. No permissive CORS.
- **Secrets:** Workday passwords, API keys and the token live in the OS keychain; the database stores only a reference. Generate a unique password per tenant.
- **Workday accounts:** one configured email for all tenants. The adapter fills sign-up or sign-in; email verification → `AUTH_REQUIRED` with the link to check mail. (Reading the verification email automatically is a later, opt-in feature.)
- **LLM data minimization:** prompts include only the fields relevant to the question. Never send passwords, government IDs, date of birth or EEO answers.
- **Logging:** redact emails, phone numbers and addresses in application logs; field values are stored only in `field_log`.
- **Extension permissions:** host permissions limited to the supported ATS domains plus an opt-in list for generic sites; no `debugger` permission in V1.
- **Database at rest:** optional SQLCipher encryption (open decision).

## Testing strategy

Reliability comes from replaying real pages. Every bug found on a live site becomes a fixture and a test before it is fixed.

- **Fixture capture:** a `capture` command (side panel button and automatic on `FAILED`/`UNSUPPORTED`) saves the page's serialized HTML, a screenshot and `meta.json` (URL, ATS, page kind, date) under `fixtures/<ats>/`. Strip personal values before committing.
- **Adapter tests:** Playwright loads each fixture offline with the content-script bundle injected and asserts `pageKind`, the extracted field list (labels, types, required, options) and the classified controls. Snapshot the field list.
- **Fill tests:** on fixtures with interactive widgets saved as working pages, set values and assert read-back.
- **Interlock tests (blocking):** for every fixture whose page kind is `form` on a single-page ATS or `review` on Workday, assert `safeClick` throws `SubmitBlocked` for every submit-like control; assert no code path outside `interlock.ts` calls `.click()` (lint rule + test).
- **Answer-engine golden tests:** a table of 200+ real label variants → expected canonical key, including every polarity pair; must be 100% correct on sensitive categories and ≥ 95% overall before thresholds change.
- **Option-mapping tests:** stored values against real option lists from fixtures.
- **State-machine tests:** transition table coverage, crash/restart resume, loop guard, timeouts.
- **Live smoke runs:** manual, owner-supervised, never automated in CI.

## Milestones

Build in this order. Each milestone ends with its acceptance criteria passing and a short note in `CHANGELOG.md`. M0 can change the plan, so stop after it and report.

### M0 — Background-tab spike (decides the host)

- [ ] Minimal MV3 extension: open a given URL in a background tab, set 3 text fields, open and pick from 1 custom dropdown, attach a file, log timings and success.
- [ ] Run it on 3 Workday postings, 2 Greenhouse, 1 Lever, 1 Ashby, with the tab hidden for the whole run.
- [ ] Repeat with each application in its own small, visible window.

**Accept:** a written result table (site × step × background tab / own window: ok, stalled, failed) and a recommendation: extension tabs, extension windows, or a different host. Owner decides before M1.

### M1 — Skeleton, data and profile

- [ ] Monorepo, shared Zod schemas, lint (including the `.click()` rule), Vitest, CI running tests.
- [ ] SQLite schema and migrations for all tables; seed `canonical_questions.json` (at least 60 types including the polarity pairs).
- [ ] Backend with token auth, origin checks, keychain storage.
- [ ] Listings ingestion with filters; Jobs screen.
- [ ] Profile onboarding screen, resume variants, writing samples.

**Accept:** fresh clone → `pnpm i && pnpm dev` shows today's active postings filtered by term; profile saves and reloads; unauthenticated API calls get 401.

### M2 — Greenhouse end to end

- [ ] Extension service worker + WebSocket protocol; content-script reinjection.
- [ ] Field extraction, fill primitives, read-back, interlock, capture.
- [ ] Answer ladder rungs 1, 2, 4, 5 and 7; `field_log`.
- [ ] Orchestrator for a single run; Run review screen.

**Accept:** 5 live Greenhouse postings reach `READY_FOR_REVIEW` with every required field filled or stalled; interlock tests pass on their fixtures; nothing was submitted.

### M3 — Lever, Ashby, memory and stalls

- [ ] Lever and Ashby adapters with fixtures.
- [ ] Semantic matching (rung 3) with embeddings and the equivalence check; golden tests.
- [ ] Questions inbox: answer → store with scope → fill → resume.
- [ ] Pre-flight screen.

**Accept:** golden tests at 100% on sensitive categories and ≥ 95% overall; a question answered once is filled automatically on the next posting that asks it in different words.

### M4 — Parallel queue

- [ ] Scheduler with concurrency limits, per-tenant lock, timeouts, loop guard, crash resume.
- [ ] Runs screen, side panel status, focus-to-tab.

**Accept:** 8 queued postings across 3 ATSs run with at most 3 active; killing and restarting the backend mid-run resumes all runs.

### M5 — Workday

- [ ] Workday adapter: step detection, `data-automation-id` mapping, multi-level prompts, date fields, experience/education repeaters, Apply Manually.
- [ ] Auth flow: sign-in vs create account, keychain passwords, `AUTH_REQUIRED` on verification.
- [ ] Workday fixtures for every step.

**Accept:** 5 Workday postings from different tenants reach Review or a clearly-explained stall; the Review step's submit is blocked in tests and live.

### M6 — Generated answers

- [ ] Question classifier, research with cache, style note, exemplar retrieval, draft, check.
- [ ] Approval and edit flow on the review screen; exemplar promotion.

**Accept:** for 5 "Why us?" questions across 3 companies, drafts cite only profile facts, fit the limit, and research runs once per company.

### M7 — V1 acceptance

- [ ] Generic adapter (conservative), suggested profile fields, closed-posting detection, dedupe warnings.
- [ ] Run the V1 definition of done with 10 real postings and record the result.

## Open decisions

The spec uses the default in each row until the owner says otherwise.

| Decision | Default in this spec | Alternative |
| --- | --- | --- |
| Backend language | TypeScript (shared schemas) | Python + FastAPI |
| Host for background runs | Extension tabs | Extension windows or Electron, depending on M0 |
| Search API for research | Brave | Exa or Tavily |
| Database encryption at rest | Off (local disk only) | SQLCipher |
| Workday email verification | Owner clicks the link | Opt-in read-only Gmail integration later |
| Default concurrency | 3 active, 10 open | Owner's choice in Settings |
| Optional unknown fields | Leave blank and list in summary | Stall on them too |
| Resume variants | One per role family (SWE, ML, infra) | Single resume |

## Notes for the implementing agent

Copy this tab into the repo as `SPEC.md` and the list below into `CLAUDE.md`.

- Work one milestone at a time, in order. Stop after M0 and after each milestone's acceptance run, and report results before continuing.
- Write the interlock and its tests before any code that clicks anything.
- Never run against a live site without the owner present, and never in CI. Use fixtures for everything automated.
- Don't invent profile data, test accounts or credentials for real sites; use obviously fake values in fixtures and tests.
- When a live page breaks an adapter, capture it as a fixture, write the failing test, then fix.
- Keep adapters free of Chrome APIs so they can move to another host.
- Prefer stalling to guessing. A stall costs the owner a few seconds; a wrong answer can cost the application.
- Ask the owner before adding dependencies with native builds, new permissions to the extension manifest, or anything that sends profile data to a new service.
- Keep this spec current: when a decision changes, update `SPEC.md` in the same commit.
