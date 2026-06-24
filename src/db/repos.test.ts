import { afterAll, beforeAll, describe, expect, it } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { __setTestDb, createDb } from "./client";
import {
  addToRoster,
  buildBeltLabelsHtml,
  buildEventRosterCsv,
  buildTestingCycleCsv,
  createEvent,
  createStudent,
  getCurrentCycle,
  getCycleCandidates,
  getCycleRegistrations,
  getDashboardAlerts,
  getDashboardStats,
  getOrCreateSession,
  getStudentAttendance,
  listTrialStudents,
  setTrial,
  listBeltRanks,
  listStudents,
  minClassesToTest,
  promoteCycle,
  registerToTest,
  setAttendance,
  unregisterFromTest,
  updateCycle,
  updateProgress,
  type StudentInput,
} from "./repos";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "src-tauri", "migrations");

let sqlite: BetterSqlite3.Database;

// Coerce JS values to what better-sqlite3 accepts (booleans -> 0/1).
const coerce = (params: unknown[]) =>
  params.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));

beforeAll(() => {
  sqlite = new BetterSqlite3(":memory:");
  // Apply the real migrations (same SQL the app runs).
  sqlite.exec(readFileSync(join(migrationsDir, "0001_initial_schema.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0002_belt_colors.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0003_guardians.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0004_testing_cycle.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0005_legacy_id.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0006_testing_date.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0007_trial_start.sql"), "utf8"));

  const blackId = (sqlite
    .prepare("SELECT id FROM belt_ranks WHERE track='regular' AND degree IS NOT NULL ORDER BY sort_order LIMIT 1")
    .get() as { id: number }).id;
  const colorId = (sqlite
    .prepare("SELECT id FROM belt_ranks WHERE track='regular' AND degree IS NULL ORDER BY sort_order LIMIT 1")
    .get() as { id: number }).id;
  const tigerId = (sqlite
    .prepare("SELECT id FROM belt_ranks WHERE track='tiger' ORDER BY sort_order LIMIT 1")
    .get() as { id: number }).id;

  const ins = sqlite.prepare(
    "INSERT INTO students (first_name,last_name,track,age_group,belt_rank_id,join_date,is_active) VALUES (?,?,?,?,?,?,?)",
  );
  ins.run("Black", "Active1", "regular", "adult", blackId, "2020-01-01", 1);
  ins.run("Black", "Active2", "regular", "adult", blackId, "2020-01-01", 1);
  ins.run("Color", "Active1", "regular", "jr", colorId, "2020-01-01", 1);
  ins.run("Tiger", "Active1", "tiger", "jr", tigerId, "2020-01-01", 1);
  ins.run("Black", "Inactive", "regular", "adult", blackId, "2020-01-01", 0); // must NOT count

  const db = createDb({
    query: async (sql, params) => sqlite.prepare(sql).all(...coerce(params)) as Record<string, unknown>[],
    run: async (sql, params) => {
      sqlite.prepare(sql).run(...coerce(params));
    },
  });
  __setTestDb(db);
});

afterAll(() => {
  __setTestDb(null);
  sqlite.close();
});

