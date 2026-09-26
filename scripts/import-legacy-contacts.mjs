// One-shot importer: legacy MSS gender + parent/guardian contacts -> TKD OS SQLite.
//
// Reads two files exported from MSSData.mdb (both gitignored, contain PII):
//   scripts/legacy_sex.json        [{sid, sex}]        from T-STU_INFO.Sex
//   scripts/legacy_relations.json  [{sid, type, first, last, responsible, email, p1a, p1, ...}]
//                                                       from tblStudentRelations
// and fills students.gender and students.guardian1_* / guardian2_*.
//
// Rules
//   - Students are matched by students.legacy_id (= MSS Student ID).
//   - Fills BLANKS ONLY; anything already in the app (typed by hand) is never overwritten.
//   - Sex: M -> Male, F -> Female. Anything else (X / blank, ~480 former students) is left NULL
//     rather than guessed as "Other".
//   - Guardians: tblStudentRelations also holds siblings, children, spouses, etc. Only these
//     count as a guardian candidate:
//       * anyone flagged "Responsible Party" whose relation is parent / step-parent /
//         grandparent / aunt / uncle / legal guardian / Unknown / Other, or
//       * a non-responsible Mother, Father, Step-parent or Legal Guardian.
//     Ordered: responsible first, then Mother, Father, Legal Guardian, step-parents,
//     grandparents, aunt/uncle, Unknown/Other. A row that is the student themself is skipped,
//     and duplicate names collapse. Up to two fill Guardian 1 / Guardian 2.
//   - Students who were already 18+ when they joined get no guardians (fields are for minors).
//   - Phone = first non-empty of the person's 3 phones, written as "(805) 1234567" to match
//     the existing students.phone format.
//
// Default is a DRY RUN (read-only, prints what would change). Pass --apply to write; the DB
// is copied to tkdos.db.bak-<timestamp> first. Run --apply with the app CLOSED.
//
//   node scripts/import-legacy-contacts.mjs           # preview
//   node scripts/import-legacy-contacts.mjs --apply   # write
import Database from "better-sqlite3";
import { copyFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const here = dirname(fileURLToPath(import.meta.url));
const dbPath = join(process.env.APPDATA, "com.erickfm.tkdos", "tkdos.db");
const readJson = (f) => JSON.parse(readFileSync(join(here, f), "utf8").replace(/^﻿/, ""));
const sexRows = readJson("legacy_sex.json");
const relRows = readJson("legacy_relations.json");
console.log(`${APPLY ? "APPLY" : "DRY RUN"} — DB: ${dbPath}`);
console.log(`Loaded ${sexRows.length} sex rows, ${relRows.length} relation rows.`);

// Relation Type ids from tblRelationTypes.
const TYPE_PRIORITY = { 2: 1, 1: 2, 15: 3, 4: 4, 3: 5, 6: 6, 5: 7, 8: 8, 7: 9, 16: 10, 26: 11 };
const ALWAYS_GUARDIAN = new Set([1, 2, 3, 4, 15]); // counts even when not "Responsible Party"

const clean = (v) => (v == null ? "" : String(v).trim().replace(/\s+/g, " "));
const key = (v) => clean(v).toLowerCase();
const personName = (r) => [clean(r.first), clean(r.last)].filter(Boolean).join(" ");
function personPhone(r) {
  for (const n of ["1", "2", "3"]) {
    const num = clean(r[`p${n}`]);
    const digits = num.replace(/\D/g, "");
    if (digits.length < 7 || /^(\d)\1+$/.test(digits)) continue; // blank / placeholder like 5555555
    const area = clean(r[`p${n}a`]);
    return area ? `(${area}) ${num}` : num;
  }
  return "";
}

// Whole years between two ISO dates (YYYY-MM-DD).
const ageOn = (dob, on) => {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
};

const relsBySid = new Map();
for (const r of relRows) {
  if (!(r.type in TYPE_PRIORITY)) continue;
  if (!r.responsible && !ALWAYS_GUARDIAN.has(r.type)) continue;
  if (!personName(r)) continue;
  (relsBySid.get(r.sid) ?? relsBySid.set(r.sid, []).get(r.sid)).push(r);
}
const sexBySid = new Map(sexRows.map((r) => [r.sid, r.sex]));

const db = new Database(dbPath, { readonly: !APPLY });
const students = db
  .prepare(
    `SELECT id, legacy_id, first_name, last_name, is_active, gender, date_of_birth, join_date,
            guardian1_name, guardian1_phone, guardian1_email,
            guardian2_name, guardian2_phone, guardian2_email
       FROM students WHERE legacy_id IS NOT NULL`,
  )
  .all();

const GENDER = { M: "Male", F: "Female" };
const stat = {
  genderSet: 0, genderSkipXorBlank: 0, genderAlreadySet: 0,
  studentsWithGuardianChange: 0, activeWithGuardianChange: 0,
  g1Filled: 0, g2Filled: 0, phoneBlanksFilled: 0, noCandidates: 0, activeNoCandidates: 0, adultsSkipped: 0,
};
const updates = [];

for (const s of students) {
  const patch = {};

  // --- gender ---
  const g = GENDER[clean(sexBySid.get(s.legacy_id)).toUpperCase()];
  if (s.gender) stat.genderAlreadySet++;
  else if (g) { patch.gender = g; stat.genderSet++; }
  else stat.genderSkipXorBlank++;

  // --- guardians ---
  const own = key(`${s.first_name} ${s.last_name}`);
  const seen = new Set();
  const adultAtJoin = s.date_of_birth && s.join_date && ageOn(s.date_of_birth, s.join_date) >= 18;
  if (adultAtJoin) stat.adultsSkipped++;
  const cands = (adultAtJoin ? [] : relsBySid.get(s.legacy_id) ?? [])
    .sort((a, b) =>
      Number(b.responsible) - Number(a.responsible) ||
      TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type] ||
      a.relId - b.relId)
    .map((r) => ({ name: personName(r), phone: personPhone(r), email: clean(r.email) }))
    .filter((c) => {
      const k = key(c.name);
      if (k === own || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  if (cands.length === 0) { stat.noCandidates++; if (s.is_active) stat.activeNoCandidates++; }

  // Existing manual entries win: skip candidates already present, and only top up blanks.
  const slots = [1, 2].map((n) => ({
    n, name: clean(s[`guardian${n}_name`]), phone: clean(s[`guardian${n}_phone`]), email: clean(s[`guardian${n}_email`]),
  }));
  const existingNames = new Set(slots.map((x) => key(x.name)).filter(Boolean));
  const pool = cands.filter((c) => !existingNames.has(key(c.name)));
  let changed = false;
  for (const slot of slots) {
    if (slot.name) {
      // Same person already typed in: top up a missing phone/email only.
      const match = cands.find((c) => key(c.name) === key(slot.name));
      if (match) {
        if (!slot.phone && match.phone) { patch[`guardian${slot.n}_phone`] = match.phone; stat.phoneBlanksFilled++; changed = true; }
        if (!slot.email && match.email) { patch[`guardian${slot.n}_email`] = match.email; changed = true; }
      }
      continue;
    }
    const next = pool.shift();
    if (!next) continue;
    patch[`guardian${slot.n}_name`] = next.name;
    if (next.phone) patch[`guardian${slot.n}_phone`] = next.phone;
    if (next.email) patch[`guardian${slot.n}_email`] = next.email;
    stat[`g${slot.n}Filled`]++;
    changed = true;
  }
  if (changed) { stat.studentsWithGuardianChange++; if (s.is_active) stat.activeWithGuardianChange++; }

  if (Object.keys(patch).length) updates.push({ id: s.id, active: !!s.is_active, patch });
}

console.log("\nSummary:", stat);
console.log(`Students with any change: ${updates.length} (${updates.filter((u) => u.active).length} active)`);
const sample = updates.filter((u) => u.active && u.patch.guardian1_name).slice(0, 5);
console.log("\nSample active students (id -> patch):");
for (const u of sample) console.log(u.id, JSON.stringify(u.patch));

if (!APPLY) {
  console.log("\nDry run only — nothing written. Re-run with --apply (app closed) to write.");
  process.exit(0);
}

const backup = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
copyFileSync(dbPath, backup);
console.log("\nBackup written:", backup);

const run = db.transaction(() => {
  for (const u of updates) {
    const cols = Object.keys(u.patch);
    db.prepare(`UPDATE students SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...cols.map((c) => u.patch[c]), u.id);
  }
});
run();
console.log(`Updated ${updates.length} students.`);
