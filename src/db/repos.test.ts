import { afterAll, beforeAll, describe, expect, it } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { __setTestDb, createDb } from "./client";
import {
  addInventoryItem,
  addInventoryItems,
  addToRoster,
  buildBeltLabelsHtml,
  buildCertificateRows,
  clearSpecialTesters,
  buildEventRosterCsv,
  buildNonTestersCsv,
  buildTestingCycleCsv,
  createEvent,
  createStudent,
  getBeltOrderBreakdown,
  getBeltOrderRoster,
  getCurrentCycle,
  getCycleCandidates,
  getCycleRegistrations,
  getNonTesters,
  getDashboardAlerts,
  getDashboardStats,
  getUpcomingAgenda,
  deleteInventoryItem,
  getOrCreateSession,
  getStudentAttendance,
  addSpecialTester,
  deleteStudentPermanently,
  getStudentDeleteImpact,
  listEvents,
  listInventory,
  listNoChangeHistory,
  listPostedEvents,
  listRankHistory,
  listSpecialTesters,
  listTrialStudents,
  markNoChange,
  updateInventoryItem,
  postEvent,
  promoteStudent,
  removeSpecialTester,
  setSpecialTesterTested,
  setStudentActive,
  setTrial,
  listBeltRanks,
  listStudents,
  listStudentsWithProgress,
  minClassesToTest,
  promoteCycle,
  registerToTest,
  setRegistrationTarget,
  updateRankHistory,
  setAttendance,
  studentsForClass,
  unpostEvent,
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
  sqlite.exec(readFileSync(join(migrationsDir, "0008_inventory.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0009_event_class_credit.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0010_special_testers.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0011_black_belt_inventory.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0012_no_change_history.sql"), "utf8"));
  sqlite.exec(readFileSync(join(migrationsDir, "0013_target_rank.sql"), "utf8"));

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

  it("exports students not registered or on the early/late list, falling back to guardian1 phone", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-12-31", null);

    const registered = await createStudent(makeInput({ firstName: "Reg", lastName: "Istered", beltRankId: rank.id }));
    const early = await createStudent(makeInput({ firstName: "Ear", lastName: "Ly", beltRankId: rank.id }));
    const skipped = await createStudent(makeInput({
      firstName: "Skip", lastName: "Ped", beltRankId: rank.id, beltSize: "4",
      phone: null, guardian1Phone: "555-2222",
    }));
    const inSession = await getOrCreateSession("2025-05-05", "adult");
    await setAttendance(inSession, skipped, "present");

    await registerToTest(cycle.id, registered);
    await addSpecialTester(early, "2025-06-01");

    const nonTesters = await getNonTesters(cycle.id);
    expect(nonTesters.some((s) => s.id === registered)).toBe(false);
    expect(nonTesters.some((s) => s.id === early)).toBe(false);
    const row = nonTesters.find((s) => s.id === skipped)!;
    expect(row).toBeDefined();
    expect(row.attendanceThisCycle).toBe(1);
    expect(row.testingFor).not.toBeNull(); // lowestRegularColorRank() always has a nextRankId

    const csv = await buildNonTestersCsv(cycle.id);
    const [header, ...rows] = csv.split("\r\n");
    expect(header).toBe(["Name", "Age", "Belt", "Prospective Rank", "Belt Size", "Attendance", "Phone"].join(","));
    const line = rows.find((l) => l.startsWith("Skip Ped,"))!;
    expect(line).toBeDefined();
    expect(line).toContain(row.testingFor!); // prospective rank
    expect(line).toContain(",4,"); // belt size
    expect(line).toContain("555-2222"); // falls back to guardian1Phone since phone is null
    expect(rows.some((l) => l.startsWith("Reg Istered,"))).toBe(false);
    expect(rows.some((l) => l.startsWith("Ear Ly,"))).toBe(false);

    await unregisterFromTest(cycle.id, registered);
    await removeSpecialTester((await listSpecialTesters()).find((r) => r.id === early)!.specialTesterId);
  });
});

