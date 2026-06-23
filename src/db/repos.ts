import { and, asc, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb } from "./client";
import {
  attendanceRecords,
  attendanceSessions,
  beltRanks,
  eventRoster,
  events,
  rankHistory,
  starterCourseEnrollment,
  starterCourses,
  studentProgress,
  students,
  testingCycles,
  testingRegistration,
} from "./schema";
import type { BeltRank, Student, TestingCycle } from "./schema";
import { ageFromDob, today } from "@/lib/format";

// ----------------------------------------------------------------------------
// Belt ranks
// ----------------------------------------------------------------------------

export async function listBeltRanks(): Promise<BeltRank[]> {
  const db = await getDb();
  return db
    .select()
    .from(beltRanks)
    .orderBy(asc(beltRanks.track), asc(beltRanks.sortOrder));
}

async function rankById(id: number): Promise<BeltRank | undefined> {
  const db = await getDb();
  const [r] = await db.select().from(beltRanks).where(eq(beltRanks.id, id));
  return r;
}

async function regularWhiteBelt(): Promise<BeltRank> {
  const db = await getDb();
  const [r] = await db
    .select()
    .from(beltRanks)
    .where(and(eq(beltRanks.track, "regular"), eq(beltRanks.sortOrder, 0)));
  return r;
}

// The sqlite-proxy client (client.ts) turns each result row into a positional
// tuple via Object.values(). If a join selects two columns with the SAME output
// name (e.g. students.id + belt_ranks.id, students.track + belt_ranks.track),
// they collapse into one object key and every later column shifts left — which
// silently corrupts belt fields (e.g. `degree` reads `color_hex`). To stay
// collision-free, belt-rank columns are always projected under unique aliases
// here and reassembled by toRank(). Do the same for any future joins.
// IMPORTANT: these MUST be `sql\`…\`.as("rk_*")`, not bare `beltRanks.col`.
// The sqlite-proxy maps results positionally and Drizzle emits NO column aliases
// for a plain `{ rkId: beltRanks.id }` projection — so the SQL still contains
// duplicate output names (students.id + belt_ranks.id) which tauri-plugin-sql
// collapses into one object key, shifting every later field. Forcing an explicit
// SQL alias via sql`…`.as() gives each belt column a unique output name.
const rankCols = {
  rkId: sql<number>`${beltRanks.id}`.as("rk_id"),
  rkTrack: sql<string>`${beltRanks.track}`.as("rk_track"),
  rkSortOrder: sql<number>`${beltRanks.sortOrder}`.as("rk_sort_order"),
  rkName: sql<string>`${beltRanks.name}`.as("rk_name"),
  rkClassGroup: sql<string | null>`${beltRanks.classGroup}`.as("rk_class_group"),
  rkDegree: sql<string | null>`${beltRanks.degree}`.as("rk_degree"),
  rkLevel: sql<string | null>`${beltRanks.level}`.as("rk_level"),
  rkColorHex: sql<string>`${beltRanks.colorHex}`.as("rk_color_hex"),
  rkTextHex: sql<string>`${beltRanks.textHex}`.as("rk_text_hex"),
  rkBorderHex: sql<string>`${beltRanks.borderHex}`.as("rk_border_hex"),
  rkIsGraduationRank: sql<boolean>`${beltRanks.isGraduationRank}`.as("rk_is_graduation_rank"),
  rkNextRankId: sql<number | null>`${beltRanks.nextRankId}`.as("rk_next_rank_id"),
} as const;

type RankColsRow = {
  rkId: number;
  rkTrack: string;
  rkSortOrder: number;
  rkName: string;
  rkClassGroup: string | null;
  rkDegree: string | null;
  rkLevel: string | null;
  rkColorHex: string;
  rkTextHex: string;
  rkBorderHex: string;
  rkIsGraduationRank: boolean;
  rkNextRankId: number | null;
};

function toRank(x: RankColsRow): BeltRank {
  return {
    id: x.rkId,
    track: x.rkTrack,
    sortOrder: x.rkSortOrder,
    name: x.rkName,
    classGroup: x.rkClassGroup,
    degree: x.rkDegree,
    level: x.rkLevel,
    colorHex: x.rkColorHex,
    textHex: x.rkTextHex,
    borderHex: x.rkBorderHex,
    isGraduationRank: Boolean(x.rkIsGraduationRank),
    nextRankId: x.rkNextRankId,
  };
}

