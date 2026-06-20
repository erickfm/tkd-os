import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";

const db = new DatabaseSync(
  path.join(os.homedir(), "AppData", "Roaming", "com.erickfm.tkdos", "tkdos.db")
);
const q = (sql) => db.prepare(sql).all();
const one = (sql) => db.prepare(sql).get();

console.log("=== Row counts ===");
for (const t of ["students","belt_ranks","rank_history","student_progress","attendance_sessions","attendance_records","events","event_roster","starter_courses"]) {
  try { console.log(`  ${t.padEnd(22)} ${one(`SELECT COUNT(*) n FROM ${t}`).n}`); }
  catch (e) { console.log(`  ${t.padEnd(22)} ERR ${e.message}`); }
}

console.log("\n=== belt_ranks where degree IS NOT NULL  (= the app's 'black belt' set) ===");
for (const r of q("SELECT id,track,sort_order,name,degree FROM belt_ranks WHERE degree IS NOT NULL ORDER BY track,sort_order"))
  console.log(`  id=${String(r.id).padStart(3)} ${r.track.padEnd(8)} so=${String(r.sort_order).padStart(2)} ${String(r.degree).padEnd(12)} ${r.name}`);

console.log("\n=== ANOMALY: color belt (no 'Black' in name) carrying a degree? ===");
console.log("  ", q("SELECT id,name,degree FROM belt_ranks WHERE degree IS NOT NULL AND name NOT LIKE '%Black%'").length
  ? q("SELECT id,name,degree FROM belt_ranks WHERE degree IS NOT NULL AND name NOT LIKE '%Black%'") : "none — good");

console.log("\n=== ANOMALY: 'Black' in name but degree IS NULL (excluded from black-belt count) ===");
for (const r of q("SELECT id,track,name,is_graduation_rank FROM belt_ranks WHERE name LIKE '%Black%' AND degree IS NULL"))
  console.log(`  id=${r.id} ${r.track} '${r.name}' graduationRank=${r.is_graduation_rank}`);

console.log("\n=== Active students grouped by belt ===");
for (const r of q(`SELECT br.name, br.degree, COUNT(*) n
                   FROM students s JOIN belt_ranks br ON s.belt_rank_id=br.id
                   WHERE s.is_active=1 GROUP BY br.id ORDER BY br.track, br.sort_order`))
  console.log(`  n=${String(r.n).padStart(3)}  ${r.name}${r.degree!=null?"   <BLACK BELT>":""}`);

console.log("\n=== Dashboard 'Black Belts' figure (active AND degree != null) ===");
console.log("  black belts (active):", one("SELECT COUNT(*) n FROM students s JOIN belt_ranks br ON s.belt_rank_id=br.id WHERE s.is_active=1 AND br.degree IS NOT NULL").n);
console.log("  active total        :", one("SELECT COUNT(*) n FROM students WHERE is_active=1").n);

const checks = [
  ["students with a belt_rank_id that doesn't exist",
   "SELECT s.id,s.first_name,s.last_name,s.belt_rank_id FROM students s LEFT JOIN belt_ranks br ON s.belt_rank_id=br.id WHERE br.id IS NULL"],
  ["track mismatch: student.track <> belt.track",
   "SELECT s.id,s.first_name,s.last_name,s.track stu,br.track belt,br.name FROM students s JOIN belt_ranks br ON s.belt_rank_id=br.id WHERE s.track<>br.track"],
  ["tiger-track students not age_group='jr'",
   "SELECT id,first_name,last_name,age_group FROM students WHERE track='tiger' AND age_group<>'jr'"],
  ["students missing their 1:1 student_progress row",
   "SELECT s.id,s.first_name,s.last_name FROM students s LEFT JOIN student_progress p ON p.student_id=s.id WHERE p.id IS NULL"],
];
console.log("\n=== Integrity anomalies ===");
for (const [label, sql] of checks) {
  const rows = q(sql);
  console.log(`  ${label}: ${rows.length ? "" : "none — good"}`);
  for (const r of rows) console.log("      ", JSON.stringify(r));
}
db.close();