describe("belt order", () => {
  it("builds the roster in rank order and the purchase breakdown against inventory stock", async () => {
    const ranks = await listBeltRanks();
    const redL3 = ranks.find((r) => r.track === "regular" && r.name === "Red Belt L3")!;
    const blackL1 = ranks.find((r) => r.track === "regular" && r.name === "1st Degree Black L1")!;
    const yellow = ranks.find((r) => r.track === "regular" && r.name === "Yellow Belt")!;
    const cycle = await getCurrentCycle();

    // Red Belt L3 testing into 1st Degree Black L1 — a newly-awarded black
    // belt IS stocked (as plain "Black"), shown on the breakdown as "Black Belt".
    const blackId = await createStudent(makeInput({ firstName: "Bla", lastName: "Ck", beltRankId: redL3.id, beltSize: "2" }));
    // 1st Degree Black L1 testing into 1st Degree Black L2 — that's custom-
    // monogrammed, not stocked, so on the roster but not the breakdown.
    const degreeId = await createStudent(makeInput({ firstName: "Deg", lastName: "Ree", beltRankId: blackL1.id, beltSize: "3" }));
    // Two Yellow Belts testing into Green Belt size 3 — that IS a stocked item.
    const y1 = await createStudent(makeInput({ firstName: "Yel", lastName: "Low1", beltRankId: yellow.id, beltSize: "3" }));
    const y2 = await createStudent(makeInput({ firstName: "Yel", lastName: "Low2", beltRankId: yellow.id, beltSize: "3" }));
    await registerToTest(cycle.id, blackId);
    await registerToTest(cycle.id, degreeId);
    await registerToTest(cycle.id, y1);
    await registerToTest(cycle.id, y2);

    // Need 2 Green/size-3 belts but only 1 on hand.
    const belts = (await listInventory()).find((s) => s.section.name === "Belts")!;
    const greenSize3 = belts.items.find((i) => i.name === "Green" && i.size === "3")!;
    await updateInventoryItem(greenSize3.id, { inStock: 1 });

    const roster = await getBeltOrderRoster(cycle.id);
    expect(roster.some((r) => r.name === "Bla Ck" && r.testingFor === "1st Degree Black L1")).toBe(true);
    expect(roster.some((r) => r.name === "Deg Ree" && r.testingFor === "1st Degree Black L2")).toBe(true);
    expect(roster.filter((r) => r.testingFor === "Green Belt").length).toBe(2);
    // Rank order: the Yellow Belts (testing for Green, low rank) sort before the Red Belt L3 (testing for Black L1).
    expect(roster.findIndex((r) => r.testingFor === "Green Belt")).toBeLessThan(roster.findIndex((r) => r.name === "Bla Ck"));

    const breakdown = await getBeltOrderBreakdown(cycle.id);
    // 1st Degree Black L1 -> shown as "Black Belt", stocked, and included.
    const blackRow = breakdown.find((b) => b.belt === "Black Belt" && b.size === "2")!;
    expect(blackRow).toBeDefined();
    expect(blackRow.needed).toBe(1);
    expect(blackRow.inStock).toBe(0);
    expect(blackRow.toPurchase).toBe(1);
    // 1st Degree Black L2 (and every degree/level past L1) is custom-monogrammed — omitted.
    expect(breakdown.some((b) => b.belt === "1st Degree Black L2")).toBe(false);

    const greenRow = breakdown.find((b) => b.belt === "Green Belt" && b.size === "3")!;
    expect(greenRow).toBeDefined();
    expect(greenRow.needed).toBe(2);
    expect(greenRow.inStock).toBe(1);
    expect(greenRow.toPurchase).toBe(1);

    await unregisterFromTest(cycle.id, blackId);
    await unregisterFromTest(cycle.id, degreeId);
    await unregisterFromTest(cycle.id, y1);
    await unregisterFromTest(cycle.id, y2);
    await updateInventoryItem(greenSize3.id, { inStock: 0 }); // restore for later tests
  });

  it("groups Tiger Cub belts by stripe color only, ignoring physical belt size", async () => {
    const ranks = await listBeltRanks();
    const tigerWhite = ranks.find((r) => r.track === "tiger" && r.sortOrder === 0)!;
    const cycle = await getCurrentCycle();
    const id = await createStudent(makeInput({ firstName: "Tig", lastName: "Er", track: "tiger", beltRankId: tigerWhite.id, beltSize: "00" }));
    await registerToTest(cycle.id, id);

    const breakdown = await getBeltOrderBreakdown(cycle.id);
    const row = breakdown.find((b) => b.belt === "Tiger Cub Yellow Stripe")!;
    expect(row).toBeDefined();
    expect(row.size).toBe("—");
    expect(row.needed).toBe(1);

    await unregisterFromTest(cycle.id, id);
  });
});

