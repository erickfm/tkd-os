# TKD OS

A desktop **dojang (Taekwondo school) manager** built for **Ojai Valley Taekwondo**. It tracks students, belt ranks and promotions, attendance, testing/tournament events, and starter courses.

It is **single-user and local-first**: there is no server, no login, and no cloud. All data lives in one SQLite file on the computer it runs on, and the app works fully offline.

---

## Table of contents

- [What it does](#what-it-does)
- [Who it's for](#who-its-for)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Where your data lives (and backups)](#where-your-data-lives-and-backups)
- [Everyday use](#everyday-use)
- [Project structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Database & migrations](#database--migrations)
- [Building an installer](#building-an-installer)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## What it does

| Area | What you can do |
|------|-----------------|
| **Dashboard** | At-a-glance counts (active students, Tiger Cubs, Jr./Adult, black belts, "ready to test", upcoming events, active courses). Every card is clickable and drills into the matching list. |
| **Students** | Searchable, filterable roster. Add/edit in a slide-over with a track-aware belt picker. Soft-delete (deactivate) and restore. Per-student progress stripes + "Permission to Test." One-click "Flag adults" by birthdate. |
| **Attendance** | Pick a class type + date → the eligible roster is filtered automatically by belt class-group → mark present/absent. Saved instantly. |
| **Events** | Create belt testings, tournaments, seminars, demos, camps. Manage rosters. For belt testings: **auto-promote** the whole roster (including the Tiger Cub → White Belt graduation flow) and **export a TSV testing roster**. |
| **Starter Courses** | Short intro courses with enrollment. |
| **Settings** | Reference list of every belt rank and its colors, per track. |

Two student **tracks** are modeled: **Tiger Cubs** (ages ~4–5) and the **Jr./Adult** track. The full data model and business rules live in [`docs/schema.md`](./docs/schema.md) — that document is the source of truth.

---

## Who it's for

This is internal software for one Taekwondo school. See [`CLAUDE.md`](./CLAUDE.md) for who works on it and how. In short: **Dan** (owner/instructor) and **Conan** (instructor, helps with features/bugs) use it daily; **Erick** (data scientist) does deeper engineering.

---

## Tech stack

- **[Tauri 2](https://tauri.app/)** — native desktop shell (Windows / macOS / Linux). Rust under the hood.
- **React 19 + TypeScript + Vite 7** — the UI.
- **Tailwind CSS v4** — styling. Theme tokens live in `src/styles.css` (no `tailwind.config.js`).
- **React Router 7** — navigation.
- **SQLite** via **`tauri-plugin-sql`** — storage.
- **Drizzle ORM** — schema-as-TypeScript and typed queries (`src/db/schema.ts`).
- **Vitest** — tests (`npm test`).

---

## Getting started

> These steps assume **Windows** (the school's machines). macOS/Linux work too — substitute the platform build tools.

### 1. Install the prerequisites (one time)

- **Node.js 20+** — https://nodejs.org (LTS).
- **Rust (stable)** via **rustup** — https://rustup.rs
- **Microsoft C++ Build Tools** — the "Desktop development with C++" workload (Tauri needs a C/C++ toolchain on Windows). See [Tauri prerequisites](https://tauri.app/start/prerequisites/).
- **WebView2** — already present on Windows 11.

On Windows these can be installed quickly with `winget`:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Rustlang.Rustup
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

> Each installer may pop a Windows "Do you want to allow this app to make changes?" (UAC) dialog — click **Yes**. After installing, open a **new terminal** so the tools are on your PATH.

### 2. Get the code and run it

```bash
npm install
npm run tauri dev
```

The **first run compiles the Rust shell and takes a few minutes** — subsequent runs are fast. A desktop window titled "TKD OS" opens, and the database is created and migrated automatically on first launch.

---

## Where your data lives (and backups)

All data is a single SQLite file in the OS app-data directory:

- **Windows:** `%APPDATA%\com.erickfm.tkdos\tkdos.db`
  (e.g. `C:\Users\<you>\AppData\Roaming\com.erickfm.tkdos\tkdos.db`)
- **macOS:** `~/Library/Application Support/com.erickfm.tkdos/tkdos.db`

**To back up:** copy that `tkdos.db` file somewhere safe. **To restore:** close the app and copy a backup back over it. **To start fresh during development:** delete the file and relaunch (it will be recreated and migrated).

> The repository is **public**. It contains only code — never commit the database or any file with student data. Student PII stays on the local machine.

---

## Everyday use

- **Add a student:** Students → *Add student*. Pick the track first; the belt list adapts.
- **Take attendance:** Attendance → choose the class and date → tap Present/Absent.
- **Run a belt test:** Events → *Add event* (type *Belt Testing*) → add students to the roster → **Export TSV** for printing, and **Auto-promote all** after testing.
- **Mark someone ready to test / earned a stripe:** open the student → toggle the chips at the bottom of the editor.

---

## Project structure

```
docs/
  schema.md          Canonical data model + business rules (source of truth)
  HANDOFF.md         Phase status / next steps from earlier sessions
src/
  components/        Shared UI (AppLayout, PageHeader, BeltBadge, Drawer, ui)
  db/
    schema.ts        Drizzle schema (all tables + inferred types)
    client.ts        Drizzle wrapper over tauri-plugin-sql (sqlite-proxy)
    repos.ts         All queries / business logic (the data-access layer)
    enums.ts         Enum constants + display labels
    repos.test.ts    Vitest regression suite for the data layer
  pages/             One file per route (Dashboard, Students, Attendance, …)
  lib/               format / download helpers
  router.tsx         Routes
  styles.css         Tailwind import + theme tokens
src-tauri/
  src/lib.rs         Tauri entry; registers plugins + migrations
  migrations/        SQL migrations (0001 schema+seed, 0002 belt colors)
  tauri.conf.json    App config
scripts/
  import-legacy.mjs  One-shot importer from the old Access (.mdb) system
  audit-belts.mjs    Read-only DB diagnostic for belt integrity
```

---

## Development

- Imports use the `@/` alias (e.g. `@/db/repos`, `@/components/BeltBadge`).
- **All database access goes through `src/db/repos.ts`** — pages don't write SQL/Drizzle inline.
- Tailwind v4: theme tokens live in `src/styles.css` under `@theme { … }`.
- Belt displays go through the `BeltBadge` component, which reads colors off the belt-rank row.

> ⚠️ **Critical data-layer gotcha:** the SQLite access goes through Drizzle's `sqlite-proxy`, which maps result rows **positionally** and emits **no column aliases**. Any join that selects columns with the same name from two tables (e.g. `students.id` + `belt_ranks.id`) will silently corrupt the result. Belt columns are therefore projected via `` sql`${beltRanks.col}`.as("rk_col") `` (the `rankCols` map in `repos.ts`). **If you add a join, alias the overlapping columns the same way and add a test.** Full explanation in [`CLAUDE.md`](./CLAUDE.md).

---

## Testing

```bash
npm test          # vitest run
```

The suite (`src/db/repos.test.ts`) backs the **real** Drizzle/sqlite-proxy path with an in-memory SQLite database, applies the actual migrations, seeds known data, and asserts query results. This is how you verify data-layer changes **without needing to open the GUI**. Type-check with:

```bash
npx tsc --noEmit
```

---

## Database & migrations

- Migrations are plain SQL in `src-tauri/migrations/`, registered in `src-tauri/src/lib.rs`, and run automatically on app launch.
- To add one: drop `000N_name.sql` in the migrations folder, add a matching `Migration` entry in `lib.rs`, and update `src/db/schema.ts` to mirror any structural change.
- **A migration only takes effect after the Rust side recompiles** — relaunch `npm run tauri dev` (or rebuild).
- Don't edit `0001_initial_schema.sql` after it's been applied anywhere; add a new migration instead.

---

## Building an installer

```bash
npm run tauri build
```

Produces a native installer in `src-tauri/target/release/bundle/`.

---

## Troubleshooting

- **An installer/command seems to hang on Windows** → there's probably a UAC "allow changes?" dialog waiting on your screen. Click **Yes**.
- **`npm` / `node` "not recognized"** → open a fresh terminal after installing Node, or use the full path to `node.exe`.
- **`git push` hangs** → the Git Credential Manager popup is waiting; or run `gh auth setup-git` once so git uses your GitHub CLI token non-interactively.
- **The app won't reflect a code change** → in Tauri dev, `Ctrl+R` does not reliably reload. Close and relaunch `npm run tauri dev`.
- **First `npm run tauri dev` takes minutes** → that's the one-time Rust compile; later runs are quick.
- **Want a clean database** → close the app and delete `tkdos.db` (see [data location](#where-your-data-lives-and-backups)).

---

## Contributing

This is a small internal project; keep changes focused and match the surrounding style. Before opening a PR:

1. `npm test` and `npx tsc --noEmit` both pass.
2. New data-layer queries have a test in `repos.test.ts`.
3. No student data or database files are committed.

If you're using **Claude Code** on this repo, read [`CLAUDE.md`](./CLAUDE.md) first.
