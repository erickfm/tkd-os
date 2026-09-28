// Relax attendance_sessions.class_type CHECK to the full allowed set, including
// the UI classes plus 'private' (Private Lessons) and 'legacy' (imported history).
//
// SQLite can't ALTER a CHECK in place and the app's migration runner keeps
// foreign_keys ON inside a transaction (which makes a table rebuild fail), so
// this is done here with foreign_keys OFF — the only safe way on the populated
// DB. Idempotent: skips if the CHECK already allows 'private' and 'legacy'.
//
// Run with the app CLOSED:  node scripts/relax-class-type-check.mjs
import Database from "better-sqlite3";
import { join } from "node:path";

const ALLOWED = ["tiger", "jr-wy", "jr-gbp", "jr-brb", "adult", "private", "legacy"];
const checkList = ALLOWED.map((t) => `'${t}'`).join(",");

const dbPath = join(process.env.APPDATA, "com.erickfm.tkdos", "tkdos.db");
console.log("DB:", dbPath);
const db = new Database(dbPath);

const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE name='attendance_sessions'").get().sql;
if (ALLOWED.every((t) => ddl.includes(`'${t}'`))) {
  console.log("CHECK already allows all class types — nothing to do.");
  process.exit(0);
}

db.pragma("foreign_keys = OFF");
db.transaction(() => {
  db.exec(`
    CREATE TABLE attendance_sessions_new (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date  TEXT    NOT NULL,
      class_type    TEXT    NOT NULL CHECK (class_type IN (${checkList})),
      notes         TEXT,
      created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO attendance_sessions_new (id, session_date, class_type, notes, created_at)
      SELECT id, session_date, class_type, notes, created_at FROM attendance_sessions;
    DROP TABLE attendance_sessions;
    ALTER TABLE attendance_sessions_new RENAME TO attendance_sessions;
    CREATE UNIQUE INDEX attendance_sessions_date_class_uniq ON attendance_sessions(session_date, class_type);
    CREATE INDEX attendance_sessions_date_idx       ON attendance_sessions(session_date);
    CREATE INDEX attendance_sessions_class_type_idx ON attendance_sessions(class_type);
  `);
})();
db.pragma("foreign_keys = ON");

const fk = db.pragma("foreign_key_check");
if (fk.length) { console.error("ERROR: foreign_key_check failed:", fk); process.exit(1); }
console.log("Done. CHECK now allows:", ALLOWED.join(", "));
console.log("attendance_sessions:", db.prepare("SELECT COUNT(*) n FROM attendance_sessions").get().n,
            "| attendance_records:", db.prepare("SELECT COUNT(*) n FROM attendance_records").get().n);
db.close();