describe("black-belt counting + belt field mapping (proxy collapse regression)", () => {
  it("counts only ACTIVE black belts (degree IS NOT NULL)", async () => {
    const stats = await getDashboardStats();
    // 2 active black belts seeded; the inactive one and the color/tiger excluded.
    expect(stats.black).toBe(2);
    expect(stats.activeTotal).toBe(4);
  });

  it("maps belt_ranks fields without positional shift", async () => {
    const rows = await listStudents();
    const black = rows.find((r) => r.lastName === "Active1" && r.firstName === "Black")!;
    const color = rows.find((r) => r.lastName === "Active1" && r.firstName === "Color")!;

    // The original bug made degree read color_hex (never null) for everyone.
    expect(black.rank.degree).not.toBeNull();
    expect(color.rank.degree).toBeNull();

    // Colors/names must be the real values, not shifted neighbors.
    expect(black.rank.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(black.rank.name).toContain("Black");
    expect(color.rank.name).not.toContain("Black");
  });
});

function makeInput(over: Partial<StudentInput>): StudentInput {
  return {
    firstName: "Test", lastName: "Student", dateOfBirth: "2014-05-01",
    phone: null, email: null,
    guardian1Name: null, guardian1Phone: null, guardian1Email: null,
    guardian2Name: null, guardian2Phone: null, guardian2Email: null,
    emergencyContact: null, track: "regular", ageGroup: "jr",
    beltRankId: 0, beltSize: null, joinDate: "2024-01-01", trialStartDate: null, notes: null,
    ...over,
  };
}

async function lowestRegularColorRank() {
  const ranks = await listBeltRanks();
  return ranks.find((r) => r.track === "regular" && r.degree == null && r.nextRankId != null)!;
}

describe("guardian fields", () => {
  it("round-trips both guardians through create + listStudents", async () => {
    const rank = await lowestRegularColorRank();
    const id = await createStudent(makeInput({
      firstName: "Guard", lastName: "Ian", beltRankId: rank.id,
      guardian1Name: "Pat Parent", guardian1Phone: "555-1111", guardian1Email: "pat@example.com",
      guardian2Name: "Sam Parent", guardian2Phone: "555-2222", guardian2Email: "sam@example.com",
    }));
    const s = (await listStudents()).find((r) => r.id === id)!;
    expect(s.guardian1Name).toBe("Pat Parent");
    expect(s.guardian1Phone).toBe("555-1111");
    expect(s.guardian1Email).toBe("pat@example.com");
    expect(s.guardian2Name).toBe("Sam Parent");
    expect(s.guardian2Phone).toBe("555-2222");
    expect(s.guardian2Email).toBe("sam@example.com");
  });
});

describe("testing cycle", () => {
  it("counts only in-range attendance and exposes stripe/PTT flags", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2024-01-01", "2024-12-31", null);

    const id = await createStudent(makeInput({ firstName: "Cy", lastName: "Cle", beltRankId: rank.id }));
    await updateProgress(id, { blueStripe: true, permissionToTest: true });

    // One present class inside the window, one present class outside it.
    const inSession = await getOrCreateSession("2024-06-01", "adult");
    await setAttendance(inSession, id, "present");
    const outSession = await getOrCreateSession("2023-06-01", "adult");
    await setAttendance(outSession, id, "present");

    await registerToTest(cycle.id, id);
    const reg = (await getCycleRegistrations(cycle.id)).find((r) => r.id === id)!;
    expect(reg.attendanceThisCycle).toBe(1);
    expect(reg.blueStripe).toBe(true);
    expect(reg.permissionToTest).toBe(true);
    expect(reg.greenStripe).toBe(false);
    expect(reg.testingFor).not.toBeNull();

    await unregisterFromTest(cycle.id, id);
  });

  it("computes min classes by rank and flags eligibility from cycle attendance", async () => {
    const ranks = await listBeltRanks();
    const cub = ranks.find((r) => r.track === "tiger")!;
    const white = ranks.find((r) => r.track === "regular" && r.classGroup === "jr-wy")!;
    const brown = ranks.find((r) => r.track === "regular" && r.classGroup === "jr-brb" && r.degree == null)!;
    expect(minClassesToTest(cub)).toBe(6);
    expect(minClassesToTest(white)).toBe(10);
    expect(minClassesToTest(brown)).toBe(12);

    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-06-01", "2025-08-01", "2025-07-15");
    const id = await createStudent(makeInput({ firstName: "Elig", lastName: "Ible", beltRankId: white.id }));
    // 10 present classes inside the window -> meets the white-belt minimum of 10.
    for (let i = 0; i < 10; i++) {
      const s = await getOrCreateSession(`2025-06-${String(i + 2).padStart(2, "0")}`, "adult");
      await setAttendance(s, id, "present");
    }
    await registerToTest(cycle.id, id);
    const row = (await getCycleRegistrations(cycle.id)).find((r) => r.id === id)!;
    expect(row.minClasses).toBe(10);
    expect(row.attendanceThisCycle).toBe(10);
    expect(row.meetsMinimum).toBe(true);
    await promoteCycle(cycle.id);
  });

  it("promotes every registered student one rank and clears the list", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    const id = await createStudent(makeInput({ firstName: "Promote", lastName: "Me", beltRankId: rank.id }));
    await registerToTest(cycle.id, id);

    const results = await promoteCycle(cycle.id);
    expect(results.some((r) => r.studentId === id && !r.skipped)).toBe(true);

    const after = (await listStudents()).find((r) => r.id === id)!;
    expect(after.beltRankId).toBe(rank.nextRankId);
    expect(await getCycleRegistrations(cycle.id)).toHaveLength(0);
  });

  it("exports name, age, and current belt as CSV", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    const id = await createStudent(makeInput({ firstName: "Ex", lastName: "Port", beltRankId: rank.id }));
    await registerToTest(cycle.id, id);

    const csv = await buildTestingCycleCsv(cycle.id);
    const [header, ...rows] = csv.split("\r\n");
    expect(header).toBe(["Name", "Age", "Current Belt", "Testing For", "Belt Size", "Classes", "Min", "Eligible"].join(","));
    expect(rows.some((line) => line.startsWith("Ex Port,"))).toBe(true);
    expect(rows.find((line) => line.startsWith("Ex Port,"))).toContain(rank.name);

    await promoteCycle(cycle.id); // clears registrations for any later runs
  });

  it("builds Avery 5160 belt-label HTML for registered students", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    const id = await createStudent(makeInput({ firstName: "Lab", lastName: "Eller", beltRankId: rank.id, beltSize: "3" }));
    await registerToTest(cycle.id, id);
    const html = await buildBeltLabelsHtml(cycle.id);
    expect(html).toContain("Lab Eller");
    expect(html).toContain("Size: 3");
    expect(html).toContain("2.625in"); // Avery 5160 label width
    await promoteCycle(cycle.id);
  });

  it("lists all active students with cycle attendance and a registered flag", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-12-31", null);
    const id = await createStudent(makeInput({ firstName: "Cand", lastName: "Idate", beltRankId: rank.id }));

    const inSession = await getOrCreateSession("2025-05-05", "adult");
    await setAttendance(inSession, id, "present");
    const outSession = await getOrCreateSession("2022-05-05", "adult");
    await setAttendance(outSession, id, "present");

    let me = (await getCycleCandidates(cycle.id)).find((c) => c.id === id)!;
    expect(me.attendanceThisCycle).toBe(1);
    expect(me.registered).toBe(false);

    await registerToTest(cycle.id, id);
    me = (await getCycleCandidates(cycle.id)).find((c) => c.id === id)!;
    expect(me.registered).toBe(true);

    await unregisterFromTest(cycle.id, id);
  });
});