describe("promote all — scope of progress reset and cycle date window", () => {
  it("resets stripes/PTT only for students who tested, leaving untested students' progress untouched", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-06-30", "2025-06-15");

    const tested = await createStudent(makeInput({ firstName: "Tes", lastName: "Ted", beltRankId: rank.id }));
    const untested = await createStudent(makeInput({ firstName: "Unt", lastName: "Ested", beltRankId: rank.id }));
    await updateProgress(tested, { greenStripe: true, permissionToTest: true });
    await updateProgress(untested, { greenStripe: true, permissionToTest: true });

    await registerToTest(cycle.id, tested);
    // `untested` is intentionally left off the roster.

    await promoteCycle(cycle.id);

    const progress = await listStudentsWithProgress();
    const testedRow = progress.find((s) => s.id === tested)!;
    const untestedRow = progress.find((s) => s.id === untested)!;
    expect(testedRow.greenStripe).toBe(false);
    expect(testedRow.permissionToTest).toBe(false);
    expect(untestedRow.greenStripe).toBe(true); // not touched — never tested
    expect(untestedRow.permissionToTest).toBe(true);

    await setStudentActive(tested, false);
    await setStudentActive(untested, false);
  });

  it("dates the promotion to the cycle's testing_date, not whatever day Process Testing happens to be clicked", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    // Testing happened on the 18th; staff don't click Process Testing until the 23rd
    // (waiting on late testers/retests) — the promotion must still be dated the 18th.
    await updateCycle(cycle.id, "2026-06-01", "2026-08-01", "2026-07-18");

    const id = await createStudent(makeInput({ firstName: "Matt", lastName: "Hew", beltRankId: rank.id }));
    await registerToTest(cycle.id, id);

    // Classes in the gap between testing day and the (later) Process Testing click.
    const gap1 = await getOrCreateSession("2026-07-21", "adult");
    await setAttendance(gap1, id, "present");
    const gap2 = await getOrCreateSession("2026-07-23", "adult"); // the day the button is actually clicked
    await setAttendance(gap2, id, "present");

    await promoteCycle(cycle.id); // simulates clicking Process Testing on the 23rd

    const history = await listRankHistory(id);
    expect(history).toHaveLength(1);
    expect(history[0].h.promotionDate).toBe("2026-07-18"); // the testing date, not today() / the 23rd

    // Both gap classes now count toward the new cycle, since the cutoff is the 18th.
    const attendance = await getStudentAttendance(id);
    expect(attendance.sinceLastPromotion).toBe(2);

    await setStudentActive(id, false);
  });

  it("rolls the cycle's date window forward after promoting, so class counts reset for everyone", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-06-30", "2025-06-15");

    const tested = await createStudent(makeInput({ firstName: "Roll", lastName: "Er", beltRankId: rank.id }));
    const untested = await createStudent(makeInput({ firstName: "Sti", lastName: "Cked", beltRankId: rank.id }));
    await registerToTest(cycle.id, tested);

    // Attendance before and after the old testing date, for the untested student.
    const before = await getOrCreateSession("2025-03-01", "adult");
    await setAttendance(before, untested, "present");
    const after = await getOrCreateSession("2025-06-20", "adult"); // after the old testing date
    await setAttendance(after, untested, "present");

    await promoteCycle(cycle.id); // at least one student registered -> rolls the dates

    const rolled = await getCurrentCycle();
    expect(rolled.id).toBe(cycle.id); // same single active cycle row, dates rolled in place
    expect(rolled.startDate).toBe("2025-06-16"); // day after the old testing date
    expect(rolled.endDate).toBe("2025-09-14"); // 90-day placeholder
    expect(rolled.testingDate).toBeNull();

    // Class counts reset for EVERYONE, not just the tested student: the
    // pre-testing-date March class no longer counts, and the June 20 class
    // (previously excluded as "after the testing date") now does.
    const candidate = (await getCycleCandidates(cycle.id)).find((c) => c.id === untested)!;
    expect(candidate.attendanceThisCycle).toBe(1); // only the June 20 session

    await setStudentActive(tested, false);
    await setStudentActive(untested, false);
  });

  it("still rolls the cycle's dates when nothing is left registered, as long as a testing date was set (e.g. everyone was marked No Change)", async () => {
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-06-30", "2025-06-15");

    await promoteCycle(cycle.id); // nothing registered, but a testing date was scheduled

    const rolled = await getCurrentCycle();
    expect(rolled.startDate).toBe("2025-06-16");
    expect(rolled.testingDate).toBeNull();
  });

  it("leaves the cycle's dates untouched when no testing date was ever set", async () => {
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-06-30", null);

    await promoteCycle(cycle.id); // nothing registered, no testing date -> untouched cycle

    const stillCurrent = await getCurrentCycle();
    expect(stillCurrent.startDate).toBe("2025-01-01");
    expect(stillCurrent.endDate).toBe("2025-06-30");
  });

  it("classes attended in the gap between testing day and clicking Promote All count toward the NEXT cycle, not the one that just tested", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    // Mirrors the real workflow: testing on 7/18, but Promote All doesn't
    // get clicked until several days later (here simulated as 7/24).
    await updateCycle(cycle.id, "2026-06-01", "2026-08-01", "2026-07-18");

    const tested = await createStudent(makeInput({ firstName: "Test", lastName: "Er", beltRankId: rank.id }));
    const gapAttender = await createStudent(makeInput({ firstName: "Gap", lastName: "Attender", beltRankId: rank.id }));
    await registerToTest(cycle.id, tested);

    const testingDay = await getOrCreateSession("2026-07-18", "adult"); // the testing day itself
    await setAttendance(testingDay, gapAttender, "present");
    const gapDay1 = await getOrCreateSession("2026-07-19", "adult"); // day right after testing
    await setAttendance(gapDay1, gapAttender, "present");
    const gapDay2 = await getOrCreateSession("2026-07-20", "adult"); // "today" in the scenario — still not promoted
    await setAttendance(gapDay2, gapAttender, "present");

    // Before Promote All is clicked (still 7/20, nothing promoted yet): only
    // the 7/18 testing-day class counts toward the cycle that's testing —
    // the 7/19 and 7/20 gap classes are already excluded.
    let candidate = (await getCycleCandidates(cycle.id)).find((c) => c.id === gapAttender)!;
    expect(candidate.attendanceThisCycle).toBe(1); // just 7/18

    // Promote All finally gets clicked the following Friday (7/24) — the
    // wall-clock date it's clicked on doesn't matter; the roll is anchored
    // to the old testing_date, not to "today".
    await promoteCycle(cycle.id);

    const rolled = await getCurrentCycle();
    expect(rolled.startDate).toBe("2026-07-19"); // day after the old testing date

    // Now the 7/19 and 7/20 gap classes count toward the NEW cycle, and the
    // 7/18 testing-day class does not leak forward into it.
    candidate = (await getCycleCandidates(cycle.id)).find((c) => c.id === gapAttender)!;
    expect(candidate.attendanceThisCycle).toBe(2); // 7/19 + 7/20, not 7/18

    await setStudentActive(tested, false);
    await setStudentActive(gapAttender, false);
  });
});

describe("no change (tested but not promoted)", () => {
  it("records the reason/note against the student's current rank, removes them from the roster, and leaves progress untouched", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-06-30", "2025-06-15");

    const id = await createStudent(makeInput({ firstName: "Did", lastName: "Notpass", beltRankId: rank.id }));
    await updateProgress(id, { greenStripe: true, permissionToTest: true });
    await registerToTest(cycle.id, id);

    await markNoChange(cycle.id, id, "BB", "Broke form on the third board.");

    // Removed from the roster — same as a promotion, they've been processed.
    expect((await getCycleRegistrations(cycle.id)).some((r) => r.id === id)).toBe(false);

    // Belt and progress are untouched — no rank_history row, same rank, stripes intact.
    expect(await listRankHistory(id)).toHaveLength(0);
    const student = (await listStudents()).find((s) => s.id === id)!;
    expect(student.beltRankId).toBe(rank.id);
    const progress = (await listStudentsWithProgress()).find((s) => s.id === id)!;
    expect(progress.greenStripe).toBe(true);
    expect(progress.permissionToTest).toBe(true);

    const history = await listNoChangeHistory(id);
    expect(history).toHaveLength(1);
    expect(history[0].h.reason).toBe("BB");
    expect(history[0].h.note).toBe("Broke form on the third board.");
    expect(history[0].h.testDate).toBe("2025-06-15"); // the cycle's testing date
    expect(history[0].at.id).toBe(rank.id); // recorded against the belt they were testing at

    await setStudentActive(id, false);
  });

  it("still rolls the cycle's dates via Process Testing when every registered student was marked No Change", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-02-01", "2025-07-01", "2025-06-20");

    const id = await createStudent(makeInput({ firstName: "All", lastName: "Nc", beltRankId: rank.id }));
    await registerToTest(cycle.id, id);
    await markNoChange(cycle.id, id, "Other", null);

    expect(await getCycleRegistrations(cycle.id)).toHaveLength(0); // nobody left to promote

    const results = await promoteCycle(cycle.id); // "Process Testing" with an empty roster
    expect(results).toHaveLength(0);

    const rolled = await getCurrentCycle();
    expect(rolled.startDate).toBe("2025-06-21"); // still rolled forward

    await setStudentActive(id, false);
  });
});

