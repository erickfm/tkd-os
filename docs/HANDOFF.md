# Handoff — 2026-06-19

For the next Claude Code session. Read this together with `CLAUDE.md` and `docs/schema.md` before acting.

---

## What's done

**Phase 0 complete** — rebuilt from scratch as TKD OS. Commit `af055d5`.

- Wiped the old Streamlit/BigQuery prototype; old code recoverable at `git log` commit `63ea6ce`.
- Renamed GitHub repo and local working dir: `Tiger` → `tkd-os`.
- Installed Node 26.3.1, Rust 1.96.0, `gh` CLI on the user's Mac.
- Scaffolded Tauri 2 + React 19 + TS + Vite + Tailwind v4 + React Router 7.
- Wired Drizzle ORM to `tauri-plugin-sql` via the `sqlite-proxy` adapter (`src/db/client.ts`).
- Encoded every table, FK, unique, check constraint, and index from `docs/schema.md` into both `src/db/schema.ts` (Drizzle) and `src-tauri/migrations/0001_initial_schema.sql` (raw SQL).
- Seeded all 40 belt ranks across the Tiger Cubs and Jr./Adult tracks.
- Built the UI shell: sidebar nav, 6 placeholder routes, a Dashboard that reads live counts from SQLite, a Settings page that renders every belt rank as a colored `BeltBadge`.
- `npm run build` (TS+Vite) and `cd src-tauri && cargo check` both clean.

## What's next — Phase 2: Students CRUD

The user explicitly said "start phase 2." Plan agreed in conversation:

1. **`useDb` hook + a small `studentsRepo`** — typed query helpers so pages don't write Drizzle inline.
2. **List view** — searchable table: Name • Belt (as `BeltBadge`) • Track • Age Group • optional "Last Promoted."
3. **Add/Edit form** as a **slide-over drawer on the right** (not modal, not separate route). React Hook Form + Zod, full field set per the `students` table.
4. **Soft-delete + restore** by toggling `is_active`. Add a "Show inactive" toggle in the list filter.
5. **Auto-create the `student_progress` row** on student creation (1:1 invariant from the spec).
6. **First-run polish** — empty-state CTA "Add your first student" when there are zero students.

### Deps to install for Phase 2

```bash
npm i react-hook-form zod @hookform/resolvers date-fns lucide-react
```

### UI patterns chosen

- **Slide-over drawer** for add/edit (snappier than a route change in an offline app).
- **Belt picker**: searchable dropdown, grouped by track. 40 options is too many for a vanilla `<select>`.

---

## Open: legacy data import (mssdata.mdb)

The user has even older data in an `.mdb` file — Microsoft Access / Jet format — from a pre-Streamlit dojo management app. **File location is unknown** at the time of this handoff; the user pivoted to "make a handoff doc" instead of pointing to the file.

When the next session picks this up:

1. Ask where `mssdata.mdb` lives. If it's on a different machine (e.g. the dojang office computer), they may need to bring it over.
2. Install `mdbtools`: `brew install mdbtools`. CLI commands:
   - `mdb-tables <file.mdb>` — list tables
   - `mdb-schema <file.mdb>` — dump the schema as SQL
   - `mdb-export <file.mdb> <TableName>` — dump a table as CSV
3. Show the user the table list + a sample of each table. Propose a mapping to the new schema before writing any import code.
4. Expect mismatches — the new schema is far richer than what a legacy Access-based dojo app likely tracked:
   - Belt rank assignment will need manual translation (likely a free-text `rank` field → new `belt_rank_id` FK).
   - Old data probably has no `track` or `age_group` — defaults of `regular` / `jr` may need overrides.
   - Attendance history uses different class definitions; likely not importable cleanly.
5. Write the import as a one-shot script under `scripts/` (TypeScript, run via `tsx`). Keep it idempotent if you can — read CSVs, insert via `getDb()` from `src/db/client.ts`.
6. The user's stated preference: **decide what to import after seeing what's actually in the MDB.**

---

## Decisions already made (don't re-litigate)

- **Stack**: Tauri + React + TS + SQLite. Not Electron, not PySide6, not Flutter.
- **ORM**: Drizzle, not Kysely, not raw SQL.
- **Single-user, single-machine**. No sync, no auth.
- **Polish level**: aim for shadcn-ish quality, but with hand-rolled components on top of Tailwind v4 — no big UI library brought in yet.
- **Belt-rank colors** in the seed are reasonable defaults, NOT the user's intended palette. Don't tweak casually.
- **Soft-delete via `is_active`**, never hard delete.
- **One bootstrap migration** while pre-release. Once the app is in real use, add new migrations rather than editing `0001_initial_schema.sql`.

---

## How to verify the current state

```bash
cd /Users/erick/projects/tkd-os
npm install                    # if node_modules isn't populated
npm run build                  # TS + Vite build
cd src-tauri && cargo check    # Rust compile check
cd .. && npm run tauri dev     # full app, first compile ~3-5 min
```

When `tauri dev` launches you should see:

- Sidebar with Dashboard / Students / Attendance / Events / Starter Courses / Settings.
- Dashboard: "Belt Ranks Seeded: 40" and "Active Students: 0".
- Settings page renders all 40 belts as colored badges.

If the DB feels stuck or you want a clean slate during dev, delete the SQLite file in the OS app-data dir (look under `~/Library/Application Support/com.erickfm.tkdos/` on macOS) and relaunch.

---

## Phase roadmap

- ✅ Phase 0 — Scaffold + schema + UI shell (commit `af055d5`)
- ⏭️ **Phase 2 — Students CRUD** (next)
- Phase 3 — Attendance: sessions, records, class-type filtering, derived "classes since promotion / testing"
- Phase 4 — Events + Auto-promote + Graduation: events, rosters, the promotion flow, TSV export
- Phase 5 — Starter Courses + Progress UI + polish: starter courses, `student_progress` stripes UI, backup/restore
