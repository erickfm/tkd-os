# TKD OS

A desktop dojang manager for Taekwondo schools — students, belt ranks, attendance, events, promotions.

Single-user, local-first. Data lives in a SQLite file in your OS app-data directory.

## Stack

- **Tauri 2** — cross-platform desktop shell (Windows, macOS, Linux)
- **React 19 + TypeScript + Vite** — UI
- **Tailwind CSS v4** — styling
- **React Router** — navigation
- **SQLite** via `tauri-plugin-sql`
- **Drizzle ORM** — schema-as-TypeScript, type-safe queries

See [`docs/schema.md`](./docs/schema.md) for the full data model.

## Prerequisites

- Node.js 20+
- Rust (stable, via [rustup](https://rustup.rs/))
- Platform deps per [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## Develop

```bash
npm install
npm run tauri dev
```

The app database lives at the OS-standard app-data path under `tkdos.db` and is migrated automatically on launch from `src-tauri/migrations/`.

## Build

```bash
npm run tauri build
```

Produces a platform-native installer in `src-tauri/target/release/bundle/`.
