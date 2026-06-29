// One-shot importer: legacy MSS attendance + promotion history -> TKD OS SQLite.
//
// Reads scripts/legacy_promotions.json ({s: StudentID, b: BeltCode, d: yyyy-mm-dd})
// and scripts/legacy_attendance.json ({s: StudentID, d: yyyy-mm-dd}), both exported
// from MSSData.mdb, and writes:
//   - rank_history: one row per promotion (Belt Code -> belt via the same BELT map
//     the student importer uses; track from the code; date = MSS "Date of Test").
//   - attendance_records + attendance_sessions: one "present" per student per day,
//     bucketed into a synthetic class_type = 'legacy' (the old class codes don't map
//     to the app's 5 class types). The attendance_sessions CHECK is relaxed in place
//     to allow 'legacy' (idempotent).
//
// Students are matched by students.legacy_id (= MSS Student ID). Unmatched rows are
// skipped and counted. Idempotent: re-running deletes prior legacy history first
// (rank_history rows with no event, and all class_type='legacy' attendance) and
// leaves app-entered data (real class types / event promotions) untouched.
//
// Run with the app CLOSED:  node scripts/import-legacy-history.mjs
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = join(process.env.APPDATA, "com.erickfm.tkdos", "tkdos.db");
console.log("DB:", dbPath);

// Same rank coding as import-legacy-all.mjs (verified against T-Belts).
const BELT = {
  1: "Tiger Cub White Belt", 2: "Tiger Cub Yellow Stripe", 3: "Tiger Cub Green Stripe",
  4: "Tiger Cub Blue Stripe", 44: "Tiger Cub Purple Stripe", 5: "Tiger Cub Brown Stripe",
  6: "Tiger Cub Red Stripe", 7: "Tiger Cub Black Stripe",
  8: "White Belt", 9: "Yellow Belt", 10: "Green Belt", 11: "Sr. Green Belt", 12: "Sr. Green Belt",
  13: "Blue Belt", 14: "Sr. Blue Belt", 15: "Sr. Blue Belt", 16: "Purple Belt", 17: "Sr. Purple Belt",
  18: "Brown Belt L1", 19: "Brown Belt L2", 20: "Brown Belt L3",
  21: "Red Belt L1", 22: "Red Belt L2", 23: "Red Belt L3",
  24: "1st Degree Black L1", 25: "1st Degree Black L2", 26: "1st Degree Black L3", 27: "1st Degree Black L4",
  28: "2nd Degree Black L1", 29: "2nd Degree Black L2", 30: "2nd Degree Black L3", 31: "2nd Degree Black L4",
  32: "3rd Degree Black L1", 33: "3rd Degree Black L2", 34: "3rd Degree Black L3", 35: "3rd Degree Black L4",
  36: "4th Degree Black", 37: "4th Degree Black", 38: "5th Degree Black", 39: "5th Degree Black",
  40: "6th Degree Black", 41: "7th Degree Black", 42: "8th Degree Black", 43: "9th Degree Black",
};
const TIGER = new Set([1, 2, 3, 4, 5, 6, 7, 44]);

const readJson = (f) => JSON.parse(readFileSync(join(here, f), "utf8").replace(/^﻿/, ""));
const promotions = readJson("legacy_promotions.json");
const attendance = readJson("legacy_attendance.json");
console.log(`Loaded ${promotions.length} promotions, ${attendance.length} attendance-days.`);

const db = new Database(dbPath);

// --- legacy_id -> internal student id ---
const hasLegacy = db.prepare("PRAGMA table_info(students)").all().some((c) => c.name === "legacy_id");
if (!hasLegacy) { console.error("ERROR: students.legacy_id missing — run the student importer first."); process.exit(1); }
const studentByLegacy = new Map(
  db.prepare("SELECT id, legacy_id FROM students WHERE legacy_id IS NOT NULL").all().map((r) => [r.legacy_id, r.id]),
);
const beltIdByName = new Map(db.prepare("SELECT id, name FROM belt_ranks").all().map((r) => [r.name, r.id]));
const beltMeta = new Map(db.prepare("SELECT id, sort_order, track FROM belt_ranks").all().map((r) => [r.id, r]));

