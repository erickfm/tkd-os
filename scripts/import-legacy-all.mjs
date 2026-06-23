// One-shot full importer: legacy MSS -> TKD OS SQLite DB (authoritative rebuild).
// Reads scripts/legacy_all_students.json + legacy_all_medical.json (all 2,725
// students exported from MSSData.mdb) and rebuilds the students table.
//
// ACTIVE STATUS comes from the MSS "Activity Level" field: 1 = active, else
// inactive/former. (The old "no termination date" heuristic was wrong — some
// active members carry a stale termination date, and some who quietly stopped
// coming were never terminated.) The legacy Student ID is stored in legacy_id.
//
// Preserves existing event rosters by matching student names (re-adds them after
// the rebuild). Clears throwaway test data (attendance, testing registrations).
//
// Requires migration 0005 (legacy_id column) to be applied first.
// Run with the app CLOSED:  node scripts/import-legacy-all.mjs
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = join(process.env.APPDATA, "com.erickfm.tkdos", "tkdos.db");
console.log("DB:", dbPath);

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
  0: "White Belt",
};
const TIGER = new Set([1, 2, 3, 4, 5, 6, 7, 44]);

const readJson = (f) => JSON.parse(readFileSync(join(here, f), "utf8").replace(/^﻿/, ""));
const students = readJson("legacy_all_students.json");
const medicalArr = readJson("legacy_all_medical.json");
const medical = new Map(medicalArr.map((m) => [m.sid, m]));

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

// Guard: legacy_id column must exist (migration 0005).
const hasLegacy = db.prepare("PRAGMA table_info(students)").all().some((c) => c.name === "legacy_id");
if (!hasLegacy) { console.error("ERROR: students.legacy_id missing — apply migration 0005 first (rebuild + launch the app)."); process.exit(1); }

const beltIdByName = new Map(
  db.prepare("SELECT id, name FROM belt_ranks").all().map((r) => [r.name, r.id]),
);
const today = new Date().toISOString().slice(0, 10);

function phone(area, num) {
  if (!num) return null;
  return area ? `(${area}) ${num}` : String(num);
}
function emergencyContact(m) {
  if (!m || !m.emergName) return null;
  const p = phone(m.emergArea, m.emergPhone);
  return [m.emergName, m.emergRel ? `(${m.emergRel})` : null, p ? `- ${p}` : null].filter(Boolean).join(" ");
}
function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const mo = now.getMonth() - d.getMonth();
  if (mo < 0 || (mo === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
function notes(s, m, isActive) {
  const parts = [];
  if (!isActive) {
    if (s.termDate) parts.push(s.termReason ? `Former student (left ${s.termDate}): ${s.termReason}` : `Former student (left ${s.termDate})`);
    else parts.push("Inactive student");
  }
  if (m) {
    if (m.conditions?.length) parts.push("Medical conditions: " + m.conditions.join(", "));
    if (m.explain1) parts.push(m.explain1);
    if (m.explain2) parts.push(m.explain2);
    if (m.medication) parts.push("Medication: " + m.medication);
    if (m.doctorRestr) parts.push("Doctor restriction: " + m.doctorRestr);
    if (m.medNotes) parts.push(m.medNotes);
  }
  return parts.length ? parts.join("\n") : null;
}

const insStudent = db.prepare(`
  INSERT INTO students
    (legacy_id, first_name, last_name, date_of_birth, phone, email, emergency_contact,
     track, age_group, belt_rank_id, belt_size, join_date, is_starter_student, notes, is_active)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
`);
const insProgress = db.prepare("INSERT INTO student_progress (student_id) VALUES (?)");

let imported = 0, active = 0;
const skipped = [];
const restoreSkipped = [];
const run = db.transaction(() => {
  // Capture existing event rosters (by name) so real events survive the rebuild.
  const preservedRosters = db.prepare(
    "SELECT er.event_id eid, s.first_name f, s.last_name l FROM event_roster er JOIN students s ON s.id = er.student_id",
  ).all();

  // Clear child rows referencing students, then progress + students. Throwaway
  // test data (attendance, testing registrations) is intentionally dropped.
  db.prepare("DELETE FROM testing_registration").run();
  db.prepare("DELETE FROM event_roster").run();
  db.prepare("DELETE FROM attendance_records").run();
  db.prepare("DELETE FROM student_progress").run();
  db.prepare("DELETE FROM students").run();

  for (const s of students) {
    if (!s.first || !s.last) { skipped.push(`${s.sid}: missing name`); continue; }
    const track = TIGER.has(s.oldRankId) ? "tiger" : "regular";
    const beltId = beltIdByName.get(BELT[s.oldRankId] ?? "White Belt");
    if (!beltId) { skipped.push(`${s.first} ${s.last}: no belt for rank ${s.oldRankId}`); continue; }
    const age = s.age != null ? s.age : ageFromDob(s.dob);
    const ageGroup = track === "regular" && age != null && age >= 18 ? "adult" : "jr";
    const isActive = s.activityLevel === 1 ? 1 : 0;
    const m = medical.get(s.sid);
    const info = insStudent.run(
      s.sid, s.first, s.last, s.dob ?? null, phone(s.homeArea, s.homePhone), s.email ?? null,
      emergencyContact(m), track, ageGroup, beltId, s.beltSize ?? null,
      s.startDate ?? today, notes(s, m, isActive), isActive,
    );
    insProgress.run(info.lastInsertRowid);
    imported++;
    if (isActive) active++;
  }

  // Restore preserved event rosters by unique name match.
  const findByName = db.prepare("SELECT id FROM students WHERE first_name = ? AND last_name = ?");
  const insRoster = db.prepare("INSERT OR IGNORE INTO event_roster (event_id, student_id) VALUES (?, ?)");
  for (const pr of preservedRosters) {
    const matches = findByName.all(pr.f, pr.l);
    if (matches.length === 1) insRoster.run(pr.eid, matches[0].id);
    else restoreSkipped.push(`${pr.f} ${pr.l} (${matches.length} matches)`);
  }
});
run();

console.log(`Imported ${imported} students; active=${active}, inactive=${imported - active}.`);
if (skipped.length) console.log(`Skipped ${skipped.length}:\n  ` + skipped.slice(0, 20).join("\n  "));
const tally = db.prepare("SELECT is_active, COUNT(*) n FROM students GROUP BY is_active").all();
console.log("By is_active:", tally.map((r) => `${r.is_active}=${r.n}`).join(", "));
const byTrack = db.prepare("SELECT track, COUNT(*) n FROM students GROUP BY track").all();
console.log("By track:", byTrack.map((r) => `${r.track}=${r.n}`).join(", "));
const rosterN = db.prepare("SELECT COUNT(*) n FROM event_roster").get().n;
console.log(`Event-roster rows restored: ${rosterN}` + (restoreSkipped.length ? ` (skipped: ${restoreSkipped.join("; ")})` : ""));
const orphans = db.prepare("SELECT COUNT(*) n FROM students s LEFT JOIN student_progress p ON p.student_id=s.id WHERE p.id IS NULL").get().n;
const noLegacy = db.prepare("SELECT COUNT(*) n FROM students WHERE legacy_id IS NULL").get().n;
console.log(`Missing progress row: ${orphans} | missing legacy_id: ${noLegacy}`);
db.close();