describe("student attendance history", () => {
  it("totals only present classes and lists them most-recent first", async () => {
    const rank = await lowestRegularColorRank();
    const id = await createStudent(makeInput({ firstName: "Atten", lastName: "Dance", beltRankId: rank.id }));
    const s1 = await getOrCreateSession("2025-02-01", "adult");
    const s2 = await getOrCreateSession("2025-02-08", "adult");
    const s3 = await getOrCreateSession("2025-02-15", "adult");
    await setAttendance(s1, id, "present");
    await setAttendance(s2, id, "present");
    await setAttendance(s3, id, "absent"); // must not count

    const a = await getStudentAttendance(id);
    expect(a.total).toBe(2);
    expect(a.recent.map((r) => r.date)).toEqual(["2025-02-08", "2025-02-01"]);
  });
});

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("trials + dashboard alerts", () => {
  it("derives trial end (+6 weeks) and flags trials ending within a week", async () => {
    const rank = await lowestRegularColorRank();
    const soonId = await createStudent(makeInput({ firstName: "Soon", lastName: "Ending", beltRankId: rank.id }));
    const farId = await createStudent(makeInput({ firstName: "Far", lastName: "Out", beltRankId: rank.id }));
    await setTrial(soonId, isoDaysAgo(40)); // ends in ~2 days
    await setTrial(farId, isoDaysAgo(1)); // ends in ~41 days

    const trials = await listTrialStudents();
    const soon = trials.find((t) => t.id === soonId)!;
    expect(soon.trialEnd).toBe((() => { const d = new Date(isoDaysAgo(40) + "T00:00:00"); d.setDate(d.getDate() + 42); return d.toISOString().slice(0, 10); })());
    expect(soon.daysLeft).toBeLessThanOrEqual(7);

    const alerts = await getDashboardAlerts();
    expect(alerts.trialsEndingSoon.some((a) => a.id === soonId)).toBe(true);
    expect(alerts.trialsEndingSoon.some((a) => a.id === farId)).toBe(false);

    await setTrial(soonId, null);
    await setTrial(farId, null);
    expect((await listTrialStudents()).some((t) => t.id === soonId)).toBe(false);
  });

  it("flags active students absent >14 days who attended before, not the recent or never-attended", async () => {
    const rank = await lowestRegularColorRank();
    const lapsed = await createStudent(makeInput({ firstName: "Lap", lastName: "Sed", beltRankId: rank.id }));
    const recent = await createStudent(makeInput({ firstName: "Reg", lastName: "Ular", beltRankId: rank.id }));
    const sOld = await getOrCreateSession(isoDaysAgo(30), "adult");
    await setAttendance(sOld, lapsed, "present");
    const sNew = await getOrCreateSession(isoDaysAgo(3), "adult");
    await setAttendance(sNew, recent, "present");

    const { recurringAbsences } = await getDashboardAlerts();
    expect(recurringAbsences.some((a) => a.id === lapsed)).toBe(true);
    expect(recurringAbsences.some((a) => a.id === recent)).toBe(false);
  });
});

describe("event roster export", () => {
  it("exports name, age, track, and belt as CSV", async () => {
    const rank = await lowestRegularColorRank();
    const id = await createStudent(makeInput({ firstName: "Seminar", lastName: "Goer", beltRankId: rank.id }));
    const eventId = await createEvent({
      name: "Spring Seminar", eventDate: "2025-03-01", eventTime: null,
      eventType: "Seminar", location: null, notes: null,
    });
    await addToRoster(eventId, id);

    const csv = await buildEventRosterCsv(eventId);
    const [header, ...rows] = csv.split("\r\n");
    expect(header).toBe(["Name", "Age", "Track", "Belt", "Phone", "Email"].join(","));
    const line = rows.find((l) => l.startsWith("Seminar Goer,"))!;
    expect(line).toContain(rank.name);
    expect(line).toContain("Jr./Adult");
  });
});