// ----------------------------------------------------------------------------
// Students
// ----------------------------------------------------------------------------

export interface StudentRow extends Student {
  rank: BeltRank;
  permissionToTest: boolean;
}

export async function listStudents(): Promise<StudentRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ s: students, ...rankCols, ptt: studentProgress.permissionToTest })
    .from(students)
    .innerJoin(beltRanks, eq(students.beltRankId, beltRanks.id))
    .leftJoin(studentProgress, eq(studentProgress.studentId, students.id))
    .orderBy(asc(students.lastName), asc(students.firstName));
  return rows.map((x) => ({ ...x.s, rank: toRank(x), permissionToTest: Boolean(x.ptt) }));
}

export interface StudentInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  guardian1Name: string | null;
  guardian1Phone: string | null;
  guardian1Email: string | null;
  guardian2Name: string | null;
  guardian2Phone: string | null;
  guardian2Email: string | null;
  emergencyContact: string | null;
  track: string;
  ageGroup: string;
  beltRankId: number;
  beltSize: string | null;
  joinDate: string;
  notes: string | null;
}

export async function createStudent(input: StudentInput): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(students)
    .values(input)
    .returning({ id: students.id });
  // 1:1 progress row (spec invariant)
  await db.insert(studentProgress).values({ studentId: row.id });
  return row.id;
}

