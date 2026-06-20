# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repo. Read this and `docs/HANDOFF.md` before acting. `docs/schema.md` is the data-model source of truth.

---

## Who you're working with — ask first

This is internal software for **Ojai Valley Taekwondo**, used and maintained by three people with very different backgrounds. **At the start of a session, if it isn't clear who you're talking to, ask** — it changes how you should explain things and how much you can assume.

- **Dan** — owner and head instructor. Non-developer; comfortable with computers as a daily user, not with code, Git, or Claude Code internals. At the dojang every day. Explain in plain language, do the setup for him, avoid jargon, and confirm before anything destructive or outward-facing.
- **Conan** — instructor who helps with the UI: adding features and fixing bugs. Layperson technically (similar to Dan), but actively working on the code with your help. Walk him through changes; prefer small, well-explained diffs; teach as you go.
- **Erick** — data scientist / AI-safety researcher. Can debug deeply, reads code fluently, understands how LLMs and agents work. With Erick you can be terse and technical, share root-cause reasoning, and skip the hand-holding. (Erick sometimes operates on Dan's machine/GitHub account, so the logged-in identity may say "ojaitkd" even when it's Erick.)

When unsure which of them you're helping, just ask — e.g. "Quick check: is this Dan, Conan, or Erick? It helps me pitch the explanation right."

---

## What this is

A single-user, local-first desktop **dojang manager**: students, belt ranks/promotions, attendance, events (incl. belt-testing auto-promote + TSV export), starter courses. No server, no auth, offline. Data is one SQLite file in the OS app-data dir.

## Stack

Tauri 2 (Rust shell) · React 19 + TypeScript + Vite 7 · Tailwind v4 (tokens in `src/styles.css`, no config file) · React Router 7 · SQLite via `tauri-plugin-sql` · Drizzle ORM · Vitest.

## Dev commands

```bash
npm install
npm run tauri dev          # run the app (first compile ~3–5 min, then fast)
npm test                   # vitest — the data-layer regression suite
npx tsc --noEmit           # type-check
npm run build              # tsc + vite build (web assets)
npm run tauri build        # native installer in src-tauri/target/release/bundle/
cd src-tauri && cargo check  # fast Rust-only check
```

## Repo layout

```
docs/schema.md     canonical data model + business rules (authoritative)
docs/HANDOFF.md    phase status / open questions from prior sessions
src/db/schema.ts   Drizzle schema (tables + inferred types)
src/db/client.ts   sqlite-proxy wrapper + test seam (createDb/__setTestDb)
src/db/repos.ts    ALL queries + business logic (the data-access layer)
src/db/enums.ts    enum constants + display labels
src/db/repos.test.ts  vitest suite exercising the real proxy path
src/pages/         one file per route
src/components/     AppLayout, PageHeader, BeltBadge, Drawer, ui
src-tauri/src/lib.rs       Tauri entry; registers plugins + migrations
src-tauri/migrations/      0001 schema+seed, 0002 belt colors
scripts/import-legacy.mjs  one-shot importer from the old Access (.mdb) system
scripts/audit-belts.mjs    read-only DB diagnostic
```

---

## ⚠️ CRITICAL: the sqlite-proxy data-layer footgun

This caused a silent production bug (every student counted as a black belt). Understand it before touching `repos.ts`.

- `client.ts` runs SELECTs through `drizzle-orm/sqlite-proxy`. The proxy maps each result row **positionally** via `Object.values(row)` and Drizzle emits **no `AS` column aliases** in the generated SQL.
- `tauri-plugin-sql` returns each row as an **object keyed by output column name**. So a join that selects columns with the **same name from two tables** (e.g. `students.id` + `belt_ranks.id`, `students.track` + `belt_ranks.track`) produces **duplicate object keys that collapse into one** → fewer values than Drizzle expects → every later field shifts → silent corruption (e.g. `rank.degree` read `color_hex`).
- **Assigning a unique TS key is NOT enough** — `{ rkId: beltRanks.id }` still generates `"belt_ranks"."id"` with no alias. You must force a real SQL alias.