describe("rank skip (target_rank_id override)", () => {
  it("lets a Tiger Cub register to test directly for Black Stripe, skipping intermediate stripes, and graduates them", async () => {
    const ranks = await listBeltRanks();
    const purpleStripe = ranks.find((r) => r.name === "Tiger Cub Purple Stripe")!;
    const blackStripe = ranks.find((r) => r.name === "Tiger Cub Black Stripe")!;
    const whiteBeltRegular = ranks.find((r) => r.track === "regular" && r.sortOrder === 0)!;
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-12-31", "2025-06-01");

    const id = await createStudent(makeInput({ firstName: "Early", lastName: "Grad", track: "tiger", beltRankId: purpleStripe.id }));
    await registerToTest(cycle.id, id);
    await setRegistrationTarget(cycle.id, id, blackStripe.id);

    const reg = (await getCycleRegistrations(cycle.id)).find((r) => r.id === id)!;
    expect(reg.targetRankId).toBe(blackStripe.id);
    expect(reg.testingFor).toBe("Tiger Cub Black Stripe");

    // Consumers that independently look up "next rank" must also honor the override.
    const certRows = await buildCertificateRows(cycle.id);
    expect(certRows.some((r) => r.name === "Early Grad")).toBe(true);

    await promoteCycle(cycle.id);

    const history = await listRankHistory(id);
    expect(history).toHaveLength(2);
    const graduationRow = history.find((h) => h.h.note === "Graduated from Tiger Cubs")!;
    expect(graduationRow).toBeDefined();
    expect(graduationRow.to.id).toBe(whiteBeltRegular.id);
    const stripeHopRow = history.find((h) => h.h.fromRankId === purpleStripe.id)!;
    expect(stripeHopRow).toBeDefined();
    expect(stripeHopRow.to.id).toBe(blackStripe.id); // straight to Black Stripe, no intermediate stripes logged

    const student = (await listStudents()).find((s) => s.id === id)!;
    expect(student.track).toBe("regular");
    expect(student.beltRankId).toBe(whiteBeltRegular.id);

    await setStudentActive(id, false);
  });

  it("lets a Jr./Adult student skip ahead multiple belts in one promotion, and the belt-order breakdown reflects the skip target", async () => {
    const ranks = await listBeltRanks();
    const green = ranks.find((r) => r.name === "Green Belt")!;
    const purple = ranks.find((r) => r.name === "Purple Belt")!;
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-12-31", "2025-06-01");

    const id = await createStudent(makeInput({ firstName: "Skip", lastName: "Ahead", beltRankId: green.id, beltSize: "4" }));
    await registerToTest(cycle.id, id);
    await setRegistrationTarget(cycle.id, id, purple.id); // skips Sr. Green, Blue, Sr. Blue

    const breakdown = await getBeltOrderBreakdown(cycle.id);
    expect(breakdown.some((b) => b.belt === "Purple Belt" && b.size === "4")).toBe(true);

    await promoteCycle(cycle.id);

    const history = await listRankHistory(id);
    expect(history).toHaveLength(1); // one row, not a chain through the skipped belts
    expect(history[0].h.fromRankId).toBe(green.id);
    expect(history[0].to.id).toBe(purple.id);

    const student = (await listStudents()).find((s) => s.id === id)!;
    expect(student.beltRankId).toBe(purple.id);

    await setStudentActive(id, false);
  });

  it("refuses to promote across tracks — an invalid cross-track target is skipped, not silently applied", async () => {
    const ranks = await listBeltRanks();
    const green = ranks.find((r) => r.name === "Green Belt")!;
    const tigerRedStripe = ranks.find((r) => r.name === "Tiger Cub Red Stripe")!;
    const cycle = await getCurrentCycle();

    const id = await createStudent(makeInput({ firstName: "Bad", lastName: "Target", beltRankId: green.id }));
    await registerToTest(cycle.id, id);
    await setRegistrationTarget(cycle.id, id, tigerRedStripe.id); // invalid: different track

    const results = await promoteCycle(cycle.id);
    const result = results.find((r) => r.studentId === id)!;
    expect(result.skipped).toBe("target rank is a different track");

    const student = (await listStudents()).find((s) => s.id === id)!;
    expect(student.beltRankId).toBe(green.id); // untouched
    expect(await listRankHistory(id)).toHaveLength(0);

    await setStudentActive(id, false);
  });

  it("clearing the override (null) reverts to the automatic next rank", async () => {
    const ranks = await listBeltRanks();
    const yellow = ranks.find((r) => r.name === "Yellow Belt")!;
    const purple = ranks.find((r) => r.name === "Purple Belt")!;
    const cycle = await getCurrentCycle();

    const id = await createStudent(makeInput({ firstName: "Cleared", lastName: "Override", beltRankId: yellow.id }));
    await registerToTest(cycle.id, id);
    await setRegistrationTarget(cycle.id, id, purple.id);
    expect((await getCycleRegistrations(cycle.id)).find((r) => r.id === id)!.testingFor).toBe("Purple Belt");

    await setRegistrationTarget(cycle.id, id, null);
    expect((await getCycleRegistrations(cycle.id)).find((r) => r.id === id)!.testingFor).toBe("Green Belt");

    await unregisterFromTest(cycle.id, id);
    await setStudentActive(id, false);
  });
});