export async function updateStudent(
  id: number,
  input: StudentInput,
): Promise<void> {
  const db = await getDb();
  await db
    .update(students)
    .set({ ...input, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(students.id, id));
}

export async function setStudentActive(
  id: number,
  active: boolean,
): Promise<void> {
  const db = await getDb();
  await db
    .update(students)
    .set({ isActive: active, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(students.id, id));
}

/** One-time helper: flag regular-track students 18+ (by DOB) as adults. */
export async function autoFlagAdultsByDob(minAge = 18): Promise<number> {
  const db = await getDb();
  const all = await db
    .select()
    .from(students)
    .where(and(eq(students.track, "regular"), eq(students.ageGroup, "jr")));
  let n = 0;
  for (const s of all) {
    const age = ageFromDob(s.dateOfBirth);
    if (age != null && age >= minAge) {
      await db
        .update(students)
        .set({ ageGroup: "adult", updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(students.id, s.id));
      n++;
    }
  }
  return n;
}

// ----------------------------------------------------------------------------
// Progress (stripes + permission to test)
// ----------------------------------------------------------------------------

export async function getProgress(studentId: number) {
  const db = await getDb();
  const [p] = await db
    .select()
    .from(studentProgress)
    .where(eq(studentProgress.studentId, studentId));
  return p;
}

export async function updateProgress(
  studentId: number,
  patch: Partial<{
    greenStripe: boolean;
    blueStripe: boolean;
    orangeStripe: boolean;
    redStripe: boolean;
    permissionToTest: boolean;
  }>,
): Promise<void> {
  const db = await getDb();
  await db
    .update(studentProgress)
    .set({ ...patch, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(studentProgress.studentId, studentId));
}

async function resetProgress(studentId: number): Promise<void> {
  await updateProgress(studentId, {
    greenStripe: false,
    blueStripe: false,
    orangeStripe: false,
    redStripe: false,
    permissionToTest: false,
  });
}

// ----------------------------------------------------------------------------
// Promotion + graduation
// ----------------------------------------------------------------------------

export interface PromotionResult {
  studentId: number;
  name: string;
  previousBelt: string;
  newBelt: string;
  beltSize: string | null;
  graduated: boolean;
  skipped?: string;
}

export async function listRankHistory(studentId: number) {
  const db = await getDb();
  const rows = await db
    .select({ h: rankHistory, ...rankCols })
    .from(rankHistory)
    .innerJoin(beltRanks, eq(rankHistory.toRankId, beltRanks.id))
    .where(eq(rankHistory.studentId, studentId))
    .orderBy(desc(rankHistory.promotionDate));
  return rows.map((x) => ({ h: x.h, to: toRank(x) }));
}

/**
 * Promote a single student one step, handling the Tiger Cub graduation flow.
 * Returns a result describing what happened (or why it was skipped).
 */
export async function promoteStudent(
  studentId: number,
  opts: { date?: string; note?: string | null; eventId?: number | null } = {},
): Promise<PromotionResult> {
  const db = await getDb();
  const [s] = await db.select().from(students).where(eq(students.id, studentId));
  const current = await rankById(s.beltRankId);
  const name = `${s.firstName} ${s.lastName}`;
  const date = opts.date ?? today();
  const note = opts.note ?? null;
  const eventId = opts.eventId ?? null;

  if (!current) {
    return { studentId, name, previousBelt: "?", newBelt: "?", beltSize: s.beltSize, graduated: false, skipped: "no current rank" };
  }

  // Already at Tiger Cub Black Stripe -> graduate to regular White Belt.
  if (current.isGraduationRank) {
    return graduate(s, current, date, eventId, name);
  }

  if (current.nextRankId == null) {
    return { studentId, name, previousBelt: current.name, newBelt: current.name, beltSize: s.beltSize, graduated: false, skipped: "already at top rank" };
  }

  const next = await rankById(current.nextRankId);
  if (!next) {
    return { studentId, name, previousBelt: current.name, newBelt: current.name, beltSize: s.beltSize, graduated: false, skipped: "next rank missing" };
  }

  // Promoting INTO the graduation rank: record the black-stripe hop, then graduate.
  if (next.isGraduationRank) {
    await db.insert(rankHistory).values({
      studentId, fromRankId: current.id, toRankId: next.id,
      trackAtTime: "tiger", promotionDate: date, note, promotedAtEventId: eventId,
    });
    await db.update(students).set({ beltRankId: next.id, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(students.id, studentId));
    return graduate({ ...s, beltRankId: next.id }, next, date, eventId, name, current.name);
  }

  // Normal promotion.
  await db.insert(rankHistory).values({
    studentId, fromRankId: current.id, toRankId: next.id,
    trackAtTime: s.track, promotionDate: date, note, promotedAtEventId: eventId,
  });
  await db.update(students).set({ beltRankId: next.id, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(students.id, studentId));
  await resetProgress(studentId);
  return { studentId, name, previousBelt: current.name, newBelt: next.name, beltSize: s.beltSize, graduated: false };
}

async function graduate(
  s: Student,
  blackStripe: BeltRank,
  date: string,
  eventId: number | null,
  name: string,
  previousBeltOverride?: string,
): Promise<PromotionResult> {
  const db = await getDb();
  const white = await regularWhiteBelt();
  await db.insert(rankHistory).values({
    studentId: s.id, fromRankId: blackStripe.id, toRankId: white.id,
    trackAtTime: "regular", promotionDate: date,
    note: "Graduated from Tiger Cubs", promotedAtEventId: eventId,
  });
  await db
    .update(students)
    .set({ track: "regular", beltRankId: white.id, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(students.id, s.id));
  await resetProgress(s.id);
  return {
    studentId: s.id, name,
    previousBelt: previousBeltOverride ?? blackStripe.name,
    newBelt: white.name, beltSize: s.beltSize, graduated: true,
  };
}

// ----------------------------------------------------------------------------
// Events + roster + auto-promote
// ----------------------------------------------------------------------------

export interface EventInput {
  name: string;
  eventDate: string;
  eventTime: string | null;
  eventType: string;
  location: string | null;
  notes: string | null;
}

export async function listEvents() {
  const db = await getDb();
  return db.select().from(events).orderBy(desc(events.eventDate));
}

export async function createEvent(input: EventInput): Promise<number> {
  const db = await getDb();
  const [row] = await db.insert(events).values(input).returning({ id: events.id });
  return row.id;
}

export async function updateEvent(id: number, input: EventInput): Promise<void> {
  const db = await getDb();
  await db
    .update(events)
    .set({ ...input, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(events.id, id));
}

export async function setEventActive(id: number, active: boolean): Promise<void> {
  const db = await getDb();
  await db
    .update(events)
    .set({ isActive: active, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(events.id, id));
}

export async function getEventRoster(eventId: number): Promise<StudentRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ s: students, ...rankCols, ptt: studentProgress.permissionToTest })
    .from(eventRoster)
    .innerJoin(students, eq(eventRoster.studentId, students.id))
    .innerJoin(beltRanks, eq(students.beltRankId, beltRanks.id))
    .leftJoin(studentProgress, eq(studentProgress.studentId, students.id))
    .where(eq(eventRoster.eventId, eventId))
    .orderBy(asc(beltRanks.sortOrder), asc(students.lastName));
  return rows.map((x) => ({ ...x.s, rank: toRank(x), permissionToTest: Boolean(x.ptt) }));
}

export async function addToRoster(eventId: number, studentId: number): Promise<void> {
  const db = await getDb();
  await db.insert(eventRoster).values({ eventId, studentId });
}

export async function removeFromRoster(eventId: number, studentId: number): Promise<void> {
  const db = await getDb();
  await db
    .delete(eventRoster)
    .where(and(eq(eventRoster.eventId, eventId), eq(eventRoster.studentId, studentId)));
}

/** One CSV row (RFC 4180): quote fields containing comma, quote, or newline. */
function csvRow(fields: (string | number | null)[]): string {
  return fields
    .map((f) => {
      const s = f == null ? "" : String(f);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

/** CSV export of an event roster: name, age, track, belt, phone, email. */
export async function buildEventRosterCsv(eventId: number): Promise<string> {
  const roster = await getEventRoster(eventId);
  const lines = [csvRow(["Name", "Age", "Track", "Belt", "Phone", "Email"])];
  for (const s of roster) {
    const age = ageFromDob(s.dateOfBirth);
    lines.push(csvRow([
      `${s.firstName} ${s.lastName}`,
      age,
      s.track === "tiger" ? "Tiger Cubs" : "Jr./Adult",
      s.rank.name,
      s.phone ?? "",
      s.email ?? "",
    ]));
  }
  return lines.join("\r\n");
}

// ----------------------------------------------------------------------------
// Testing cycle (current testing period + registration list)
// ----------------------------------------------------------------------------

/** The single active testing cycle, creating a default one if none exists. */
export async function getCurrentCycle(): Promise<TestingCycle> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(testingCycles)
    .where(eq(testingCycles.isActive, true))
    .orderBy(desc(testingCycles.id))
    .limit(1);
  if (existing) return existing;
  const start = today();
  const [row] = await db
    .insert(testingCycles)
    .values({ startDate: start, endDate: start })
    .returning();
  return row;
}

export async function updateCycle(
  id: number,
  startDate: string,
  endDate: string,
  testingDate: string | null,
): Promise<void> {
  const db = await getDb();
  await db
    .update(testingCycles)
    .set({ startDate, endDate, testingDate, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(testingCycles.id, id));
}

/** Minimum classes a student must attend in a cycle to be eligible to test. */
export function minClassesToTest(rank: BeltRank): number {
  if (rank.track === "tiger") return 6;
  if (rank.classGroup === "jr-brb") return 12; // brown / red / black (+ seniors)
  return 10; // white, yellow, green, blue, purple (+ seniors)
}

export async function registerToTest(cycleId: number, studentId: number): Promise<void> {
  const db = await getDb();
  await db.insert(testingRegistration).values({ cycleId, studentId });
}

export async function unregisterFromTest(cycleId: number, studentId: number): Promise<void> {
  const db = await getDb();
  await db
    .delete(testingRegistration)
    .where(
      and(
        eq(testingRegistration.cycleId, cycleId),
        eq(testingRegistration.studentId, studentId),
      ),
    );
}

export interface TestingRow extends StudentRow {
  greenStripe: boolean;
  blueStripe: boolean;
  orangeStripe: boolean;
  redStripe: boolean;
  attendanceThisCycle: number;
  minClasses: number;
  meetsMinimum: boolean;
  testingFor: string | null;
}

/** Registered students for a cycle, with their stripes + cycle attendance count. */
export async function getCycleRegistrations(cycleId: number): Promise<TestingRow[]> {
  const db = await getDb();
  const cycle = await getCycleById(cycleId);
  const rows = await db
    .select({
      s: students,
      ...rankCols,
      green: studentProgress.greenStripe,
      blue: studentProgress.blueStripe,
      orange: studentProgress.orangeStripe,
      red: studentProgress.redStripe,
      ptt: studentProgress.permissionToTest,
    })
    .from(testingRegistration)
    .innerJoin(students, eq(testingRegistration.studentId, students.id))
    .innerJoin(beltRanks, eq(students.beltRankId, beltRanks.id))
    .leftJoin(studentProgress, eq(studentProgress.studentId, students.id))
    .where(eq(testingRegistration.cycleId, cycleId))
    .orderBy(asc(beltRanks.sortOrder), asc(students.lastName));

  const ids = rows.map((x) => x.s.id);
  const attendance = await presentCountsInRange(ids, cycle.startDate, cycle.testingDate ?? cycle.endDate);
  const ranks = await listBeltRanks();
  const rankById = new Map(ranks.map((r) => [r.id, r]));

  return rows.map((x) => {
    const rank = toRank(x);
    const next = rank.nextRankId ? rankById.get(rank.nextRankId) : null;
    const attended = attendance.get(x.s.id) ?? 0;
    const minClasses = minClassesToTest(rank);
    return {
      ...x.s,
      rank,
      permissionToTest: Boolean(x.ptt),
      greenStripe: Boolean(x.green),
      blueStripe: Boolean(x.blue),
      orangeStripe: Boolean(x.orange),
      redStripe: Boolean(x.red),
      attendanceThisCycle: attended,
      minClasses,
      meetsMinimum: attended >= minClasses,
      testingFor: next ? next.name : null,
    };
  });
}

async function getCycleById(id: number): Promise<TestingCycle> {
  const db = await getDb();
  const [c] = await db.select().from(testingCycles).where(eq(testingCycles.id, id));
  return c;
}

/** Present-class counts per student within [start, end], as a studentId -> count map. */
async function presentCountsInRange(
  studentIds: number[],
  start: string,
  end: string,
): Promise<Map<number, number>> {
  if (studentIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .select({
      studentId: attendanceRecords.studentId,
      n: sql<number>`count(*)`,
    })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceRecords.sessionId, attendanceSessions.id),
    )
    .where(
      and(
        inArray(attendanceRecords.studentId, studentIds),
        eq(attendanceRecords.status, "present"),
        gte(attendanceSessions.sessionDate, start),
        lte(attendanceSessions.sessionDate, end),
      ),
    )
    .groupBy(attendanceRecords.studentId);
  return new Map(rows.map((r) => [r.studentId, Number(r.n)]));
}

export interface CandidateRow extends StudentRow {
  attendanceThisCycle: number;
  minClasses: number;
  meetsMinimum: boolean;
  registered: boolean;
}

/** All active students with their attendance in this cycle + whether registered. */
export async function getCycleCandidates(cycleId: number): Promise<CandidateRow[]> {
  const db = await getDb();
  const cycle = await getCycleById(cycleId);
  const rows = await db
    .select({ s: students, ...rankCols, ptt: studentProgress.permissionToTest })
    .from(students)
    .innerJoin(beltRanks, eq(students.beltRankId, beltRanks.id))
    .leftJoin(studentProgress, eq(studentProgress.studentId, students.id))
    .where(eq(students.isActive, true))
    .orderBy(asc(students.lastName), asc(students.firstName));

  const ids = rows.map((x) => x.s.id);
  const attendance = await presentCountsInRange(ids, cycle.startDate, cycle.testingDate ?? cycle.endDate);

  const reg = await db
    .select({ studentId: testingRegistration.studentId })
    .from(testingRegistration)
    .where(eq(testingRegistration.cycleId, cycleId));
  const registered = new Set(reg.map((r) => r.studentId));

  return rows.map((x) => {
    const rank = toRank(x);
    const attended = attendance.get(x.s.id) ?? 0;
    const minClasses = minClassesToTest(rank);
    return {
      ...x.s,
      rank,
      permissionToTest: Boolean(x.ptt),
      attendanceThisCycle: attended,
      minClasses,
      meetsMinimum: attended >= minClasses,
      registered: registered.has(x.s.id),
    };
  });
}

/**
 * Promote every registered student one rank (lowest rank first), then clear the
 * registration list so the cycle is ready for the next round and no one is
 * promoted twice. Reuses promoteStudent (logs rank_history, handles graduation).
 */
export async function promoteCycle(cycleId: number): Promise<PromotionResult[]> {
  const roster = await getCycleRegistrations(cycleId); // sorted by sort_order asc
  const results: PromotionResult[] = [];
  for (const s of roster) {
    results.push(await promoteStudent(s.id, { eventId: null }));
  }
  const db = await getDb();
  await db
    .delete(testingRegistration)
    .where(eq(testingRegistration.cycleId, cycleId));
  return results;
}

/** CSV export of the testing list: name, age, belt, testing-for, size, classes. */
export async function buildTestingCycleCsv(cycleId: number): Promise<string> {
  const roster = await getCycleRegistrations(cycleId);
  const lines = [csvRow(["Name", "Age", "Current Belt", "Testing For", "Belt Size", "Classes", "Min", "Eligible"])];
  for (const s of roster) {
    const age = ageFromDob(s.dateOfBirth);
    lines.push(csvRow([
      `${s.firstName} ${s.lastName}`,
      age,
      s.rank.name,
      s.testingFor ?? "(top rank)",
      s.beltSize ?? "",
      s.attendanceThisCycle,
      s.minClasses,
      s.meetsMinimum ? "Yes" : "No",
    ]));
  }
  return lines.join("\r\n");
}

// ----------------------------------------------------------------------------
// Attendance
// ----------------------------------------------------------------------------

export type ClassType = "tiger" | "jr-wy" | "jr-gbp" | "jr-brb" | "adult";

export async function getOrCreateSession(
  date: string,
  classType: ClassType,
): Promise<number> {
  const db = await getDb();
  const existing = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.sessionDate, date),
        eq(attendanceSessions.classType, classType),
      ),
    );
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(attendanceSessions)
    .values({ sessionDate: date, classType })
    .returning({ id: attendanceSessions.id });
  return row.id;
}

/** Active students eligible for a given class type, per the spec's filtering. */
export async function studentsForClass(classType: ClassType): Promise<StudentRow[]> {
  const db = await getDb();
  const conds = [eq(students.isActive, true)];
  if (classType === "tiger") {
    conds.push(eq(students.track, "tiger"));
  } else if (classType === "adult") {
    conds.push(eq(students.track, "regular"), eq(students.ageGroup, "adult"));
  } else {
    conds.push(
      eq(students.track, "regular"),
      eq(students.ageGroup, "jr"),
      eq(beltRanks.classGroup, classType),
    );
  }
  const rows = await db
    .select({ s: students, ...rankCols, ptt: studentProgress.permissionToTest })
    .from(students)
    .innerJoin(beltRanks, eq(students.beltRankId, beltRanks.id))
    .leftJoin(studentProgress, eq(studentProgress.studentId, students.id))
    .where(and(...conds))
    .orderBy(asc(beltRanks.sortOrder), asc(students.lastName));
  return rows.map((x) => ({ ...x.s, rank: toRank(x), permissionToTest: Boolean(x.ptt) }));
}

export async function getSessionStatuses(
  sessionId: number,
): Promise<Map<number, string>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(attendanceRecords)
    .where(eq(attendanceRecords.sessionId, sessionId));
  return new Map(rows.map((r) => [r.studentId, r.status]));
}

export async function setAttendance(
  sessionId: number,
  studentId: number,
  status: "present" | "absent" | "unmarked",
): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.sessionId, sessionId),
        eq(attendanceRecords.studentId, studentId),
      ),
    );
  if (existing[0]) {
    await db
      .update(attendanceRecords)
      .set({ status, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(attendanceRecords.id, existing[0].id));
  } else {
    await db.insert(attendanceRecords).values({ sessionId, studentId, status });
  }
}

export interface StudentAttendanceSummary {
  total: number;
  sinceLastPromotion: number;
  recent: { date: string; classType: string }[];
}

/** A student's present-class history (most recent first) + totals. */
export async function getStudentAttendance(studentId: number): Promise<StudentAttendanceSummary> {
  const db = await getDb();
  const rows = await db
    .select({ date: attendanceSessions.sessionDate, classType: attendanceSessions.classType })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(and(eq(attendanceRecords.studentId, studentId), eq(attendanceRecords.status, "present")))
    .orderBy(desc(attendanceSessions.sessionDate));
  const sinceLastPromotion = await classesSincePromotion(studentId);
  return { total: rows.length, sinceLastPromotion, recent: rows };
}

/** Count of present classes since the student's last promotion. */
export async function classesSincePromotion(studentId: number): Promise<number> {
  const db = await getDb();
  const [last] = await db
    .select({ d: sql<string>`max(${rankHistory.promotionDate})` })
    .from(rankHistory)
    .where(eq(rankHistory.studentId, studentId));
  const conds = [
    eq(attendanceRecords.studentId, studentId),
    eq(attendanceRecords.status, "present"),
  ];
  if (last?.d) conds.push(gt(attendanceSessions.sessionDate, last.d));
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceRecords.sessionId, attendanceSessions.id),
    )
    .where(and(...conds));
  return Number(row?.n ?? 0);
}

