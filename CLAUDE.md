# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

- **`AGENTS.md`** — the shared project map every agent working on this repo reads: architecture, screens, non-negotiable business rules, and the incidents behind each one. Source of truth — this file does not repeat it.
- **`CONTRIBUER.md`** — verification and deployment process.

Everything below is specific to operating as an agent in this repo; it complements those two files, it doesn't restate them.

## Start of every session — no exception

```bash
git fetch origin && git reset --hard origin/develop
```

Skipping this can make a whole session's diagnosis wrong without any error surfacing — see "Pièges vérifiés à nos dépens" in `AGENTS.md` for the incident (an audit run 68 commits behind origin/develop reported half the real test count and a already-fixed issue as critical). `develop` is the real production branch (Vercel deploys from it, not `main`).

After the reset, `package.json` may have changed underneath you — run `npm ci` before trusting `typecheck`/`test`/`build` output.

## End of every session

Never leave a commit local — push before stopping. Only one agent writes to `develop` at a time; check with Sekou if it's unclear who has the lead.

## Commands

```bash
npm ci                                           # install (rerun after any reset/pull)
npm run dev                                      # dev server
npm run typecheck                                # tsc --noEmit — no separate lint script
npm test                                         # vitest run (tests/**/*.test.ts)
npx vitest run tests/money.test.ts               # single test file
npx vitest run tests/money.test.ts -t "nom"      # single test case
npm run build                                    # production build
npm run test:e2e                                 # playwright test — builds+starts on :3200 first
npm run test:sql                                 # scripts/test-sql.sh — needs a local PostgreSQL 16
npm run verify                                   # typecheck + test + build + e2e
```

CI (`.github/workflows/ci.yml`) runs typecheck/unit tests/build/e2e in one job and the SQL migrations+assertions (currently 48 migrations) in a parallel job against a Postgres 16 service container; a `verdict` job fails if either did.
