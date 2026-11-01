# V2 spec: Greenhouse autofill

Oct 21, 2026 · @Aspire

V1 fills one Greenhouse application at a time from a link you paste, stops before Submit, and shows you what it filled. A TypeScript app drives your real Chrome with Playwright; when it can't locate a field, it asks a Claude agent using Playwright MCP to find it. Everything else waits for later milestones in Build spec.

> **Moved to V2 on Oct 21.** This was the first V1 plan. It now builds on the new V1 (profile, job board, matching scaffold), so wherever this tab says "V1", read "V2". Its profile screen, dashboard shell and database are reused from V1, job ingestion is already done in V1, and V2 adds the browser, runner, answer ladder and locator agent. Merge this tab into `SPEC.md` when V2 starts.

## Scope

**V1 is done when** you paste 5 Greenhouse job links into the dashboard, run them one after another, and each ends either parked on the filled form for you to review and submit, or stalled on named questions you answer in the dashboard, after which the run finishes. At least one run should need the locator agent and succeed with its help. Nothing is ever submitted by the app.

**In V1:**

- Paste a Greenhouse link (job page or application page) to create a job.
- A structured profile you fill in once, plus one resume PDF.
- One run at a time: open the form in your Chrome, extract every field, fill what the answer ladder can answer, stall on the rest.
- Answers you give to stalls are remembered for the exact same question next time.
- A runtime locator agent (Claude + Playwright MCP) for fields the adapter can't find or fill, with its fixes cached.
- A small local dashboard: jobs, profile, current run, questions inbox, review summary.

**Deferred** (kept in the Full roadmap tab): other ATSs (Lever, Ashby, Workday), parallel runs and the Chrome extension, semantic question matching, AI-written short answers and company research, job ingestion, pre-flight questions, resume variants.

Job ingestion from the Simplify `listings.json` is small (one fetch, a filter on `active`, and a Greenhouse-host filter), so it's the first thing to add after V1 if pasting links gets tedious.

## Hard rules

Each rule has at least one automated test, written before the code it protects.

1. **Never submit.** Greenhouse forms are one page, so the only navigation button is Submit. In V1 the app never clicks any `button`, `input[type=submit]` or link at all, except controls inside a field: dropdown options, radio and checkbox inputs, and "add another" for repeating sections. All clicks go through one `safeClick()` function that enforces this; a lint rule bans `.click()` elsewhere.
2. **The locator agent cannot act on the page.** It may only read page snapshots and return a proposed locator. The app validates and performs every action itself (see Locator agent).
3. **Work authorization, sponsorship and EEO answers come only from the profile.** No model infers them. Missing or unmappable → stall.
4. **Attestations and signatures always stall** ("I certify…", "Did you use AI…", typed-name signature fields).
5. **Required fields are never left blank silently.** Unknown required field → stall. Unknown optional field → left blank and listed in the summary.
6. **Every field is logged** with its value, source and status.
7. **CAPTCHAs are never bypassed.** If one appears before you submit, the run stops and tells you.
8. **Only the relevant fields go to the model.** The locator agent receives the page snapshot and the field description, never your profile; values already filled on the page will appear in the snapshot, which is acceptable for V1.

## How a run works

&#91;embedded content: one V1 run · from pasted link to your submit\]

Runs go one at a time. After each fill pass the app re-extracts fields, since answers can reveal follow-up questions. A run's states are `OPENING`, `EXTRACTING`, `FILLING`, `NEEDS_INPUT`, `LOCATING` (agent working), `READY_FOR_REVIEW`, `SUBMITTED`, `UNSUPPORTED` and `FAILED`, each saved before the next step so a restart can resume.

## Stack and repo layout

One TypeScript app, one process. The backend drives Chrome with Playwright and also serves the dashboard.