// ----------------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------------

export interface DashboardStats {
  activeTotal: number;
  tiger: number;
  regular: number;
  black: number;
  permissionToTest: number;
  upcomingEvents: number;
  activeCourses: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const all = await listStudents();
  const active = all.filter((s) => s.isActive);
  const t = today();
  const evs = await listEvents();
  const courses = await listStarterCourses();
  return {
    activeTotal: active.length,
    tiger: active.filter((s) => s.track === "tiger").length,
    regular: active.filter((s) => s.track === "regular").length,
    black: active.filter((s) => s.rank.degree != null).length,
    permissionToTest: active.filter((s) => s.permissionToTest).length,
    upcomingEvents: evs.filter((e) => e.isActive && e.eventDate >= t).length,
    activeCourses: courses.filter((c) => c.endDate >= t).length,
  };
}

// ----------------------------------------------------------------------------
// Starter courses
// ----------------------------------------------------------------------------

export interface StarterCourseInput {
  name: string;
  startDate: string;
  endDate: string;
  notes: string | null;
}

export async function listStarterCourses() {
  const db = await getDb();
  return db.select().from(starterCourses).orderBy(desc(starterCourses.endDate));
}

export async function createStarterCourse(input: StarterCourseInput): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(starterCourses)
    .values(input)
    .returning({ id: starterCourses.id });
  return row.id;
}

