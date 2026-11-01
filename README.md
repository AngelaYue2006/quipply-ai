# Quipply

A local, single-user internship tracker. Enter your profile once (or import it from your resume), pull the current Simplify / Pitt CSC internship list with one button, and score each job against your profile: eligibility, strengths with evidence, and gaps.

Everything runs on your machine. The only outside traffic is the listings file, job description pages/APIs, and Claude API calls you trigger.

## Run it

Needs Node 22 and pnpm.

```sh
pnpm install
pnpm dev
```

Then open **http://127.0.0.1:5173**.

On first run `pnpm dev` creates `.env` (if missing) and adds a random `QUIPPLY_TOKEN`. Put your key in `ANTHROPIC_API_KEY`; resume import and Score match need it.

Production-style: `pnpm build && pnpm start`, then open http://127.0.0.1:4317.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | API server (4317) + dashboard dev server (5173) |
| `pnpm test` | Unit tests (no network, no model calls) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm match:demo <jobId>` | Print the exact prompt, input, raw model JSON and result for one job (calls the model) |
| `pnpm match:demo --profile p.json --job j.json --description d.txt` | Same, from files |

## Where things live

- `data/`: SQLite database, uploaded resumes, saved settings. Gitignored.
- `SPEC.md`: the V1 spec. `SPECv2.md`, `fullroadmap.md`: later versions.
- `CHANGELOG.md`: what's built, what's deferred, and what was verified.