**The rule:** project belt-rank columns through the `rankCols` map, which uses
`` sql`${beltRanks.col}`.as("rk_col") ``, and reassemble via `toRank()`. Any **new join that selects overlapping column names must alias them the same way**. `toRank()` also coerces `is_graduation_rank` with `Boolean()` because raw `sql` bypasses Drizzle's boolean decoder.

To check what SQL Drizzle actually generates, use `.toSQL().sql` — **don't assume**. (The first attempt at this fix was wrong precisely because it was assumed, not checked.)

---

## Verifying without a GUI (do this)

You cannot see the desktop window. **Do not claim a fix works because the code looks right** — verify through one of:

- **`npm test`** — `repos.test.ts` backs the *same* sqlite-proxy path with an in-memory better-sqlite3 DB, applies the real migrations, seeds data, and asserts results. Add a test for any data-layer change; this is the primary self-check. (The black-belt test was confirmed to fail on the buggy projection and pass on the fix.)
- **`scripts/audit-belts.mjs`** / ad-hoc Node using `node:sqlite` (`DatabaseSync`) against the live DB for read-only sanity checks.
- **`npx tsc --noEmit`** for types.

After code changes, the running app must be **relaunched** to pick them up — `Ctrl/Cmd+R` does **not** reliably reload in Tauri dev. A migration change additionally needs the Rust side to recompile (relaunch `tauri dev`).

---

## Database mechanics & migrations

- DB: `sqlite:tkdos.db` in the OS app-data dir. Windows: `%APPDATA%\com.erickfm.tkdos\tkdos.db`. Migrated on launch.
- Add a migration: new `000N_name.sql` in `src-tauri/migrations/`, matching `Migration` entry in `lib.rs`, mirror structural changes in `schema.ts`. Takes effect only after a Rust rebuild + relaunch.
- Back up by copying `tkdos.db`; reset during dev by deleting it and relaunching.

## Conventions

- `@/` import alias (`@/db/repos`, etc.).
- All DB access lives in `repos.ts`; pages don't write SQL/Drizzle inline.
- Soft-delete via `is_active = 0` (and `is_active` on events/courses) — never hard delete; it preserves FK history.
- Dates: TEXT, ISO `YYYY-MM-DD`. Timestamps: TEXT default `CURRENT_TIMESTAMP`. Booleans: INTEGER `CHECK (col IN (0,1))`, exposed as boolean via Drizzle `mode: "boolean"`.
- Belt displays go through `BeltBadge`. Belt colors are set deliberately (migration `0002`) and are WCAG-AA legible — don't tweak casually.

## Environment notes (Windows — the school's machines)

- Shell is **PowerShell 5.1**; a `bash` tool is also available. `gh` CLI lives at `C:\Program Files\GitHub CLI\gh.exe` and may not be on PATH in a given shell. Node is at `C:\Program Files\nodejs\node.exe`.
- `winget` MSI/build-tool installs pop **UAC dialogs** that silently block in the background — tell the user to click "Yes" when something seems to hang.
- A fresh shell won't have an updated PATH after an install; reload from the registry or call exes by full path.
- **Git push:** use `gh auth setup-git` so git uses the gh token; the Git Credential Manager otherwise hangs on a hidden popup. Don't run `git push` in the background (it can hang on credentials with no output) — run it foreground with a timeout.
- `gh ... --jq` with complex quoted filters breaks under PowerShell quoting — keep `--jq` simple or decode in PowerShell.
- The repo is **public**. Never commit the database, the legacy `.mdb`, or the `scripts/legacy_*.json` exports (all gitignored) — they contain student PII.

## Things NOT to do

- Don't add a join that selects overlapping column names without `sql.as()` aliases (see the footgun above).
- Don't add error handling/fallbacks for invariants the schema already enforces — let constraints catch them.
- Don't add comments that restate code, or abstractions before a second concrete use.
- Don't hard-delete students/events; soft-delete via `is_active`.
- Don't edit `0001_initial_schema.sql` after first launch — add a new migration.
- Don't commit student data or secrets to this public repo.

## Schema authority & where to look

`docs/schema.md` is the spec; if code and spec disagree, the spec wins (and update the code + add a migration). Read `docs/HANDOFF.md` for the latest phase status and open questions.