export async function setStarterCourseActive(id: number, active: boolean): Promise<void> {
  const db = await getDb();
  await db
    .update(starterCourses)
    .set({ isActive: active, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(starterCourses.id, id));
}

export async function getCourseEnrollment(courseId: number): Promise<StudentRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ s: students, ...rankCols, ptt: studentProgress.permissionToTest })
    .from(starterCourseEnrollment)
    .innerJoin(students, eq(starterCourseEnrollment.studentId, students.id))
    .innerJoin(beltRanks, eq(students.beltRankId, beltRanks.id))
    .leftJoin(studentProgress, eq(studentProgress.studentId, students.id))
    .where(eq(starterCourseEnrollment.courseId, courseId))
    .orderBy(asc(students.lastName));
  return rows.map((x) => ({ ...x.s, rank: toRank(x), permissionToTest: Boolean(x.ptt) }));
}

export async function enrollInCourse(courseId: number, studentId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(students)
    .set({ isStarterStudent: true, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(students.id, studentId));
  await db.insert(starterCourseEnrollment).values({ courseId, studentId });
}

export async function unenrollFromCourse(courseId: number, studentId: number): Promise<void> {
  const db = await getDb();
  await db
    .delete(starterCourseEnrollment)
    .where(
      and(
        eq(starterCourseEnrollment.courseId, courseId),
        eq(starterCourseEnrollment.studentId, studentId),
      ),
    );
}
