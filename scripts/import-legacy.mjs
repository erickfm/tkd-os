// One-shot importer: legacy MSS Access data -> TKD OS SQLite DB.
// Reads scripts/legacy_students.json + legacy_medical.json (exported from MSSData.mdb)
// and writes students + student_progress into the app's SQLite database.
//
// Run with the app CLOSED:  node scripts/import-legacy.mjs
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = join(process.env.APPDATA, "com.erickfm.tkdos", "tkdos.db");
console.log("DB:", dbPath);

// Old MSS RankID -> new belt_ranks.name
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
const students = readJson("legacy_students.json");
const medicalArr = readJson("legacy_medical.json");
const medical = new Map(medicalArr.map((m) => [m.sid, m]));

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const beltIdByName = new Map(
  db.prepare("SELECT id, name FROM belt_ranks").all().map((r) => [r.name, r.id]),
);
const today = new Date().toISOString().slice(0, 10);

function phone(area, num) {
  if (!num) return null;
  return area ? `(${area}) ${num}` : num;
}
function emergencyContact(m) {
  if (!m || !m.emergName) return null;
  const p = phone(m.emergArea, m.emergPhone);
  return [m.emergName, m.emergRel ? `(${m.emergRel})` : null, p ? `- ${p}` : null]
    .filter(Boolean).join(" ");
}
function notes(m) {
  if (!m) return null;
  const parts = [];
  if (m.conditions?.length) parts.push("Medical conditions: " + m.conditions.join(", "));
  if (m.explain1) parts.push(m.explain1);
  if (m.explain2) parts.push(m.explain2);
  if (m.medication) parts.push("Medication: " + m.medication);
  if (m.doctorRestr) parts.push("Doctor restriction: " + m.doctorRestr);
  if (m.medNotes) parts.push(m.medNotes);
  return parts.length ? parts.join("\n") : null;
}

const insStudent = db.prepare(`
  INSERT INTO students
    (first_name, last_name, date_of_birth, phone, email, emergency_contact,
     track, age_group, belt_rank_id, belt_size, join_date, is_starter_student, notes, is_active)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,1)
`);
const insProgress = db.prepare("INSERT INTO student_progress (student_id) VALUES (?)");

let imported = 0;
const skipped = [];
const run = db.transaction(() => {
  db.prepare("DELETE FROM student_progress").run();
  db.prepare("DELETE FROM students").run();
  for (const s of students) {
    if (!s.first || !s.last) { skipped.push(`${s.sid}: missing name`); continue; }
    const track = TIGER.has(s.oldRankId) ? "tiger" : "regular";
    const beltName = BELT[s.oldRankId] ?? "White Belt";
    const beltId = beltIdByName.get(beltName);
    if (!beltId) { skipped.push(`${s.first} ${s.last}: no belt for "${beltName}"`); continue; }
    const ageGroup = track === "regular" && s.age != null && s.age >= 18 ? "adult" : "jr";
    const m = medical.get(s.sid);
    const info = insStudent.run(
      s.first, s.last, s.dob ?? null, phone(s.homeArea, s.homePhone), s.email ?? null,
      emergencyContact(m), track, ageGroup, beltId, s.beltSize ?? null,
      s.startDate ?? today, notes(m),
    );
    insProgress.run(info.lastInsertRowid);
    imported++;
  }
});
run();

console.log(`Imported ${imported} students (each with a student_progress row).`);
if (skipped.length) console.log("Skipped:\n  " + skipped.join("\n  "));

const byTrack = db.prepare("SELECT track, COUNT(*) n FROM students GROUP BY track").all();
const adults = db.prepare("SELECT COUNT(*) n FROM students WHERE age_group='adult'").get().n;
console.log("By track:", byTrack.map((r) => `${r.track}=${r.n}`).join(", "), `| adults=${adults}`);
db.close();
