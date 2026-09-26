// Daily backup of the TKD OS database + app.
//
//   node --no-warnings scripts/backup-tkdos.mjs
//
// - Makes a consistent snapshot of tkdos.db with SQLite's `VACUUM INTO` — safe
//   while the app is open (it reads the live DB read-only; nothing is modified).
// - Saves it as tkdos-YYYY-MM-DD_HHMMSS.db in <Dropbox>\tkdos-backups, written to a
//   .partial file first so Dropbox never syncs a half-written backup, then checked
//   with PRAGMA integrity_check before it's renamed into place.
// - Keeps the newest 30 backups. The only files it ever deletes are older backups
//   matching that exact name pattern in the backup folder, plus its own .partial
//   leftovers from a run that was interrupted.
// - Copies the current tkd-os.exe next to them (only when it changed).
// - Logs OK/FAILED to <backup folder>\backup.log (and a local copy, in case the
//   Dropbox folder is unreachable). Exits non-zero on failure.
//
// Uses only Node's built-in node:sqlite — nothing to install.
import { DatabaseSync } from "node:sqlite";
import {
  appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync,
  renameSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEEP = 30;
const BACKUP_NAME = /^tkdos-\d{4}-\d{2}-\d{2}_\d{6}\.db$/;

const dbPath = process.env.TKDOS_DB ?? join(process.env.APPDATA, "com.erickfm.tkdos", "tkdos.db");
const backupDir = process.env.TKDOS_BACKUP_DIR ?? join(homedir(), "Dropbox", "tkdos-backups");
const exeSrc = process.env.TKDOS_EXE ?? join(homedir(), "tkd-os", "src-tauri", "target", "release", "tkd-os.exe");
const localLog = join(process.env.LOCALAPPDATA ?? homedir(), "tkdos-backup.log");

const pad = (n, w = 2) => String(n).padStart(w, "0");
const now = new Date();
const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function log(line) {
  const text = `${day} ${clock}  ${line}\n`;
  process.stdout.write(text);
  for (const file of [join(backupDir, "backup.log"), localLog]) {
    try { appendFileSync(file, text); } catch { /* the other log still gets it */ }
  }
}

function q(path) { return path.replace(/'/g, "''"); }

try {
  if (!existsSync(dbPath)) throw new Error(`database not found: ${dbPath}`);
  mkdirSync(backupDir, { recursive: true });

  // 1. Snapshot.
  const stamp = `${day}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const finalName = `tkdos-${stamp}.db`;
  const finalPath = join(backupDir, finalName);
  const partialPath = `${finalPath}.partial`;
  if (existsSync(finalPath)) throw new Error(`refusing to overwrite existing backup ${finalName}`);
  if (existsSync(partialPath)) unlinkSync(partialPath); // leftover from an interrupted run of this script

  const src = new DatabaseSync(dbPath, { readOnly: true });
  let liveStudents;
  try {
    src.exec("PRAGMA busy_timeout = 10000");
    liveStudents = src.prepare("SELECT count(*) AS n FROM students").get().n;
    src.exec(`VACUUM INTO '${q(partialPath)}'`);
  } finally {
    src.close();
  }

  // 2. Verify the snapshot before it counts as a backup.
  const snap = new DatabaseSync(partialPath, { readOnly: true });
  let integrity, snapStudents;
  try {
    integrity = snap.prepare("PRAGMA integrity_check").get().integrity_check;
    snapStudents = snap.prepare("SELECT count(*) AS n FROM students").get().n;
  } finally {
    snap.close();
  }
  if (integrity !== "ok") throw new Error(`snapshot failed integrity_check: ${integrity}`);
  renameSync(partialPath, finalPath);
  const size = statSync(finalPath).size;

  // 3. Keep the newest KEEP backups.
  const all = readdirSync(backupDir).filter((f) => BACKUP_NAME.test(f)).sort().reverse();
  const stale = all.slice(KEEP);
  for (const f of stale) unlinkSync(join(backupDir, f));

  // 4. Current app exe, when it has changed.
  let exeNote;
  if (!existsSync(exeSrc)) {
    exeNote = `exe not found at ${exeSrc}`;
  } else {
    const exeDest = join(backupDir, "tkd-os.exe");
    const a = statSync(exeSrc);
    const b = existsSync(exeDest) ? statSync(exeDest) : null;
    if (b && b.size === a.size && Math.abs(b.mtimeMs - a.mtimeMs) < 2000) {
      exeNote = "tkd-os.exe unchanged";
    } else {
      const tmp = `${exeDest}.partial`;
      copyFileSync(exeSrc, tmp);
      renameSync(tmp, exeDest);
      writeFileSync(join(backupDir, "tkd-os.exe.built.txt"), `${a.mtime.toISOString()}\n`);
      exeNote = `tkd-os.exe updated (${mb(a.size)}, built ${a.mtime.toLocaleString()})`;
    }
  }

  log(
    `OK      ${finalName}  ${mb(size)}  integrity=${integrity}  students=${snapStudents}` +
    (snapStudents !== liveStudents ? ` (live ${liveStudents}, changed mid-backup)` : "") +
    `  | kept ${Math.min(all.length, KEEP)}, pruned ${stale.length}  | ${exeNote}`,
  );
} catch (err) {
  log(`FAILED  ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