| Piece | Choice |
| --- | --- |
| Runtime | Node 22 LTS, TypeScript strict, pnpm |
| Browser | Your installed Chrome, started by a script with a dedicated profile folder and `--remote-debugging-port=9222`; the app attaches with `chromium.connectOverCDP('http://localhost:9222')` |
| Locator agent | Claude Agent SDK (TypeScript) with Playwright MCP (`@playwright/mcp`) as its MCP server, started with `--cdp-endpoint=http://localhost:9222` so it sees the same Chrome |
| Server | Fastify on `127.0.0.1`, REST + server-sent events for live run status |
| Dashboard | React + Vite, built into the server's static folder |
| Database | SQLite via better-sqlite3 + Drizzle ORM and migrations |
| Validation | Zod schemas shared by server and dashboard |
| Tests | Vitest; Playwright loads saved fixture pages offline |
| Config | `.env` for `ANTHROPIC_API_KEY`, port, Chrome path, profile folder |

```text
apply-engine/
  scripts/start-chrome.ts      # launches Chrome with the dedicated profile + debugging port
  src/
    server/                    # Fastify routes, SSE
    runner/                    # run state machine, one run at a time
    browser/
      connect.ts               # connectOverCDP, find/open tab
      safe-click.ts            # the only place .click() is allowed
      fill.ts                  # fill primitives + read-back
      adapters/greenhouse.ts
    answers/                   # ladder, normalization, option matching
    agent/locator-agent.ts     # Agent SDK + Playwright MCP, validation
    db/                        # Drizzle schema, migrations, seed
    shared/                    # Zod types: DetectedField, FieldResult, RunState
  web/                         # React dashboard
  fixtures/greenhouse/         # saved form pages: .html + .png + meta.json
  tests/
  SPEC.md  CLAUDE.md
```

Keep DOM-reading logic (label extraction, field classification) in plain functions that run inside the page through `page.evaluate`. That code can move into a Chrome extension later without changes; only the Playwright calls around it would be replaced.

## Data model

Eight tables in one SQLite file. Every table has `id`, `created_at`, `updated_at`. Column names leave room for the roadmap (scope, canonical keys) without building those features yet.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `profile` | Single row of your facts | JSON per section: identity, contact, links, education\[\], experience\[\], skills, work\_auth, eeo (default "decline"), defaults (e.g. how you heard about us), resume\_path |
| `jobs` | One per pasted link | url, board\_token, gh\_job\_id, company, title, description\_text, status (new / running / ready / submitted / skipped) |
| `runs` | One per attempt at a job | job\_id, state, error, started\_at, ready\_at, submitted\_at |
| `field_log` | Every field seen in a run | run\_id, field\_key, label, field\_type, required, value (JSON), source (profile / memory / default / owner / blank), status (filled / stalled / skipped / verified / failed), locator\_source (adapter / cache / agent) |
| `questions` | Every distinct question label | normalized\_label (unique), raw\_label, field\_type, options (JSON), canonical\_key (nullable, for later), seen\_count |
| `answers` | Your reusable answers | question\_id, value (JSON), scope (global for now), source (owner) |
| `selector_cache` | Locators found by the agent | board\_token, field\_signature, locator (JSON), hits, last\_ok\_at |
| `agent_calls` | Audit of locator-agent use | run\_id, field\_key, prompt\_summary, proposed\_locator, accepted (bool), reason, cost\_usd, duration\_ms |

`field_signature` = hash of normalized label + field type + required flag, so a cached locator is reused only for the same field on the same company's board.

## Greenhouse adapter

The adapter turns any pasted Greenhouse link into the hosted application form, lists its fields, and fills them with Playwright. Verify every URL pattern and API shape below against live pages and Greenhouse's docs in M1; save each page you check as a fixture.

**Link handling:**

- Hosted pages: `job-boards.greenhouse.io/<board>/jobs/<id>` and the older `boards.greenhouse.io/<board>/jobs/<id>`. Parse `board` and `id`.
- Company career pages that embed Greenhouse (often with a `gh_jid=<id>` query parameter): open the page, find the iframe whose `src` is on a Greenhouse host, read the board and job id from it, then navigate the tab to the hosted form. If that fails, fill inside the iframe's `Frame` instead.
- Anything else: mark the job `unsupported`.

**Job data:** fetch the posting and its questions from Greenhouse's public Job Board API (`boards-api.greenhouse.io/v1/boards/<board>/jobs/<id>?questions=true`). Store the description text on the job. Use the API's question list to cross-check the fields found on the page; a page field missing from the API list, or the reverse, is logged as a warning.