// --- Relax attendance_sessions CHECK to allow 'legacy' (idempotent) ---
const sessDDL = db.prepare("SELECT sql FROM sqlite_master WHERE name='attendance_sessions'").get().sql;
if (!sessDDL.includes("'legacy'")) {
  console.log("Relaxing attendance_sessions.class_type CHECK to allow 'legacy'…");
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    db.exec(`
      CREATE TABLE attendance_sessions_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        session_date  TEXT    NOT NULL,
        class_type    TEXT    NOT NULL CHECK (class_type IN ('tiger','jr-wy','jr-gbp','jr-brb','adult','legacy')),
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
  if (fk.length) { console.error("ERROR: foreign_key_check failed after rebuild:", fk); process.exit(1); }
} else {
  console.log("attendance_sessions already allows 'legacy' — skipping rebuild.");
}

let promInserted = 0, promSkipNoStudent = 0, promSkipNoBelt = 0;
let attInserted = 0, attSkipNoStudent = 0, attSkipExisting = 0;

const run = db.transaction(() => {
  // ============ Promotions -> rank_history ============
  // Idempotent: clear prior legacy/manual promotions (event-based ones are kept).
  db.prepare("DELETE FROM rank_history WHERE promoted_at_event_id IS NULL").run();

  // Resolve + group by student so we can fill from_rank_id from the prior belt.
  const byStudent = new Map();
  for (const p of promotions) {
    const sid = studentByLegacy.get(p.s);
    if (!sid) { promSkipNoStudent++; continue; }
    const beltName = BELT[p.b];
    const toRankId = beltName ? beltIdByName.get(beltName) : undefined;
    if (!toRankId) { promSkipNoBelt++; continue; }
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push({ toRankId, track: TIGER.has(p.b) ? "tiger" : "regular", date: p.d });
  }

  const insProm = db.prepare(`
    INSERT INTO rank_history (student_id, from_rank_id, to_rank_id, track_at_time, promotion_date, note, promoted_at_event_id)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)
  `);
  for (const [sid, list] of byStudent) {
    list.sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1
        : (beltMeta.get(a.toRankId)?.sort_order ?? 0) - (beltMeta.get(b.toRankId)?.sort_order ?? 0));
    let prev = null;
    for (const e of list) {
      insProm.run(sid, prev, e.toRankId, e.track, e.date);
      prev = e.toRankId;
      promInserted++;
    }
  }

  // ============ Attendance -> attendance_records (class_type='legacy') ============
  // Idempotent: drop prior legacy attendance; keep app-entered (real class types).
  db.prepare(`
    DELETE FROM attendance_records WHERE session_id IN (SELECT id FROM attendance_sessions WHERE class_type='legacy')
  `).run();
  db.prepare("DELETE FROM attendance_sessions WHERE class_type='legacy'").run();

  // Existing (student, day) pairs from remaining (app) attendance — never double-count.
  const existing = new Set(
    db.prepare(`
      SELECT ar.student_id sid, ses.session_date d
      FROM attendance_records ar JOIN attendance_sessions ses ON ses.id = ar.session_id
    `).all().map((r) => `${r.sid}|${r.d}`),
  );

  const sessionByDate = new Map();
  const insSession = db.prepare("INSERT INTO attendance_sessions (session_date, class_type) VALUES (?, 'legacy')");
  const insRecord = db.prepare("INSERT INTO attendance_records (session_id, student_id, status) VALUES (?, ?, 'present')");

  for (const a of attendance) {
    const sid = studentByLegacy.get(a.s);
    if (!sid) { attSkipNoStudent++; continue; }
    const key = `${sid}|${a.d}`;
    if (existing.has(key)) { attSkipExisting++; continue; }
    let sessionId = sessionByDate.get(a.d);
    if (!sessionId) { sessionId = insSession.run(a.d).lastInsertRowid; sessionByDate.set(a.d, sessionId); }
    insRecord.run(sessionId, sid);
    existing.add(key);
    attInserted++;
  }
});
run();

console.log("\n=== Promotions ===");
console.log(`  inserted: ${promInserted} | skipped (no matching student): ${promSkipNoStudent} | skipped (unmapped belt): ${promSkipNoBelt}`);
console.log("=== Attendance ===");
console.log(`  inserted: ${attInserted} | skipped (no matching student): ${attSkipNoStudent} | skipped (already recorded that day): ${attSkipExisting}`);

const c = (q) => db.prepare(q).get().n;
console.log("\n=== DB totals now ===");
console.log(`  rank_history rows: ${c("SELECT COUNT(*) n FROM rank_history")}`);
console.log(`  attendance_records: ${c("SELECT COUNT(*) n FROM attendance_records")} (legacy sessions: ${c("SELECT COUNT(*) n FROM attendance_sessions WHERE class_type='legacy'")})`);
console.log(`  students with >=1 promotion: ${c("SELECT COUNT(DISTINCT student_id) n FROM rank_history")}`);
console.log(`  students with >=1 attendance: ${c("SELECT COUNT(DISTINCT student_id) n FROM attendance_records")}`);
db.close();