describe("editing rank history", () => {
  it("corrects date/rank/note on the most recent promotion and syncs the student's current belt", async () => {
    const ranks = await listBeltRanks();
    const green = ranks.find((r) => r.name === "Green Belt")!;
    const blue = ranks.find((r) => r.name === "Blue Belt")!;

    const id = await createStudent(makeInput({ firstName: "Fix", lastName: "Meup", beltRankId: green.id }));
    const result = await promoteStudent(id, { date: "2026-07-23" }); // wrong date, promotes to next (Sr. Green)
    const [row] = await listRankHistory(id);

    await updateRankHistory(row.h.id, { promotionDate: "2026-07-18", toRankId: blue.id, note: "Corrected after the fact" });

    const after = await listRankHistory(id);
    expect(after).toHaveLength(1);
    expect(after[0].h.promotionDate).toBe("2026-07-18");
    expect(after[0].to.id).toBe(blue.id);
    expect(after[0].h.note).toBe("Corrected after the fact");

    // It was their only (= most recent) promotion, so current belt follows the edit.
    const student = (await listStudents()).find((s) => s.id === id)!;
    expect(student.beltRankId).toBe(blue.id);
    expect(result.skipped).toBeUndefined();

    await setStudentActive(id, false);
  });

  it("does not touch the student's current belt when editing an older (non-latest) promotion", async () => {
    const ranks = await listBeltRanks();
    const green = ranks.find((r) => r.name === "Green Belt")!;

    const id = await createStudent(makeInput({ firstName: "Old", lastName: "Entry", beltRankId: green.id }));
    await promoteStudent(id, { date: "2026-01-01" }); // -> Sr. Green
    await promoteStudent(id, { date: "2026-02-01" }); // -> Blue (the latest)
    const history = await listRankHistory(id);
    const olderRow = history.find((h) => h.h.promotionDate === "2026-01-01")!;

    await updateRankHistory(olderRow.h.id, { promotionDate: "2025-12-15", toRankId: olderRow.h.toRankId, note: "just a date fix" });

    const student = (await listStudents()).find((s) => s.id === id)!;
    const latestRow = (await listRankHistory(id)).find((h) => h.h.promotionDate === "2026-02-01")!;
    expect(student.beltRankId).toBe(latestRow.h.toRankId); // unaffected — the edited row wasn't the latest

    await setStudentActive(id, false);
  });

  it("refuses to edit a rank into a different track", async () => {
    const ranks = await listBeltRanks();
    const green = ranks.find((r) => r.name === "Green Belt")!;
    const tigerRedStripe = ranks.find((r) => r.name === "Tiger Cub Red Stripe")!;

    const id = await createStudent(makeInput({ firstName: "Track", lastName: "Guard", beltRankId: green.id }));
    await promoteStudent(id);
    const [row] = await listRankHistory(id);

    await expect(updateRankHistory(row.h.id, { promotionDate: row.h.promotionDate, toRankId: tigerRedStripe.id, note: null }))
      .rejects.toThrow();

    await setStudentActive(id, false);
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

  it("counts current-cycle classes separately from since-last-promotion and lifetime total", async () => {
    const rank = await lowestRegularColorRank();
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-06-01", "2025-08-01", "2025-07-15");

    const id = await createStudent(makeInput({ firstName: "Cyc", lastName: "LeCount", beltRankId: rank.id }));
    const before = await getOrCreateSession("2025-01-01", "adult"); // before the cycle window
    await setAttendance(before, id, "present");
    const inCycle = await getOrCreateSession("2025-06-15", "adult"); // inside start..testingDate
    await setAttendance(inCycle, id, "present");
    const afterTesting = await getOrCreateSession("2025-07-20", "adult"); // after testingDate -> not this cycle
    await setAttendance(afterTesting, id, "present");

    const a = await getStudentAttendance(id);
    expect(a.thisCycle).toBe(1); // only the 6/15 class
    expect(a.total).toBe(3); // all three, regardless of cycle window
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

describe("inventory", () => {
  it("seeds the six sections with their items", async () => {
    const inv = await listInventory();
    expect(inv.map((s) => s.section.name)).toEqual([
      "Sparring Gear", "Uniforms", "Shirts", "Boards", "Cub Belts", "Belts",
    ]);
    const belts = inv.find((s) => s.section.name === "Belts")!;
    expect(belts.items.length).toBe(98); // 13 colors x sizes 1-7, plus plain Black x sizes 1-7
    const sparring = inv.find((s) => s.section.name === "Sparring Gear")!;
    expect(sparring.items.some((i) => i.name === "Helmet" && i.size === "S")).toBe(true);
    expect(sparring.items.some((i) => i.name === "Cases" && i.size === null)).toBe(true);
  });

  it("updates counts (and bumps the section timestamp), adds, and removes items", async () => {
    const inv = await listInventory();
    const boards = inv.find((s) => s.section.name === "Boards")!;
    const item = boards.items[0];

    await updateInventoryItem(item.id, { inStock: 5, toOrder: 2 });
    let after = (await listInventory()).find((s) => s.section.name === "Boards")!;
    const updated = after.items.find((i) => i.id === item.id)!;
    expect(updated.inStock).toBe(5);
    expect(updated.toOrder).toBe(2);
    expect(after.section.updatedAt >= boards.section.updatedAt).toBe(true);

    const newId = await addInventoryItem(boards.section.id, "Brick", null);
    after = (await listInventory()).find((s) => s.section.name === "Boards")!;
    expect(after.items.some((i) => i.id === newId && i.name === "Brick")).toBe(true);

    await deleteInventoryItem(newId);
    after = (await listInventory()).find((s) => s.section.name === "Boards")!;
    expect(after.items.some((i) => i.id === newId)).toBe(false);
  });

  it("adds a multi-size item as one row per size", async () => {
    const belts = (await listInventory()).find((s) => s.section.name === "Belts")!;
    const ids = await addInventoryItems(belts.section.id, "Camo", ["1", "2", "3", "4", "5", "6", "7"]);
    expect(ids.length).toBe(7);
    const after = (await listInventory()).find((s) => s.section.name === "Belts")!;
    const camo = after.items.filter((i) => i.name === "Camo");
    expect(camo.map((i) => i.size)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("adds a single null-size row when no sizes are given", async () => {
    const boards = (await listInventory()).find((s) => s.section.name === "Boards")!;
    const ids = await addInventoryItems(boards.section.id, "Cinderblock", []);
    expect(ids.length).toBe(1);
    const after = (await listInventory()).find((s) => s.section.name === "Boards")!;
    expect(after.items.some((i) => i.name === "Cinderblock" && i.size === null)).toBe(true);
  });
});

describe("attendance class eligibility", () => {
  it("adult class includes any active student aged 12+ (by DOB), not younger ones", async () => {
    const rank = await lowestRegularColorRank();
    const teen = await createStudent(makeInput({ firstName: "Teen", lastName: "Ager", beltRankId: rank.id, ageGroup: "jr", dateOfBirth: "2010-01-01" }));
    const kid = await createStudent(makeInput({ firstName: "Lil", lastName: "Kid", beltRankId: rank.id, ageGroup: "jr", dateOfBirth: "2020-01-01" }));
    const adultClass = await studentsForClass("adult");
    expect(adultClass.some((s) => s.id === teen)).toBe(true);
    expect(adultClass.some((s) => s.id === kid)).toBe(false);
  });

  it("Jr. White & Yellow class includes Red Stripes (any age) and Tiger Cubs aged 6+, not younger ones", async () => {
    const ranks = await listBeltRanks();
    const redStripe = ranks.find((r) => r.name === "Tiger Cub Red Stripe")!;
    const tigerWhite = ranks.find((r) => r.track === "tiger" && r.sortOrder === 0)!;
    // Red Stripe who is still very young — included regardless of age.
    const rs = await createStudent(makeInput({ firstName: "Red", lastName: "Stripe", track: "tiger", beltRankId: redStripe.id, dateOfBirth: "2022-01-01" }));
    // Plain tiger cub aged 6+ — now included.
    const big = await createStudent(makeInput({ firstName: "Big", lastName: "Cub", track: "tiger", beltRankId: tigerWhite.id, dateOfBirth: "2019-01-01" }));
    // Plain tiger cub under 6 — excluded.
    const lil = await createStudent(makeInput({ firstName: "Lil", lastName: "Cub", track: "tiger", beltRankId: tigerWhite.id, dateOfBirth: "2022-01-01" }));
    const jrwy = await studentsForClass("jr-wy");
    expect(jrwy.some((s) => s.id === rs)).toBe(true);
    expect(jrwy.some((s) => s.id === big)).toBe(true);
    expect(jrwy.some((s) => s.id === lil)).toBe(false);
  });

  it("Private Lessons roster is the whole active student body (any track), inactive excluded", async () => {
    const ranks = await listBeltRanks();
    const tigerWhite = ranks.find((r) => r.track === "tiger" && r.sortOrder === 0)!;
    const jrWhite = ranks.find((r) => r.track === "regular" && r.sortOrder === 0)!;
    const t = await createStudent(makeInput({ firstName: "Priv", lastName: "Tiger", track: "tiger", beltRankId: tigerWhite.id }));
    const r = await createStudent(makeInput({ firstName: "Priv", lastName: "Regular", track: "regular", ageGroup: "jr", beltRankId: jrWhite.id }));
    const gone = await createStudent(makeInput({ firstName: "Priv", lastName: "Gone", beltRankId: jrWhite.id }));
    await setStudentActive(gone, false);

    const roster = await studentsForClass("private");
    expect(roster.some((s) => s.id === t)).toBe(true);
    expect(roster.some((s) => s.id === r)).toBe(true);
    expect(roster.some((s) => s.id === gone)).toBe(false);
    // Tiger Cubs sort before regular belts.
    expect(roster.findIndex((s) => s.id === t)).toBeLessThan(roster.findIndex((s) => s.id === r));
  });

  it("Jr. White & Yellow lists Tiger Cubs before regular White/Yellow belts", async () => {
    const ranks = await listBeltRanks();
    const redStripe = ranks.find((r) => r.name === "Tiger Cub Red Stripe")!;
    const jrWhite = ranks.find((r) => r.track === "regular" && r.sortOrder === 0)!;
    // Names chosen so a plain last-name sort would put the White belt first.
    const tigerId = await createStudent(makeInput({ firstName: "A", lastName: "Zzz", track: "tiger", beltRankId: redStripe.id }));
    const whiteId = await createStudent(makeInput({ firstName: "B", lastName: "Aaa", track: "regular", ageGroup: "jr", beltRankId: jrWhite.id }));
    const roster = await studentsForClass("jr-wy");
    const ti = roster.findIndex((s) => s.id === tigerId);
    const wi = roster.findIndex((s) => s.id === whiteId);
    expect(ti).toBeGreaterThanOrEqual(0);
    expect(wi).toBeGreaterThanOrEqual(0);
    expect(ti).toBeLessThan(wi); // Tiger Cub precedes the White belt
  });
});

describe("testing progress (stripes + PTT)", () => {
  it("listStudentsWithProgress reflects stripe and PTT updates", async () => {
    const rank = await lowestRegularColorRank();
    const id = await createStudent(makeInput({ firstName: "Pro", lastName: "Gress", beltRankId: rank.id }));

    let row = (await listStudentsWithProgress()).find((s) => s.id === id)!;
    // Fresh progress row starts all-false.
    expect(row.blueStripe).toBe(false);
    expect(row.greenStripe).toBe(false);
    expect(row.permissionToTest).toBe(false);

    await updateProgress(id, { blueStripe: true, greenStripe: true, permissionToTest: true });
    row = (await listStudentsWithProgress()).find((s) => s.id === id)!;
    expect(row.blueStripe).toBe(true);
    expect(row.greenStripe).toBe(true);
    expect(row.orangeStripe).toBe(false);
    expect(row.permissionToTest).toBe(true);
  });
});

describe("upcoming agenda (events + testings, next 4 weeks)", () => {
  const shift = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  it("includes events within 4 weeks and excludes those beyond, soonest first", async () => {
    await createEvent({ name: "Near Seminar", eventDate: shift(8), eventTime: null, eventType: "Seminar", location: null, notes: null, classCredit: 1 });
    await createEvent({ name: "Far Camp", eventDate: shift(45), eventTime: null, eventType: "Camp", location: null, notes: null, classCredit: 1 });
    await createEvent({ name: "Past Demo", eventDate: shift(-3), eventTime: null, eventType: "Demo", location: null, notes: null, classCredit: 1 });

    const agenda = await getUpcomingAgenda(28);
    const names = agenda.map((i) => i.name);
    expect(names).toContain("Near Seminar");
    expect(names).not.toContain("Far Camp");
    expect(names).not.toContain("Past Demo");
    // Sorted ascending by date.
    const dates = agenda.map((i) => i.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("event roster export", () => {
  it("exports name, age, track, and belt as CSV", async () => {
    const rank = await lowestRegularColorRank();
    const id = await createStudent(makeInput({ firstName: "Seminar", lastName: "Goer", beltRankId: rank.id }));
    const eventId = await createEvent({
      name: "Spring Seminar", eventDate: "2025-03-01", eventTime: null,
      eventType: "Seminar", location: null, notes: null, classCredit: 1,
    });
    await addToRoster(eventId, id);

    const csv = await buildEventRosterCsv(eventId);
    const [header, ...rows] = csv.split("\r\n");
    expect(header).toBe(["Name", "Age", "Track", "Belt", "Phone", "Email"].join(","));
    const line = rows.find((l) => l.startsWith("Seminar Goer,"))!;
    expect(line).toContain(rank.name);
    expect(line).toContain("Jr./Adult");
  });

  it("orders exports Tiger Cubs, then Juniors, then Adults", async () => {
    const ranks = await listBeltRanks();
    const tigerWhite = ranks.find((r) => r.track === "tiger" && r.sortOrder === 0)!;
    const jrWhite = ranks.find((r) => r.track === "regular" && r.sortOrder === 0)!;
    const tiger = await createStudent(makeInput({ firstName: "Aaa", lastName: "Tigerkid", track: "tiger", beltRankId: tigerWhite.id }));
    const jr = await createStudent(makeInput({ firstName: "Bbb", lastName: "Juniorkid", track: "regular", ageGroup: "jr", beltRankId: jrWhite.id }));
    const adult = await createStudent(makeInput({ firstName: "Ccc", lastName: "Adultone", track: "regular", ageGroup: "adult", beltRankId: jrWhite.id }));
    const eventId = await createEvent({ name: "Order Test", eventDate: "2025-04-01", eventTime: null, eventType: "Demo", location: null, notes: null, classCredit: 1 });
    for (const id of [adult, jr, tiger]) await addToRoster(eventId, id); // added out of group order

    const order = (await buildEventRosterCsv(eventId)).split("\r\n").slice(1).map((r) => r.split(",")[0]);
    expect(order.indexOf("Aaa Tigerkid")).toBeLessThan(order.indexOf("Bbb Juniorkid"));
    expect(order.indexOf("Bbb Juniorkid")).toBeLessThan(order.indexOf("Ccc Adultone"));
  });
});

describe("event class credit", () => {
  it("posted event credit counts toward cycle attendance, student totals, and since-last-promotion; unposting reverses it", async () => {
    const rank = await lowestRegularColorRank();
    const id = await createStudent(makeInput({ firstName: "Credit", lastName: "Winner", beltRankId: rank.id }));
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, "2025-01-01", "2025-12-31", null);

    const eventId = await createEvent({
      name: "Summer Camp", eventDate: "2025-06-01", eventTime: null,
      eventType: "Camp", location: null, notes: null, classCredit: 2,
    });
    await addToRoster(eventId, id);

    // Not posted yet: no credit anywhere, and it's still in the upcoming list.
    expect((await listEvents()).some((e) => e.id === eventId)).toBe(true);
    expect((await listPostedEvents()).some((e) => e.id === eventId)).toBe(false);
    expect((await getCycleCandidates(cycle.id)).find((c) => c.id === id)!.attendanceThisCycle).toBe(0);
    expect((await getStudentAttendance(id)).total).toBe(0);

    await postEvent(eventId);

    expect((await listEvents()).some((e) => e.id === eventId)).toBe(false);
    expect((await listPostedEvents()).some((e) => e.id === eventId)).toBe(true);
    expect((await getCycleCandidates(cycle.id)).find((c) => c.id === id)!.attendanceThisCycle).toBe(2);

    const att = await getStudentAttendance(id);
    expect(att.total).toBe(2);
    expect(att.sinceLastPromotion).toBe(2);
    expect(att.recent[0]).toEqual({ date: "2025-06-01", label: "Summer Camp (+2 classes)" });

    await unpostEvent(eventId);
    expect((await listEvents()).some((e) => e.id === eventId)).toBe(true);
    expect((await getCycleCandidates(cycle.id)).find((c) => c.id === id)!.attendanceThisCycle).toBe(0);
    expect((await getStudentAttendance(id)).total).toBe(0);
  });
});

describe("early/late testers", () => {
  it("tracks a custom test date separately from the main cycle roster, labels timing, counts attendance through their date, and surfaces in alerts until checked off", async () => {
    const rank = await lowestRegularColorRank();
    const id = await createStudent(makeInput({ firstName: "Early", lastName: "Bird", beltRankId: rank.id }));
    const cycle = await getCurrentCycle(); // dates set to 2025-01-01..2025-12-31, testingDate null by earlier tests

    const s1 = await getOrCreateSession("2025-02-01", "adult");
    await setAttendance(s1, id, "present");
    const s2 = await getOrCreateSession("2025-04-01", "adult"); // after the early test date — must not count
    await setAttendance(s2, id, "present");

    await addSpecialTester(id, "2025-03-01"); // before cycle end (2025-12-31) => Early

    let rows = await listSpecialTesters();
    let row = rows.find((r) => r.id === id)!;
    expect(row.timing).toBe("Early");
    expect(row.tested).toBe(false);
    expect(row.attendance).toBe(1); // only the Feb session, not the April one

    // Doesn't leak into the main cycle roster/candidate attendance.
    expect((await getCycleCandidates(cycle.id)).find((c) => c.id === id)!.attendanceThisCycle).toBe(2);

    let alerts = await getDashboardAlerts();
    expect(alerts.specialTestsUpcoming.some((a) => a.id === row.specialTesterId)).toBe(true);

    // Re-adding the same student updates the date instead of duplicating.
    await addSpecialTester(id, "2026-01-15"); // after cycle end (2025-12-31) => Late
    rows = await listSpecialTesters();
    expect(rows.filter((r) => r.id === id).length).toBe(1);
    row = rows.find((r) => r.id === id)!;
    expect(row.timing).toBe("Late");

    await setSpecialTesterTested(row.specialTesterId, true);
    row = (await listSpecialTesters()).find((r) => r.id === id)!;
    expect(row.tested).toBe(true);
    alerts = await getDashboardAlerts();
    expect(alerts.specialTestsUpcoming.some((a) => a.id === row.specialTesterId)).toBe(false); // checked off, no longer an alert

    await removeSpecialTester(row.specialTesterId);
    expect((await listSpecialTesters()).some((r) => r.id === id)).toBe(false);
  });

  it("orders by test date first, then rank, then age (youngest to oldest)", async () => {
    const ranks = await listBeltRanks();
    const white = ranks.find((r) => r.track === "regular" && r.name === "White Belt")!;
    const yellow = ranks.find((r) => r.track === "regular" && r.name === "Yellow Belt")!;

    // Earliest date but a higher rank — date wins, so this sorts first overall.
    const earliest = await createStudent(makeInput({ firstName: "Ear", lastName: "Liest", beltRankId: yellow.id, dateOfBirth: "2010-01-01" }));
    // Same later date as the next two, but lower rank -> sorts before them.
    const lowerRank = await createStudent(makeInput({ firstName: "Low", lastName: "Rank", beltRankId: white.id, dateOfBirth: "2010-01-01" }));
    // Same later date, same (higher) rank as `older`, but younger -> sorts before `older`.
    const younger = await createStudent(makeInput({ firstName: "You", lastName: "Nger", beltRankId: yellow.id, dateOfBirth: "2018-01-01" }));
    const older = await createStudent(makeInput({ firstName: "Old", lastName: "Er", beltRankId: yellow.id, dateOfBirth: "2005-01-01" }));

    await addSpecialTester(earliest, "2025-01-01");
    await addSpecialTester(lowerRank, "2025-06-01");
    await addSpecialTester(younger, "2025-06-01");
    await addSpecialTester(older, "2025-06-01");

    const rows = await listSpecialTesters();
    const indexOf = (id: number) => rows.findIndex((r) => r.id === id);
    expect(indexOf(earliest)).toBeLessThan(indexOf(lowerRank)); // earliest date first
    expect(indexOf(lowerRank)).toBeLessThan(indexOf(younger)); // same date -> lower rank first
    expect(indexOf(younger)).toBeLessThan(indexOf(older)); // same date+rank -> younger first

    for (const id of [earliest, lowerRank, younger, older]) {
      const specialId = (await listSpecialTesters()).find((r) => r.id === id)!.specialTesterId;
      await removeSpecialTester(specialId);
    }
  });

  it("clears the whole early/late testers list at once", async () => {
    const rank = await lowestRegularColorRank();
    const a = await createStudent(makeInput({ firstName: "Cle", lastName: "Ara", beltRankId: rank.id }));
    const b = await createStudent(makeInput({ firstName: "Cle", lastName: "Bea", beltRankId: rank.id }));
    await addSpecialTester(a, "2025-05-01");
    await addSpecialTester(b, "2025-05-02");
    expect(await listSpecialTesters()).toHaveLength(2);

    await clearSpecialTesters();
    expect(await listSpecialTesters()).toHaveLength(0);
  });
});

describe("permanent student delete", () => {
  it("erases the student and every related record (attendance, promotions, rosters, registrations)", async () => {
    const rank = await lowestRegularColorRank();
    const id = await createStudent(makeInput({ firstName: "Dupe", lastName: "Student", beltRankId: rank.id }));

    const session = await getOrCreateSession("2025-07-01", "adult");
    await setAttendance(session, id, "present");
    await promoteStudent(id, {}); // one rank_history row
    const eventId = await createEvent({ name: "Delete Test Event", eventDate: "2025-07-05", eventTime: null, eventType: "Demo", location: null, notes: null, classCredit: 1 });
    await addToRoster(eventId, id);
    const cycle = await getCurrentCycle();
    await registerToTest(cycle.id, id);
    await addSpecialTester(id, "2025-08-01");

    const impact = await getStudentDeleteImpact(id);
    expect(impact.attendanceRecords).toBe(1);
    expect(impact.rankHistory).toBe(1);
    expect(impact.eventRegistrations).toBe(1);
    expect(impact.testingRegistrations).toBe(1);
    expect(impact.specialTesterEntries).toBe(1);

    await deleteStudentPermanently(id);

    expect((await listStudents()).some((s) => s.id === id)).toBe(false);
    expect((await getCycleCandidates(cycle.id)).some((s) => s.id === id)).toBe(false);
    expect((await listSpecialTesters()).some((s) => s.id === id)).toBe(false);
    // No leftover rows to violate uniqueness if a same-named student is added later.
    const id2 = await createStudent(makeInput({ firstName: "Dupe", lastName: "Student", beltRankId: rank.id }));
    expect((await getStudentDeleteImpact(id2)).attendanceRecords).toBe(0);
  });
});

// Registers students to the active cycle, so keep this last (registrations persist).
describe("certificate data rows", () => {
  it("maps each registered student to full name + cert-formatted NEW rank", async () => {
    const ranks = await listBeltRanks();
    const green = ranks.find((r) => r.name === "Green Belt")!;
    const black1 = ranks.find((r) => r.name === "1st Degree Black L1")!;
    const greenId = await createStudent(makeInput({ firstName: "Cert", lastName: "Greene", beltRankId: green.id }));
    const blackId = await createStudent(makeInput({ firstName: "Cert", lastName: "Blackman", ageGroup: "adult", beltRankId: black1.id }));

    const cycle = await getCurrentCycle();
    await registerToTest(cycle.id, greenId);
    await registerToTest(cycle.id, blackId);

    const rows = await buildCertificateRows(cycle.id);
    expect(rows.find((r) => r.name === "Cert Greene")?.rank).toBe("Senior Green Belt"); // Green → Sr. Green, spelled out
    expect(rows.find((r) => r.name === "Cert Blackman")?.rank).toBe("1st Degree Black Level 2"); // L1 → L2, cert wording
  });
});