**Field extraction** (one `page.evaluate` call returning `DetectedField[]`):

- Scope to the application `<form>`; skip hidden inputs and anything inside the "Autofill with MyGreenhouse"/LinkedIn import areas.
- Label order: `<label for>` → `aria-labelledby` → `aria-label` → wrapping `<label>` → fieldset `<legend>` (radio and checkbox groups) → nearest preceding text in the same field container.
- Field types: `text`, `email`, `tel`, `textarea`, `file`, `select` (native), `combobox` (custom React dropdowns and autocompletes such as location and school), `radio`, `checkbox`, `checkbox_group`.
- Record required (`required`, `aria-required`, or an asterisk in the label), `maxlength`, options (open custom dropdowns via `safeClick` to read them, then close), and a stable `field_key` (the input's `id`/`name`, else a hash of label + type).
- Re-extract after each fill pass until the field list is the same twice in a row (max 5 passes), because answers can reveal follow-up questions.

**Fill primitives** (all followed by read-back; a mismatch is retried once, then the field goes to the locator agent):

- Text and textarea: `locator.fill(value)`.
- Native select: `locator.selectOption({ label })`.
- Combobox: `safeClick` the input, type the first few characters, wait for `role=option`, `safeClick` the option whose text matches, then confirm the displayed value.
- Radio and checkbox: `safeClick` the input or its label, then confirm `checked`.
- Resume: `locator.setInputFiles(profile.resume_path)` on the file input, then confirm the filename appears.

**Final-page check:** the form is the final page. After filling, the run scrolls to the first unfilled required field (or the top), takes a screenshot, and moves to `READY_FOR_REVIEW`. You click Submit yourself; the app then watches for Greenhouse's confirmation page and marks the job `submitted`.

## Answer ladder

V1 answers fields without any language model. Each field goes down the ladder and stops at the first rung that answers it.

1. **Profile rules.** A table in `src/answers/profile-rules.ts` maps label patterns to profile paths: first/last/preferred name, email, phone, location, LinkedIn, GitHub, website/portfolio, school, degree, discipline, graduation date, resume. Sensitive categories (work authorization, sponsorship, gender, race, veteran, disability) also use rules here and nowhere else.
2. **Exact memory.** Normalize the label (lowercase, trim, collapse spaces, strip a trailing `*` and punctuation, replace the company name with `{company}`) and look it up in `questions`; use its answer if one exists.
3. **Profile defaults.** Configured answers for common optional questions, such as "How did you hear about us?"
4. **Option matching** (for select, combobox, radio, checkbox): map the stored value onto this field's options with exact match, then case-insensitive match, then a small synonym table (`Yes`/`Y`/`True`, `Prefer not to say`/`Decline to self-identify`/`I don't wish to answer`), then "option contains value". No match → stall, never a guess.
5. **Stall.** Required → the run's inbox. Optional → left blank, listed in the summary. Long-text questions ("Why us?") and cover letters always land here in V1.

**Stall flow:** the run fills everything it can first, then moves to `NEEDS_INPUT` with a list of open questions. You answer them in the dashboard (each answer saved to memory unless you tick "just this once"), the app fills them, re-extracts, and the run continues.

Polarity matters even with exact matching: "require sponsorship" and "authorized without sponsorship" are different normalized labels, so they never share an answer. Keep profile rules for those two as separate patterns with their own tests.

## Locator agent

When the adapter can't find or fill a field, the app asks a Claude agent to look at the live page through Playwright MCP and propose a locator. The agent only reads; the app checks the proposal and does the filling itself, so every click still goes through `safeClick`.

**When it runs** (only these cases; never to decide an answer):

- A question in the Job Board API list has no matching field on the page.
- A fill fails read-back twice.
- A combobox's options can't be found after opening it.

**Steps:**

1. **Cache first.** Look up `selector_cache` by board + field signature. If a cached locator passes validation (step 4), use it and skip the agent.
2. **Start the agent** with the Claude Agent SDK's query API:
   - MCP server: `npx @playwright/mcp@<pinned version> --cdp-endpoint http://localhost:9222`, so it sees the same Chrome.
   - Allowed tools: only the page-snapshot tool and the tab-listing/selecting tool. Deny every other Playwright MCP tool (click, type, fill, select, upload, navigate, evaluate, key presses, run code) and all built-in agent tools (shell, file read/write, web). Check the exact tool names in the pinned version and assert the allowlist in a test.
   - Limits: about 6 turns, 60 seconds, and a per-call cost cap from config.
3. **Prompt** (versioned file in `src/agent/prompts/`): the job URL so it selects the right tab, the field's label, type, required flag and expected options, and what failed. It must reply with JSON matching a Zod schema:

   ```ts
   { kind: 'field' | 'options',
     locator: { strategy: 'role' | 'label' | 'placeholder' | 'testid' | 'css',
                role?: string, name?: string, exact?: boolean, value: string,
                frameUrlContains?: string },
     expectedFieldType: FieldType,
     rationale: string }
   ```
4. **Validate** in app code before using it:
   - It resolves to exactly one visible element inside the application form (or the named frame).
   - The element's tag and role fit the expected field type.
   - It is not a button, submit input or link, except a `role=combobox` trigger.
   - It isn't already mapped to another field in this run.

   If validation fails, re-ask once with the reason. If it fails again, stall the field as "couldn't locate" so you fill it in Chrome.
5. **Fill** with the normal primitives, then read back.
6. **Cache** the locator on success; if a cached locator later fails, delete it and ask again.

Every call is logged in `agent_calls` with the proposal, whether it was accepted, why, duration and cost. Playwright MCP's own action tools are never enabled, because they would click outside `safeClick`.

## Dashboard

A small local web app at `http://127.0.0.1:<port>`, four screens. Run status updates live through server-sent events.

| Screen | Shows | Actions |
| --- | --- | --- |
| Jobs | Pasted jobs: company, title, status, last run state | Paste one or more links; start a run (disabled while another run is active); skip; mark submitted |
| Run | Current run's state, a step log, and the field table: label, value, source, status, locator source (adapter / cache / agent) | Focus the tab in Chrome, retry the run, cancel |
| Questions | Open stalls for the current run, with the field type and options | Answer (saved to memory unless "just this once"); "I'll fill this in Chrome" |
| Profile | Profile sections, resume file, defaults, remembered answers | Edit and save; delete a remembered answer |

Run review lives on the Run screen once the state is `READY_FOR_REVIEW`: the full field table plus the screenshot. Source colors: profile green, memory blue, default gray, you yellow, blank red outline.

## Security and testing

**Security** (V1 has no portal passwords, so this stays small):

- Server binds to `127.0.0.1` only. Reject requests whose `Origin` or `Host` isn't the dashboard's own, and require a random token generated on first run (stored in `.env`, sent by the dashboard as a header).
- Chrome's debugging port also binds to localhost only; never expose it. Use a dedicated Chrome profile folder, not your everyday profile.
- `.env`, the SQLite file, `fixtures/` with real data, and your resume stay out of git (`.gitignore` from the first commit). Fixtures committed to the repo use fake profile values.
- Redact email, phone and address from application logs.

**Testing:**

- **Fixtures:** a "capture" button on the Run screen (and automatic on failure) saves the form's HTML, a screenshot and `meta.json` to `fixtures/greenhouse/`. Capture at least 10 different companies' forms in M1.
- **Extraction tests:** load each fixture offline, run extraction, and snapshot the field list (labels, types, required, options).
- **safeClick tests:** on every fixture, attempting to click the Submit button throws; a lint rule (or a grep test) fails the build if `.click(` appears outside `safe-click.ts`.
- **Answer ladder tests:** a table of real labels from fixtures → expected rung and value, including both sponsorship phrasings and EEO "decline" options.
- **Locator agent tests:** the allowlist of MCP tools is exactly the read-only set; the validator rejects buttons, multi-matches and wrong field types (unit tests with fixture pages, no model calls). One manual live test per milestone.
- **No automated live runs.** Tests never open real job sites.

## Milestones

Build in order; finish each milestone's acceptance check before starting the next.

### M0 — Skeleton

- [ ] Repo with pnpm, TypeScript strict, ESLint, Vitest, `.gitignore`, `.env.example`.
- [ ] `scripts/start-chrome.ts`: launch installed Chrome with a dedicated profile folder and `--remote-debugging-port=9222`.
- [ ] `browser/connect.ts`: attach with `connectOverCDP`, list tabs, open a URL in a new tab.
- [ ] `safe-click.ts` and its tests (submit blocked); lint rule banning `.click(` elsewhere.
- [ ] Drizzle schema and first migration for all eight tables.
- [ ] Fastify server with the token check; empty React dashboard served from it.

**Accept:** `pnpm chrome` then `pnpm dev` opens the dashboard; pasting a link opens it in the debug Chrome; all tests pass.

### M1 — Read Greenhouse forms

- [ ] Link parsing (hosted and embedded) and Job Board API fetch.
- [ ] Field extraction with re-extraction passes; capture button.
- [ ] Capture 10 forms from different companies as fixtures; extraction snapshot tests.

**Accept:** for all 10 fixtures, the extracted fields match what you see on the page (spot-checked by you), and every API question maps to a page field or is logged as a warning.

### M2 — Fill and review

- [ ] Profile screen and storage; resume path.
- [ ] Ladder rungs 1, 3 and 4; fill primitives with read-back; `field_log`.
- [ ] Run state machine (single run) and the Run screen with the field table and screenshot.

**Accept:** 3 live Greenhouse links reach `READY_FOR_REVIEW` with every profile-answerable field filled correctly, the resume attached, and nothing submitted.

### M3 — Stalls and memory

- [ ] Questions screen; `NEEDS_INPUT` flow; fill after answering; re-extract.
- [ ] Exact memory (rung 2) with normalization; remembered answers on the Profile screen.

**Accept:** a question you answer on one company's form is filled automatically on another company's form that asks it with the same wording.

### M4 — Locator agent

- [ ] Agent SDK + Playwright MCP integration with the read-only tool allowlist and limits.
- [ ] Proposal schema, validator, retry, `selector_cache`, `agent_calls`.
- [ ] A debug setting that disables one adapter rule, to force the agent path on demand.

**Accept:** with the debug setting on, the agent proposes a locator that passes validation and the field is filled; the next run on the same board uses the cache with no agent call; a test proves click/type/evaluate tools are not available to the agent.

### M5 — V1 acceptance

- [ ] Run the V1 definition of done with 5 real links and record the outcome of each in `CHANGELOG.md`.

**After V1, in this order:** job ingestion from `listings.json` → AI-drafted short answers with approval → semantic question matching → Lever and Ashby adapters → parallel runs (extension or windows) → Workday. Details are in the Full roadmap tab.

## Notes for Claude Code

Save this tab as `SPEC.md` in the repo root and the list below as `CLAUDE.md`.

- Work one milestone at a time. At the end of each, run its acceptance check, update `CHANGELOG.md`, and stop for the owner to review.
- Write `safeClick` and its tests before any code that touches a live page.
- Never click Submit, and never run anything against a live job site unless the owner is present and asked for it. Automated tests use fixtures only.
- Don't invent profile data. Use clearly fake values in fixtures and tests.
- When a live form breaks something: capture it as a fixture, write a failing test, then fix.
- Prefer stalling to guessing. A stall costs the owner seconds; a wrong answer can cost the application.
- Verify external details (Greenhouse URL patterns, Job Board API fields, Playwright MCP tool names, Agent SDK options) against current docs or live pages before relying on them; note what you verified in the changelog.
- Pin versions of Playwright, `@playwright/mcp` and the Agent SDK.
- Ask before adding a dependency with native builds, sending any data to a new service, or enabling another Playwright MCP tool.
- When a decision in this spec changes, update `SPEC.md` in the same commit.

During development (separate from the app's runtime agent), you can also add Playwright MCP to Claude Code itself with `--cdp-endpoint http://localhost:9222` to inspect a live form while writing adapter code.
