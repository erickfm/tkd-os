# TKD OS

Desktop dojang manager for Taekwondo schools. Single-user, local-first SQLite.

## Stack

- Tauri 2 (Rust desktop shell)
- React 19 + TypeScript + Vite 7
- Tailwind CSS v4 — theme tokens in `src/styles.css`; no `tailwind.config.js`
- React Router 7
- SQLite via `tauri-plugin-sql`
- Drizzle ORM (schema-as-TS in `src/db/schema.ts`)

## Prerequisites

- Node 20+ (system has 26.3.1)
- Rust stable via rustup (`. "$HOME/.cargo/env"` if cargo not on PATH)
- macOS: Xcode Command Line Tools

## Dev commands

```bash
npm run tauri dev          # run the desktop app (first compile ~3-5 min)
npm run build              # TS + Vite build
cd src-tauri && cargo check    # Rust-side compile check (fast)
npm run db:generate        # generate a new migration from schema changes
```

## Repo layout

```
docs/
  schema.md          canonical data model spec — single source of truth
  HANDOFF.md         current phase status + next steps + open questions
src/
  components/        shared UI (AppLayout, PageHeader, BeltBadge)
  db/
    schema.ts        Drizzle schema (all 10 tables + inferred types)
    client.ts        Drizzle wrapper over tauri-plugin-sql (sqlite-proxy)
    enums.ts         enum constants + display labels
  pages/             one file per route
  router.tsx         route definitions
  styles.css         Tailwind import + CSS variable theme (dark/light)
src-tauri/
  src/lib.rs         Tauri entry; registers plugins + migrations
  migrations/
    0001_initial_schema.sql    full schema + belt-rank seed
  capabilities/default.json    SQL plugin permissions
  Cargo.toml         Rust deps
```

## Database mechanics

- DB lives at `sqlite:tkdos.db` in the OS app-data dir (Tauri-managed).
- Migrations are declared in `src-tauri/src/lib.rs` and run on app launch.
- Adding a new migration:
  1. Drop a new `.sql` file in `src-tauri/migrations/` (e.g. `0002_<name>.sql`).
  2. Add a matching `Migration` entry in `lib.rs`.
  3. Update `src/db/schema.ts` to mirror the change.
- For dev resets, delete the SQLite file in the OS app-data dir and relaunch.

## Conventions

- Imports use the `@/` alias (e.g. `@/db/client`, `@/components/BeltBadge`).
- Forms (planned for Phase 2): React Hook Form + Zod + `@hookform/resolvers`.
- Tailwind v4 — theme tokens live in `src/styles.css` under `@theme { ... }`.
- Belt displays go through the `BeltBadge` component (reads `color_hex`/`text_hex`/`border_hex` off the rank row).
- Soft-delete via `is_active = 0`, never hard delete — preserves FK history.
- Dates: TEXT, ISO `YYYY-MM-DD`. Timestamps: TEXT, default `CURRENT_TIMESTAMP`.
- Booleans: SQLite `INTEGER` with `CHECK (col IN (0,1))`; Drizzle exposes them as `boolean` via `mode: "boolean"`.

## Schema authority

`docs/schema.md` is the spec. When the spec and the code disagree, the spec wins — update the code (and add a migration). If a change comes from real usage and needs spec updates, edit `docs/schema.md` at the same time.

## Things NOT to do

- Don't add error handling/fallbacks for schema-enforced invariants — let the constraints catch them.
- Don't add comments that just restate code.
- Don't introduce abstractions before a second concrete use case.
- Don't tweak belt-rank colors casually; the user will pick the real palette deliberately.
- Don't edit `0001_initial_schema.sql` after first launch — add a new migration instead.
- Don't hard-delete student/event records. Always soft-delete via `is_active`.

## Where to look for current work

Always read `docs/HANDOFF.md` first for the latest phase status, what's planned next, and open questions.
