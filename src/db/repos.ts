import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";

import { getDb } from "./client";
import {
  attendanceRecords,
  attendanceSessions,
  beltRanks,
  classSlots,
  eventRoster,
  events,
  inventoryItems,
  inventorySections,
  noChangeHistory,
  rankHistory,
  specialTesters,
  starterCourseEnrollment,
  starterCourses,
  studentProgress,
  students,
  testingCycleHistory,
  testingCycles,
  testingRegistration,
  trialHistory,
} from "./schema";
import type { BeltRank, ClassSlot, InventoryItem, InventorySection, Student, TestingCycle, TestingCycleHistory } from "./schema";
import { ageFromDob, beltRankOrder, fullName, prettyDate, today } from "@/lib/format";
import { addDaysIso, addMonthsIso } from "@/lib/dates";
import {
  TREND_WEEKS,
  buildPyramid,
  computeDemographics,
  computeEnrollmentFlow,
  computeMembership,
  computeRetention,
  computeSlots,
  computeTimeInRank,
  computeTrends,
  schoolWeeks,
  summarizeTrends,
  summarizeTrials,
  type Demographics,
  type FlowMonth,
  type LifecycleStudent,
  type Membership,
  type Pyramid,
  type PyramidGroup,
  type RankInfo,
  type RankTime,
  type RetentionResult,
  type SlotRow,
  type StuckStudent,
  type TrendRow,
  type TrendSummary,
  type TrialSummary,
  type WeekTotal,
} from "@/lib/reports";
import { CLASS_TYPE_LABELS, CLASS_TYPES, EVENT_TYPES, type NcReason } from "./enums";

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

export interface ProgressRow extends StudentRow {
  greenStripe: boolean;
  blueStripe: boolean;
  orangeStripe: boolean;
  redStripe: boolean;
}

/** All students with their full progress (4 stripes + PTT) for the Testing Progress tab. */
export async function listStudentsWithProgress(): Promise<ProgressRow[]> {
  const db = await getDb();
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
    .from(students)
    .innerJoin(beltRanks, eq(students.beltRankId, beltRanks.id))
    .leftJoin(studentProgress, eq(studentProgress.studentId, students.id))
    .orderBy(asc(students.lastName), asc(students.firstName));
  return rows.map((x) => ({
    ...x.s,
    rank: toRank(x),
    permissionToTest: Boolean(x.ptt),
    greenStripe: Boolean(x.green),
    blueStripe: Boolean(x.blue),
    orangeStripe: Boolean(x.orange),
    redStripe: Boolean(x.red),
  }));
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
  trialStartDate: string | null;
  notes: string | null;
  /** Optional so callers that don't collect it leave the stored value alone. */
  gender?: string | null;
}

/**
 * Keep trial_history in step with students.trial_start_date. That column is
 * cleared when a trial ends, so this is what preserves the record: a start
 * opens a row, an end closes it, and a corrected start date rewrites the open row.
 */
async function syncTrialHistory(studentId: number, before: string | null, after: string | null): Promise<void> {
  if (before === after) return;
  const db = await getDb();
  const open = and(eq(trialHistory.studentId, studentId), isNull(trialHistory.endedDate));
  if (before != null && after != null) {
    await db.update(trialHistory).set({ startDate: after }).where(open);
  } else if (before != null) {
    await db.update(trialHistory).set({ endedDate: today() }).where(open);
  } else if (after != null) {
    await db.insert(trialHistory).values({ studentId, startDate: after });
  }
}

export async function createStudent(input: StudentInput): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .insert(students)
    .values({ ...input, isStarterStudent: input.trialStartDate != null })
    .returning({ id: students.id });
  // 1:1 progress row (spec invariant)
  await db.insert(studentProgress).values({ studentId: row.id });
  await syncTrialHistory(row.id, null, input.trialStartDate);
  return row.id;
}

export async function updateStudent(
  id: number,
  input: StudentInput,
): Promise<void> {
  const db = await getDb();
  const [current] = await db.select({ trial: students.trialStartDate }).from(students).where(eq(students.id, id));
  await db
    .update(students)
    .set({ ...input, isStarterStudent: input.trialStartDate != null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(students.id, id));
  await syncTrialHistory(id, current?.trial ?? null, input.trialStartDate);
}

/** Deactivating records today as the date they left (kept if already set); reactivating clears it. */
export async function setStudentActive(
  id: number,
  active: boolean,
): Promise<void> {
  const db = await getDb();
  await db
    .update(students)
    .set({
      isActive: active,
      leftDate: active ? null : sql`coalesce(${students.leftDate}, ${today()})`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(students.id, id));
}

export async function setStudentGender(id: number, gender: string | null): Promise<void> {
  const db = await getDb();
  await db.update(students).set({ gender, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(students.id, id));
}

export interface StudentDeleteImpact {
  attendanceRecords: number;
  rankHistory: number;
  eventRegistrations: number;
  testingRegistrations: number;
  specialTesterEntries: number;
  starterCourseEnrollments: number;
}

/** Counts of related rows that a permanent delete would also erase — for a confirmation prompt. */
export async function getStudentDeleteImpact(studentId: number): Promise<StudentDeleteImpact> {
  const db = await getDb();
  const [a] = await db.select({ n: sql<number>`count(*)` }).from(attendanceRecords).where(eq(attendanceRecords.studentId, studentId));
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(rankHistory).where(eq(rankHistory.studentId, studentId));
  const [e] = await db.select({ n: sql<number>`count(*)` }).from(eventRoster).where(eq(eventRoster.studentId, studentId));
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(testingRegistration).where(eq(testingRegistration.studentId, studentId));
  const [sp] = await db.select({ n: sql<number>`count(*)` }).from(specialTesters).where(eq(specialTesters.studentId, studentId));
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(starterCourseEnrollment).where(eq(starterCourseEnrollment.studentId, studentId));
  return {
    attendanceRecords: Number(a?.n ?? 0),
    rankHistory: Number(r?.n ?? 0),
    eventRegistrations: Number(e?.n ?? 0),
    testingRegistrations: Number(t?.n ?? 0),
    specialTesterEntries: Number(sp?.n ?? 0),
    starterCourseEnrollments: Number(c?.n ?? 0),
  };
}

/**
 * Permanently and irreversibly delete a student and every related record
 * (attendance, promotion history, event/testing/course registrations,
 * progress). There is no undo — this exists only to clean up accidental
 * duplicate students. Normal removal is `setStudentActive(id, false)`
 * (soft-delete), which keeps history intact; prefer that for everything else.
 */
export async function deleteStudentPermanently(studentId: number): Promise<void> {
  const db = await getDb();
  await db.delete(attendanceRecords).where(eq(attendanceRecords.studentId, studentId));
  await db.delete(rankHistory).where(eq(rankHistory.studentId, studentId));
  await db.delete(eventRoster).where(eq(eventRoster.studentId, studentId));
  await db.delete(testingRegistration).where(eq(testingRegistration.studentId, studentId));
  await db.delete(specialTesters).where(eq(specialTesters.studentId, studentId));
  await db.delete(starterCourseEnrollment).where(eq(starterCourseEnrollment.studentId, studentId));
  await db.delete(trialHistory).where(eq(trialHistory.studentId, studentId));
  await db.delete(studentProgress).where(eq(studentProgress.studentId, studentId));
  await db.delete(students).where(eq(students.id, studentId));
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

export interface RankHistoryEdit {
  promotionDate: string;
  toRankId: number;
  note: string | null;
}

/**
 * Correct a rank_history row after the fact (date, rank earned, note) — for
 * fixing mistakes rather than doing another promotion. The new rank must
 * stay in the same track as the row's current one; track changes only ever
 * happen through the graduation flow. If this is the student's most recent
 * promotion (by date), also syncs students.belt_rank_id so their current
 * belt matches the correction.
 */
export async function updateRankHistory(id: number, edit: RankHistoryEdit): Promise<void> {
  const db = await getDb();
  const [row] = await db.select().from(rankHistory).where(eq(rankHistory.id, id));
  if (!row) return;
  const oldRank = await rankById(row.toRankId);
  const newRank = await rankById(edit.toRankId);
  if (!oldRank || !newRank || newRank.track !== oldRank.track) {
    throw new Error("The new rank must be in the same track as the original.");
  }

  await db
    .update(rankHistory)
    .set({ promotionDate: edit.promotionDate, toRankId: edit.toRankId, note: edit.note, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(rankHistory.id, id));

  const [latest] = await db
    .select({ id: rankHistory.id })
    .from(rankHistory)
    .where(eq(rankHistory.studentId, row.studentId))
    .orderBy(desc(rankHistory.promotionDate), desc(rankHistory.id))
    .limit(1);
  if (latest?.id === id) {
    await db
      .update(students)
      .set({ beltRankId: edit.toRankId, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(students.id, row.studentId));
  }
}

/** A student's "No Change" (tested, not promoted) history, most recent first. */
export async function listNoChangeHistory(studentId: number) {
  const db = await getDb();
  const rows = await db
    .select({ h: noChangeHistory, ...rankCols })
    .from(noChangeHistory)
    .innerJoin(beltRanks, eq(noChangeHistory.rankId, beltRanks.id))
    .where(eq(noChangeHistory.studentId, studentId))
    .orderBy(desc(noChangeHistory.testDate));
  return rows.map((x) => ({ h: x.h, at: toRank(x) }));
}

/**
 * Promote a single student one step (or, with targetRankId, straight to a
 * chosen rank — "Rank Skip" / a Tiger Cub testing directly for Black Stripe),
 * handling the Tiger Cub graduation flow. Returns a result describing what
 * happened (or why it was skipped).
 */
export async function promoteStudent(
  studentId: number,
  opts: { date?: string; note?: string | null; eventId?: number | null; targetRankId?: number | null } = {},
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

  const targetId = opts.targetRankId ?? current.nextRankId;
  if (targetId == null) {
    return { studentId, name, previousBelt: current.name, newBelt: current.name, beltSize: s.beltSize, graduated: false, skipped: "already at top rank" };
  }

  const next = await rankById(targetId);
  if (!next) {
    return { studentId, name, previousBelt: current.name, newBelt: current.name, beltSize: s.beltSize, graduated: false, skipped: "next rank missing" };
  }
  if (next.track !== current.track) {
    return { studentId, name, previousBelt: current.name, newBelt: current.name, beltSize: s.beltSize, graduated: false, skipped: "target rank is a different track" };
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
  classCredit: number;
}

/** Events not yet posted (the active/upcoming list). */
export async function listEvents() {
  const db = await getDb();
  return db.select().from(events).where(isNull(events.postedAt)).orderBy(desc(events.eventDate));
}

/** Events already posted (credited to students' class counts) — history view. */
export async function listPostedEvents() {
  const db = await getDb();
  return db.select().from(events).where(isNotNull(events.postedAt)).orderBy(desc(events.eventDate));
}

/** Credit every rostered student the event's class_credit and remove it from the active list. */
export async function postEvent(eventId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(events)
    .set({ postedAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(events.id, eventId), isNull(events.postedAt)));
}

/** Undo a post — removes the credit again. */
export async function unpostEvent(eventId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(events)
    .set({ postedAt: null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(events.id, eventId));
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

// Default export ordering: Tiger Cubs first, then Jr. (white→black), then Adults
// (white→black); within each group by belt rank, then last name.
function exportGroupOrder(s: StudentRow): number {
  if (s.track === "tiger") return 0;
  return s.ageGroup === "adult" ? 2 : 1;
}
function compareForExport(a: StudentRow, b: StudentRow): number {
  return (
    exportGroupOrder(a) - exportGroupOrder(b) ||
    a.rank.sortOrder - b.rank.sortOrder ||
    a.lastName.localeCompare(b.lastName) ||
    a.firstName.localeCompare(b.firstName)
  );
}

/** CSV export of an event roster: name, age, track, belt, phone, email. */
export async function buildEventRosterCsv(eventId: number): Promise<string> {
  const roster = (await getEventRoster(eventId)).slice().sort(compareForExport);
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

/**
 * Pre-set the upcoming cycle's dates ahead of time. promoteCycle() applies
 * these (instead of a 90-day placeholder guess) when it rolls the current
 * cycle forward, then clears them back to null.
 */
export async function updateNextCycleDates(
  id: number,
  nextStartDate: string | null,
  nextEndDate: string | null,
  nextTestingDate: string | null,
): Promise<void> {
  const db = await getDb();
  await db
    .update(testingCycles)
    .set({ nextStartDate, nextEndDate, nextTestingDate, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(testingCycles.id, id));
}

/** Most recently completed cycle's dates, or null if none has rolled over yet. */
export async function getPreviousCycle(): Promise<TestingCycleHistory | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(testingCycleHistory)
    .orderBy(desc(testingCycleHistory.id))
    .limit(1);
  return row ?? null;
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
  targetRankId: number | null;
}

/** Registered students for a cycle, with their stripes + cycle attendance count. */
export async function getCycleRegistrations(cycleId: number): Promise<TestingRow[]> {
  const db = await getDb();
  const cycle = await getCycleById(cycleId);
  const rows = await db
    .select({
      s: students,
      ...rankCols,
      targetRankId: testingRegistration.targetRankId,
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
    const targetId = x.targetRankId ?? rank.nextRankId;
    const next = targetId ? rankById.get(targetId) : null;
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
      targetRankId: x.targetRankId,
    };
  });
}

/**
 * Override a registered student's testing target ("Rank Skip") to a specific
 * rank rather than the automatic next rank — how a Tiger Cub registers to
 * test directly for Black Stripe, or a Jr./Adult student skips ahead. Pass
 * null to clear the override and go back to the automatic next rank.
 */
export async function setRegistrationTarget(
  cycleId: number,
  studentId: number,
  targetRankId: number | null,
): Promise<void> {
  const db = await getDb();
  await db
    .update(testingRegistration)
    .set({ targetRankId })
    .where(and(eq(testingRegistration.cycleId, cycleId), eq(testingRegistration.studentId, studentId)));
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

  const eventRows = await db
    .select({
      studentId: eventRoster.studentId,
      n: sql<number>`sum(${events.classCredit})`,
    })
    .from(eventRoster)
    .innerJoin(events, eq(eventRoster.eventId, events.id))
    .where(
      and(
        inArray(eventRoster.studentId, studentIds),
        isNotNull(events.postedAt),
        gte(events.eventDate, start),
        lte(events.eventDate, end),
      ),
    )
    .groupBy(eventRoster.studentId);

  const map = new Map<number, number>(rows.map((r) => [r.studentId, Number(r.n)]));
  for (const r of eventRows) map.set(r.studentId, (map.get(r.studentId) ?? 0) + Number(r.n));
  return map;
}

export interface CandidateRow extends StudentRow {
  attendanceThisCycle: number;
  minClasses: number;
  meetsMinimum: boolean;
  registered: boolean;
  testingFor: string | null;
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
  const ranks = await listBeltRanks();
  const rankById = new Map(ranks.map((r) => [r.id, r]));

  const reg = await db
    .select({ studentId: testingRegistration.studentId })
    .from(testingRegistration)
    .where(eq(testingRegistration.cycleId, cycleId));
  const registered = new Set(reg.map((r) => r.studentId));

  return rows.map((x) => {
    const rank = toRank(x);
    const next = rank.nextRankId ? rankById.get(rank.nextRankId) : null;
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
      testingFor: next ? next.name : null,
    };
  });
}

/**
 * Promote every registered student one rank (lowest rank first), then clear the
 * registration list so the cycle is ready for the next round and no one is
 * promoted twice. Reuses promoteStudent (logs rank_history, handles graduation).
 * Students already pulled off the roster via markNoChange are simply not here.
 *
 * Promotions are dated to the cycle's testing_date (the day the student
 * actually tested), NOT the day this is clicked — staff routinely wait days
 * (handling late testers/retests) before clicking Process Testing, and the
 * promotion should be recorded as earned on testing day itself.
 *
 * Also rolls the cycle's date window forward so class counts reset for
 * everyone (not just the students who tested), and logs the just-finished
 * cycle's dates to testing_cycle_history (the "previous cycle" record, since
 * this row is reused/edited in place). If staff pre-set the next cycle's
 * dates (Next cycle fields), those are used for the new window; otherwise it
 * falls back to a 90-day placeholder end date and no testing date, same as
 * before, until staff sets the real dates by hand. Rolls whenever a testing
 * date was set — even if the roster is now empty (e.g. everyone left was
 * marked No Change) — but not for an untouched cycle that never had a
 * testing date scheduled.
 */
export async function promoteCycle(cycleId: number): Promise<PromotionResult[]> {
  const cycle = await getCycleById(cycleId);
  const testDate = cycle.testingDate ?? today();
  const roster = await getCycleRegistrations(cycleId); // sorted by sort_order asc
  const results: PromotionResult[] = [];
  for (const s of roster) {
    results.push(await promoteStudent(s.id, { date: testDate, eventId: null, targetRankId: s.targetRankId }));
  }
  const db = await getDb();
  await db
    .delete(testingRegistration)
    .where(eq(testingRegistration.cycleId, cycleId));

  if (cycle.testingDate) {
    await db.insert(testingCycleHistory).values({
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      testingDate: cycle.testingDate,
    });
    const newStart = cycle.nextStartDate ?? addDays(cycle.testingDate, 1);
    const newEnd = cycle.nextEndDate ?? addDays(newStart, 90);
    await updateCycle(cycleId, newStart, newEnd, cycle.nextTestingDate ?? null);
    await updateNextCycleDates(cycleId, null, null, null);
  }

  return results;
}

/**
 * Record that a registered student tested but wasn't promoted ("No Change"),
 * then remove them from the cycle's roster — same as a successful promotion,
 * they've been processed for this testing. Doesn't touch student_progress:
 * they're still working toward the same belt, so their stripes/PTT carry
 * forward to their next attempt.
 */
export async function markNoChange(
  cycleId: number,
  studentId: number,
  reason: NcReason,
  note: string | null,
): Promise<void> {
  const db = await getDb();
  const [s] = await db.select().from(students).where(eq(students.id, studentId));
  const cycle = await getCycleById(cycleId);
  await db.insert(noChangeHistory).values({
    studentId,
    rankId: s.beltRankId,
    cycleId,
    testDate: cycle.testingDate ?? today(),
    reason,
    note,
  });
  await db
    .delete(testingRegistration)
    .where(and(eq(testingRegistration.cycleId, cycleId), eq(testingRegistration.studentId, studentId)));
}

/**
 * Print-ready HTML of belt labels for a cycle's registered students, laid out
 * for Avery 5160 address labels (US Letter, 3 cols × 10 rows, 2.625" × 1").
 * Each label: student name, the belt they're testing for, and belt size.
 */
export async function buildBeltLabelsHtml(cycleId: number): Promise<string> {
  const roster = (await getCycleRegistrations(cycleId)).slice().sort(compareForExport);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const label = (s: TestingRow) => `
      <div class="label">
        <div class="name">${esc(`${s.firstName} ${s.lastName}`)}</div>
        <div class="belt">${esc(s.testingFor ?? s.rank.name)}</div>
        <div class="size">Size: ${esc(s.beltSize ?? "—")}</div>
      </div>`;
  const pages: TestingRow[][] = [];
  for (let i = 0; i < roster.length; i += 30) pages.push(roster.slice(i, i + 30));
  const sheets = (pages.length ? pages : [[]]).map((pg) => `<div class="sheet">${pg.map(label).join("")}</div>`).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Belt labels</title>
<style>
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  .sheet {
    width: 8.5in; height: 11in; padding: 0.5in 0.1875in;
    display: grid; grid-template-columns: repeat(3, 2.625in); grid-auto-rows: 1in;
    column-gap: 0.125in; row-gap: 0;
    page-break-after: always;
  }
  .sheet:last-child { page-break-after: auto; }
  .label {
    width: 2.625in; height: 1in; padding: 0.1in 0.18in; overflow: hidden;
    display: flex; flex-direction: column; justify-content: center;
    font-family: Arial, Helvetica, sans-serif;
  }
  .name { font-weight: 700; font-size: 12pt; line-height: 1.15; }
  .belt { font-size: 9.5pt; }
  .size { font-size: 9pt; color: #333; }
  @media screen {
    body { background: #e5e5e5; }
    .sheet { background: #fff; margin: 12px auto; box-shadow: 0 0 6px rgba(0,0,0,.25); }
    .label { outline: 1px dashed #ccc; }
  }
</style></head>
<body>${sheets}</body></html>`;
}

/**
 * Print-ready HTML of every active student's attendance in the current cycle's
 * date window — a quick look at who's on track before testing without opening
 * each profile, grouped/ordered the same way as the other cycle exports.
 * Below-minimum students are shaded so they stand out at a glance.
 */
export async function buildAttendanceReportHtml(cycleId: number): Promise<string> {
  const cycle = await getCycleById(cycleId);
  const rows = (await getCycleCandidates(cycleId)).slice().sort(compareForExport);
  const asOfLabel = prettyDate(cycle.testingDate ?? cycle.endDate);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const short = rows.filter((s) => !s.meetsMinimum).length;
  const tr = (s: CandidateRow) => `
      <tr class="${s.meetsMinimum ? "" : "short"}">
        <td>${esc(`${s.firstName} ${s.lastName}`)}</td>
        <td>${esc(s.rank.name)}</td>
        <td class="num">${s.attendanceThisCycle}</td>
        <td class="num">${s.minClasses}</td>
        <td class="status">${s.meetsMinimum ? "✓" : ""}</td>
      </tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Attendance — ${esc(prettyDate(cycle.startDate))} to ${esc(asOfLabel)}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; }
  h1 { font-size: 16pt; margin: 0 0 2px; }
  .subtitle { font-size: 10pt; color: #444; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; }
  th { background: #eee; }
  td.num, td.status { text-align: center; width: 1%; white-space: nowrap; }
  tr.short { background: #fdeaea; }
  tr.short td { font-weight: 700; }
  @media screen { body { padding: 24px; } }
</style></head>
<body>
  <h1>Attendance — Current Testing Cycle</h1>
  <p class="subtitle">${esc(prettyDate(cycle.startDate))} through ${esc(asOfLabel)} · ${rows.length} active student${rows.length === 1 ? "" : "s"}, ${short} below the class minimum · printed ${esc(prettyDate(today()))}</p>
  <table>
    <thead><tr><th>Name</th><th>Belt</th><th class="num">Classes</th><th class="num">Min</th><th class="status">Met</th></tr></thead>
    <tbody>${rows.map(tr).join("")}</tbody>
  </table>
</body></html>`;
}

/** CSV export of the testing list: name, age, belt, testing-for, size, classes. */
export async function buildTestingCycleCsv(cycleId: number): Promise<string> {
  const roster = (await getCycleRegistrations(cycleId)).slice().sort(compareForExport);
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

/** Active students neither registered to test nor on the early/late list. */
export async function getNonTesters(cycleId: number): Promise<CandidateRow[]> {
  const [candidates, special] = await Promise.all([
    getCycleCandidates(cycleId),
    listSpecialTesters(),
  ]);
  const specialIds = new Set(special.map((s) => s.id));
  return candidates.filter((s) => !s.registered && !specialIds.has(s.id));
}

/** CSV export of students not selected for testing: name, age, belt, prospective rank, belt size, attendance, phone. */
export async function buildNonTestersCsv(cycleId: number): Promise<string> {
  const rows = (await getNonTesters(cycleId)).slice().sort(compareForExport);
  const lines = [csvRow(["Name", "Age", "Belt", "Prospective Rank", "Belt Size", "Attendance", "Phone"])];
  for (const s of rows) {
    const age = ageFromDob(s.dateOfBirth);
    lines.push(csvRow([
      `${s.firstName} ${s.lastName}`,
      age,
      s.rank.name,
      s.testingFor ?? "(top rank)",
      s.beltSize ?? "",
      s.attendanceThisCycle,
      s.phone || s.guardian1Phone || "",
    ]));
  }
  return lines.join("\r\n");
}

// Certificate "Color" wording, matching the school's historical mail-merge files
// (Dropbox "Certificate Data"). Keyed by the app belt name → the exact text that
// prints on the certificate: Tiger Cubs as "Cub/<color>", seniors spelled out as
// "Senior …", and black degrees as "<n> Degree Black Level <m>" (per the linked
// July 2025 reference). Anything not listed falls back to the app belt name.
const CERT_BELT_NAME: Record<string, string> = {
  "Tiger Cub White Belt": "Cub/White",
  "Tiger Cub Yellow Stripe": "Cub/Yellow",
  "Tiger Cub Green Stripe": "Cub/Green",
  "Tiger Cub Blue Stripe": "Cub/Blue",
  "Tiger Cub Purple Stripe": "Cub/Purple",
  "Tiger Cub Brown Stripe": "Cub/Brown",
  "Tiger Cub Red Stripe": "Cub/Red",
  "Tiger Cub Black Stripe": "Cub/Black",
  "White Belt": "White Belt",
  "Yellow Belt": "Yellow Belt",
  "Green Belt": "Green Belt",
  "Sr. Green Belt": "Senior Green Belt",
  "Blue Belt": "Blue Belt",
  "Sr. Blue Belt": "Senior Blue Belt",
  "Purple Belt": "Purple Belt",
  "Sr. Purple Belt": "Senior Purple Belt",
  "Brown Belt L1": "Brown Belt L1",
  "Brown Belt L2": "Brown Belt L2",
  "Brown Belt L3": "Brown Belt L3",
  "Red Belt L1": "Red Belt L1",
  "Red Belt L2": "Red Belt L2",
  "Red Belt L3": "Red Belt L3",
  "1st Degree Black L1": "1st Degree Black Level 1",
  "1st Degree Black L2": "1st Degree Black Level 2",
  "1st Degree Black L3": "1st Degree Black Level 3",
  "1st Degree Black L4": "1st Degree Black Level 4",
  "2nd Degree Black L1": "2nd Degree Black Level 1",
  "2nd Degree Black L2": "2nd Degree Black Level 2",
  "2nd Degree Black L3": "2nd Degree Black Level 3",
  "2nd Degree Black L4": "2nd Degree Black Level 4",
  "3rd Degree Black L1": "3rd Degree Black Level 1",
  "3rd Degree Black L2": "3rd Degree Black Level 2",
  "3rd Degree Black L3": "3rd Degree Black Level 3",
  "3rd Degree Black L4": "3rd Degree Black Level 4",
  "4th Degree Black": "4th Degree Black Belt",
  "5th Degree Black": "5th Degree Black Belt",
  "6th Degree Black": "6th Degree Black Belt",
  "7th Degree Black": "7th Degree Black Belt",
  "8th Degree Black": "8th Degree Black Belt",
  "9th Degree Black": "9th Degree Black Belt",
};

export interface CertificateRow {
  name: string;
  rank: string;
}

/**
 * Rows for the certificate-data spreadsheet (mail-merge source): each registered
 * student's full name + the NEW rank they earn at this testing, in certificate
 * wording, ordered by that new rank. Students already at the top rank (no next
 * rank) are omitted.
 */
export async function buildCertificateRows(cycleId: number): Promise<CertificateRow[]> {
  const regs = await getCycleRegistrations(cycleId);
  const byId = new Map((await listBeltRanks()).map((r) => [r.id, r]));
  return regs
    .map((s) => {
      const targetId = s.targetRankId ?? s.rank.nextRankId;
      return { s, next: targetId ? byId.get(targetId) ?? null : null };
    })
    .filter((x): x is { s: TestingRow; next: BeltRank } => x.next != null)
    .sort((a, b) =>
      beltRankOrder(a.next) - beltRankOrder(b.next) ||
      a.s.lastName.localeCompare(b.s.lastName) ||
      a.s.firstName.localeCompare(b.s.firstName))
    .map((x) => ({ name: `${x.s.firstName} ${x.s.lastName}`, rank: CERT_BELT_NAME[x.next.name] ?? x.next.name }));
}

// ----------------------------------------------------------------------------
// Belt order (roster + purchase breakdown, checked against inventory on hand)
// ----------------------------------------------------------------------------

// Regular-track belts stocked as sized items in the inventory "Belts" section,
// keyed by belt_ranks.name -> the inventory item's "name" (color/level label).
// White Belt is intentionally omitted — it ships with the starter uniform, not
// purchased per size through this section. 1st Degree Black L1 IS included: a
// Red Belt L3 testing into it gets a new plain "Black" belt, stocked like any
// other color. Every Black degree/level PAST 1st Degree L1 is omitted — those
// are custom-monogrammed and ordered separately, not stocked here.
const BELT_INVENTORY_NAME: Record<string, string> = {
  "Yellow Belt": "Yellow",
  "Green Belt": "Green",
  "Sr. Green Belt": "Sr. Green",
  "Blue Belt": "Blue",
  "Sr. Blue Belt": "Sr. Blue",
  "Purple Belt": "Purple",
  "Sr. Purple Belt": "Sr. Purple",
  "Brown Belt L1": "Brown L1",
  "Brown Belt L2": "Brown L2",
  "Brown Belt L3": "Brown L3",
  "Red Belt L1": "Red L1",
  "Red Belt L2": "Red L2",
  "Red Belt L3": "Red L3",
  "1st Degree Black L1": "Black",
};

// Tiger Cub belts are tracked as one "Cub Belt" item per stripe color in the
// "Cub Belts" section (no physical-size variants) — keyed by belt_ranks.name
// -> the inventory item's "size" column, which holds the stripe color there.
const CUB_BELT_STRIPE: Record<string, string> = {
  "Tiger Cub Yellow Stripe": "Yellow Stripe",
  "Tiger Cub Green Stripe": "Green Stripe",
  "Tiger Cub Blue Stripe": "Blue Stripe",
  "Tiger Cub Purple Stripe": "Purple Stripe",
  "Tiger Cub Brown Stripe": "Brown Stripe",
  "Tiger Cub Red Stripe": "Red Stripe",
  "Tiger Cub Black Stripe": "Black Stripe",
};

// Display override for the Order Breakdown sheet's "Belt" column — "1st
// Degree Black L1" is the internal rank name, but the physical item being
// ordered is just a plain black belt, so show it as "Black Belt" there.
const BELT_ORDER_DISPLAY_NAME: Record<string, string> = {
  "1st Degree Black L1": "Black Belt",
};

export interface BeltOrderRow {
  name: string;
  age: number | null;
  currentBelt: string;
  testingFor: string | null;
  beltSize: string | null;
}

/** Registered-to-test roster for the belt order sheet, in rank order. */
export async function getBeltOrderRoster(cycleId: number): Promise<BeltOrderRow[]> {
  const roster = (await getCycleRegistrations(cycleId)).slice().sort(compareForExport);
  return roster.map((s) => ({
    name: `${s.firstName} ${s.lastName}`,
    age: ageFromDob(s.dateOfBirth),
    currentBelt: s.rank.name,
    testingFor: s.testingFor,
    beltSize: s.beltSize,
  }));
}

export interface BeltOrderNeed {
  belt: string;
  size: string;
  needed: number;
  inStock: number;
  toPurchase: number;
}

/**
 * How many of each testing-for belt/size are needed vs. what's on hand, per
 * the inventory "Belts" and "Cub Belts" sections. Students testing for a
 * belt that isn't stocked there (White Belt, Black degrees past 1st Degree
 * L1) are left off this breakdown — see BELT_INVENTORY_NAME / CUB_BELT_STRIPE
 * above.
 */
export async function getBeltOrderBreakdown(cycleId: number): Promise<BeltOrderNeed[]> {
  const roster = await getCycleRegistrations(cycleId);
  const ranks = await listBeltRanks();
  const rankById = new Map(ranks.map((r) => [r.id, r]));
  const stockItems = (await listInventory())
    .filter((s) => s.section.name === "Belts" || s.section.name === "Cub Belts")
    .flatMap((s) => s.items);
  const stockFor = (name: string, size: string) =>
    stockItems.find((i) => i.name === name && i.size === size)?.inStock ?? 0;

  interface Accum { belt: BeltRank; size: string; invName: string; invSize: string; count: number }
  const needed = new Map<string, Accum>();
  for (const s of roster) {
    const targetId = s.targetRankId ?? s.rank.nextRankId;
    const next = targetId ? rankById.get(targetId) : null;
    if (!next) continue; // already at top rank — nothing to order
    const isTiger = next.track === "tiger";
    const invName = isTiger ? "Cub Belt" : BELT_INVENTORY_NAME[next.name];
    const invSize = isTiger ? CUB_BELT_STRIPE[next.name] : s.beltSize;
    if (!invName || !invSize) continue; // not stocked per size — omit from the breakdown
    const displaySize = isTiger ? "—" : invSize;
    const key = `${invName}::${invSize}`;
    const row = needed.get(key) ?? { belt: next, size: displaySize, invName, invSize, count: 0 };
    row.count += 1;
    needed.set(key, row);
  }

  return Array.from(needed.values())
    .sort((a, b) => beltRankOrder(a.belt) - beltRankOrder(b.belt) || a.size.localeCompare(b.size))
    .map((r) => {
      const inStock = stockFor(r.invName, r.invSize);
      const belt = BELT_ORDER_DISPLAY_NAME[r.belt.name] ?? r.belt.name;
      return { belt, size: r.size, needed: r.count, inStock, toPurchase: Math.max(r.count - inStock, 0) };
    });
}

// ----------------------------------------------------------------------------
// Early / late testers (students testing outside the cycle's main testing day)
// ----------------------------------------------------------------------------

export interface SpecialTestRow extends StudentRow {
  specialTesterId: number;
  testDate: string;
  tested: boolean;
  timing: "Early" | "Late" | "Same day";
  testingFor: string | null;
  attendance: number;
  minClasses: number;
  meetsMinimum: boolean;
}

/** Add a student to the early/late list, or update their date if already on it. */
export async function addSpecialTester(studentId: number, testDate: string): Promise<void> {
  const db = await getDb();
  const [existing] = await db.select().from(specialTesters).where(eq(specialTesters.studentId, studentId));
  if (existing) {
    await db
      .update(specialTesters)
      .set({ testDate, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(specialTesters.id, existing.id));
  } else {
    await db.insert(specialTesters).values({ studentId, testDate });
  }
}

export async function setSpecialTesterDate(id: number, testDate: string): Promise<void> {
  const db = await getDb();
  await db
    .update(specialTesters)
    .set({ testDate, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(specialTesters.id, id));
}

export async function setSpecialTesterTested(id: number, tested: boolean): Promise<void> {
  const db = await getDb();
  await db
    .update(specialTesters)
    .set({ tested, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(specialTesters.id, id));
}

export async function removeSpecialTester(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(specialTesters).where(eq(specialTesters.id, id));
}

/** Clear the entire early/late testers list (e.g. once a cycle's been fully processed). */
export async function clearSpecialTesters(): Promise<void> {
  const db = await getDb();
  await db.delete(specialTesters);
}

/** Everyone on the early/late list, with belt/attendance context, soonest date first. */
export async function listSpecialTesters(): Promise<SpecialTestRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      // specialTesters and students both have id/notes/created_at/updated_at —
      // alias these explicitly (see rankCols above) instead of nesting the
      // whole table, or the proxy's positional row-mapping silently corrupts.
      stId: sql<number>`${specialTesters.id}`.as("st_id"),
      stTestDate: sql<string>`${specialTesters.testDate}`.as("st_test_date"),
      stTested: sql<boolean>`${specialTesters.tested}`.as("st_tested"),
      s: students,
      ...rankCols,
      ptt: studentProgress.permissionToTest,
    })
    .from(specialTesters)
    .innerJoin(students, eq(specialTesters.studentId, students.id))
    .innerJoin(beltRanks, eq(students.beltRankId, beltRanks.id))
    .leftJoin(studentProgress, eq(studentProgress.studentId, students.id))
    .orderBy(asc(specialTesters.testDate));
  if (rows.length === 0) return [];

  const cycle = await getCurrentCycle();
  const mainDay = cycle.testingDate ?? cycle.endDate;
  const ranks = await listBeltRanks();
  const rankById = new Map(ranks.map((r) => [r.id, r]));

  const result: SpecialTestRow[] = [];
  for (const x of rows) {
    const rank = toRank(x);
    const next = rank.nextRankId ? rankById.get(rank.nextRankId) : null;
    const attendanceMap = await presentCountsInRange([x.s.id], cycle.startDate, x.stTestDate);
    const minClasses = minClassesToTest(rank);
    const attendance = attendanceMap.get(x.s.id) ?? 0;
    result.push({
      ...x.s,
      rank,
      permissionToTest: Boolean(x.ptt),
      specialTesterId: x.stId,
      testDate: x.stTestDate,
      tested: Boolean(x.stTested),
      timing: x.stTestDate < mainDay ? "Early" : x.stTestDate > mainDay ? "Late" : "Same day",
      testingFor: next ? next.name : null,
      attendance,
      minClasses,
      meetsMinimum: attendance >= minClasses,
    });
  }
  // Earliest to latest test date, then lowest to highest rank, then youngest to oldest.
  result.sort((a, b) =>
    a.testDate.localeCompare(b.testDate) ||
    beltRankOrder(a.rank) - beltRankOrder(b.rank) ||
    (ageFromDob(a.dateOfBirth) ?? -1) - (ageFromDob(b.dateOfBirth) ?? -1) ||
    a.lastName.localeCompare(b.lastName));
  return result;
}

// ----------------------------------------------------------------------------
// Attendance
// ----------------------------------------------------------------------------

export type ClassType = "tiger" | "jr-wy" | "jr-gbp" | "jr-brb" | "adult" | "private";

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

  // Private Lessons: any student may attend, so the roster is the whole active
  // student body (Tiger Cubs first, then by rank).
  if (classType === "private") {
    return (await listStudents())
      .filter((s) => s.isActive)
      .sort((a, b) => beltRankOrder(a.rank) - beltRankOrder(b.rank) || a.lastName.localeCompare(b.lastName));
  }

  // Adult class: regular adults, plus ANY active student aged 12+ (by DOB) —
  // older juniors may attend the adult class too. Age isn't stored in SQL, so
  // filter in JS over the active roster.
  if (classType === "adult") {
    const all = await listStudents();
    return all
      .filter((s) => s.isActive)
      .filter((s) =>
        (s.track === "regular" && s.ageGroup === "adult") ||
        (ageFromDob(s.dateOfBirth) ?? -1) >= 12,
      )
      .sort((a, b) => a.rank.sortOrder - b.rank.sortOrder || a.lastName.localeCompare(b.lastName));
  }

  if (classType === "jr-wy") {
    // Jr. White & Yellow: regular jr W/Y students, plus Tiger Cubs who may also
    // attend this class — Tiger Cub Red Stripes (any age) and any Tiger Cub
    // aged 6+. Age isn't stored in SQL, so the 6+ cutoff is applied in JS.
    const rows = await db
      .select({ s: students, ...rankCols, ptt: studentProgress.permissionToTest })
      .from(students)
      .innerJoin(beltRanks, eq(students.beltRankId, beltRanks.id))
      .leftJoin(studentProgress, eq(studentProgress.studentId, students.id))
      .where(
        and(
          eq(students.isActive, true),
          or(
            and(eq(students.track, "regular"), eq(students.ageGroup, "jr"), eq(beltRanks.classGroup, "jr-wy")),
            eq(students.track, "tiger"),
          ),
        ),
      )
      .orderBy(asc(beltRanks.sortOrder), asc(students.lastName));
    return rows
      .map((x) => ({ ...x.s, rank: toRank(x), permissionToTest: Boolean(x.ptt) }))
      .filter(
        (s) =>
          s.track !== "tiger" ||
          s.rank.name === "Tiger Cub Red Stripe" ||
          (ageFromDob(s.dateOfBirth) ?? -1) >= 6,
      )
      // Tiger Cubs rank before regular White/Yellow belts.
      .sort((a, b) => beltRankOrder(a.rank) - beltRankOrder(b.rank) || a.lastName.localeCompare(b.lastName));
  }

  let where;
  if (classType === "tiger") {
    where = and(eq(students.isActive, true), eq(students.track, "tiger"));
  } else {
    where = and(
      eq(students.isActive, true),
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
    .where(where)
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
  thisCycle: number;
  sinceLastPromotion: number;
  recent: { date: string; label: string }[];
}

/** A student's present classes + posted events, each dated and credited (event credit may be >1). */
async function studentAttendanceRows(studentId: number) {
  const db = await getDb();
  const classRows = await db
    .select({ date: attendanceSessions.sessionDate, classType: attendanceSessions.classType })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(and(eq(attendanceRecords.studentId, studentId), eq(attendanceRecords.status, "present")));

  const eventRows = await db
    .select({ date: events.eventDate, name: events.name, credit: events.classCredit })
    .from(eventRoster)
    .innerJoin(events, eq(eventRoster.eventId, events.id))
    .where(and(eq(eventRoster.studentId, studentId), isNotNull(events.postedAt)));

  const combined = [
    ...classRows.map((r) => ({
      date: r.date,
      credit: 1,
      label: r.classType === "legacy" ? "Class" : CLASS_TYPE_LABELS[r.classType as ClassType] ?? r.classType,
    })),
    ...eventRows.map((r) => ({
      date: r.date,
      credit: r.credit,
      label: r.credit > 1 ? `${r.name} (+${r.credit} classes)` : r.name,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return { eventRows, combined };
}

/** A student's present-class + posted-event history (most recent first) + totals. */
export async function getStudentAttendance(studentId: number): Promise<StudentAttendanceSummary> {
  const { combined } = await studentAttendanceRows(studentId);
  const total = combined.reduce((sum, r) => sum + r.credit, 0);
  const sinceLastPromotion = await classesSincePromotion(studentId);
  const cycle = await getCurrentCycle();
  const thisCycle = (await presentCountsInRange([studentId], cycle.startDate, cycle.testingDate ?? cycle.endDate)).get(studentId) ?? 0;
  return { total, thisCycle, sinceLastPromotion, recent: combined.map(({ date, label }) => ({ date, label })) };
}

export interface CycleWindowSummary {
  start: string;
  end: string;
  testingDate: string | null;
  entries: { date: string; label: string }[];
  count: number;
}

export interface StudentAttendanceDetail {
  currentCycle: CycleWindowSummary;
  previousCycle: CycleWindowSummary | null;
  sinceLastTesting: { count: number; since: string | null };
  events: { date: string; label: string }[];
  totalClasses: number;
  avgPerWeekCurrentCycle: number;
  avgPerWeekAllTime: number;
}

/**
 * Full attendance breakdown for a student's expanded history view: current
 * and previous testing-cycle windows, classes since their last testing
 * (promotion or No Change), lifetime events, and weekly-average pace.
 */
export async function getStudentAttendanceDetail(studentId: number): Promise<StudentAttendanceDetail> {
  const db = await getDb();
  const { eventRows, combined } = await studentAttendanceRows(studentId);

  const windowSummary = (start: string, end: string, testingDate: string | null): CycleWindowSummary => {
    const cutoff = testingDate ?? end;
    const entries = combined.filter((c) => c.date >= start && c.date <= cutoff);
    return {
      start,
      end,
      testingDate,
      entries: entries.map(({ date, label }) => ({ date, label })),
      count: entries.reduce((sum, e) => sum + e.credit, 0),
    };
  };

  const cycle = await getCurrentCycle();
  const currentCycle = windowSummary(cycle.startDate, cycle.endDate, cycle.testingDate);

  const prev = await getPreviousCycle();
  const previousCycle = prev ? windowSummary(prev.startDate, prev.endDate, prev.testingDate) : null;

  const [student] = await db.select({ joinDate: students.joinDate }).from(students).where(eq(students.id, studentId));
  const totalClasses = combined.reduce((sum, r) => sum + r.credit, 0);
  // Rate so far this cycle: elapsed time (start -> today, capped at the
  // cycle's own cutoff), not the full nominal window -- the cutoff is often a
  // future testing date, which would understate the pace for an in-progress cycle.
  const elapsedEnd = [today(), currentCycle.testingDate ?? currentCycle.end].sort()[0];
  const avgPerWeekCurrentCycle = currentCycle.count / Math.max(daysBetween(currentCycle.start, elapsedEnd) / 7, 1);
  const avgPerWeekAllTime = totalClasses / Math.max(daysBetween(student.joinDate, today()) / 7, 1);

  return {
    currentCycle,
    previousCycle,
    sinceLastTesting: await classesSinceLastTesting(studentId),
    events: eventRows.map((r) => ({ date: r.date, label: r.credit > 1 ? `${r.name} (+${r.credit} classes)` : r.name })),
    totalClasses,
    avgPerWeekCurrentCycle,
    avgPerWeekAllTime,
  };
}

/** Count of present classes + posted-event credit after `since` (or all-time if null). */
async function countPresentSince(studentId: number, since: string | null): Promise<number> {
  const db = await getDb();
  const conds = [
    eq(attendanceRecords.studentId, studentId),
    eq(attendanceRecords.status, "present"),
  ];
  if (since) conds.push(gt(attendanceSessions.sessionDate, since));
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceRecords.sessionId, attendanceSessions.id),
    )
    .where(and(...conds));

  const eventConds = [eq(eventRoster.studentId, studentId), isNotNull(events.postedAt)];
  if (since) eventConds.push(gt(events.eventDate, since));
  const [eventRow] = await db
    .select({ n: sql<number>`sum(${events.classCredit})` })
    .from(eventRoster)
    .innerJoin(events, eq(eventRoster.eventId, events.id))
    .where(and(...eventConds));

  return Number(row?.n ?? 0) + Number(eventRow?.n ?? 0);
}

/** Count of present classes + posted-event credit since the student's last promotion. */
export async function classesSincePromotion(studentId: number): Promise<number> {
  const db = await getDb();
  const [last] = await db
    .select({ d: sql<string>`max(${rankHistory.promotionDate})` })
    .from(rankHistory)
    .where(eq(rankHistory.studentId, studentId));
  return countPresentSince(studentId, last?.d ?? null);
}

/**
 * Count of present classes + posted-event credit since the student last
 * actually tested — a promotion OR a No Change, whichever is more recent.
 * Differs from classesSincePromotion for a No Change student: they tested
 * (and the clock should reset) but didn't get a new rank_history row.
 */
export async function classesSinceLastTesting(studentId: number): Promise<{ count: number; since: string | null }> {
  const db = await getDb();
  const [promoted] = await db
    .select({ d: sql<string>`max(${rankHistory.promotionDate})` })
    .from(rankHistory)
    .where(eq(rankHistory.studentId, studentId));
  const [noChange] = await db
    .select({ d: sql<string>`max(${noChangeHistory.testDate})` })
    .from(noChangeHistory)
    .where(eq(noChangeHistory.studentId, studentId));
  const since = [promoted?.d, noChange?.d].filter((d): d is string => Boolean(d)).sort().pop() ?? null;
  return { count: await countPresentSince(studentId, since), since };
}

// ----------------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------------

/** "Upcoming" means scheduled within the next 4 weeks (inclusive of today). */
export const UPCOMING_DAYS = 28;

export interface DashboardStats {
  activeTotal: number;
  tiger: number;
  regular: number;
  black: number;
  permissionToTest: number;
  upcomingEvents: number;
  onTrial: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const all = await listStudents();
  const active = all.filter((s) => s.isActive);
  const t = today();
  const end = addDays(t, UPCOMING_DAYS);
  const evs = await listEvents();
  return {
    activeTotal: active.length,
    tiger: active.filter((s) => s.track === "tiger").length,
    regular: active.filter((s) => s.track === "regular").length,
    black: active.filter((s) => s.rank.degree != null).length,
    permissionToTest: active.filter((s) => s.permissionToTest).length,
    upcomingEvents: evs.filter((e) => e.isActive && e.eventDate >= t && e.eventDate <= end).length,
    onTrial: active.filter((s) => s.trialStartDate != null).length,
  };
}

export interface UpcomingItem {
  kind: "event" | "testing";
  id: number;
  name: string;
  typeLabel: string;
  date: string;
}

/**
 * Events and belt testings scheduled within the next `withinDays` (default 4
 * weeks), soonest first. Testing = the active cycle's testing day (testing_date,
 * or the cycle end date if that isn't set yet).
 */
export async function getUpcomingAgenda(withinDays = UPCOMING_DAYS): Promise<UpcomingItem[]> {
  const t = today();
  const end = addDays(t, withinDays);
  const items: UpcomingItem[] = [];

  for (const e of await listEvents()) {
    if (e.isActive && e.eventDate >= t && e.eventDate <= end) {
      items.push({ kind: "event", id: e.id, name: e.name, typeLabel: e.eventType, date: e.eventDate });
    }
  }

  const cycle = await getCurrentCycle();
  const testDay = cycle.testingDate ?? cycle.endDate;
  if (testDay >= t && testDay <= end) {
    items.push({ kind: "testing", id: cycle.id, name: "Belt Testing", typeLabel: "Testing", date: testDay });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// ----------------------------------------------------------------------------
// Trials (6-week trial period per student) + dashboard alerts
// ----------------------------------------------------------------------------

const TRIAL_DAYS = 42; // 6 weeks
const ABSENCE_DAYS = 14;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso + "T00:00:00").getTime() - new Date(fromIso + "T00:00:00").getTime();
  return Math.round(ms / 86_400_000);
}

export interface TrialRow extends StudentRow {
  trialStart: string;
  trialEnd: string;
  daysLeft: number;
}

/** Put a student on a trial (start date) or take them off it (null). */
export async function setTrial(studentId: number, startDate: string | null): Promise<void> {
  const db = await getDb();
  const [current] = await db.select({ trial: students.trialStartDate }).from(students).where(eq(students.id, studentId));
  await syncTrialHistory(studentId, current?.trial ?? null, startDate);
  await db
    .update(students)
    .set({ trialStartDate: startDate, isStarterStudent: startDate != null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(students.id, studentId));
}

/** Active students currently on a trial, soonest-ending first. */
export async function listTrialStudents(): Promise<TrialRow[]> {
  const all = await listStudents();
  const t = today();
  return all
    .filter((s) => s.isActive && s.trialStartDate)
    .map((s) => {
      const trialEnd = addDays(s.trialStartDate as string, TRIAL_DAYS);
      return { ...s, trialStart: s.trialStartDate as string, trialEnd, daysLeft: daysBetween(t, trialEnd) };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface DashboardAlerts {
  trialsEndingSoon: { id: number; name: string; daysLeft: number }[];
  recurringAbsences: { id: number; name: string; lastPresent: string }[];
  specialTestsUpcoming: { id: number; name: string; date: string; timing: "Early" | "Late" | "Same day" }[];
}

/** Trials ending within a week + active students who attended before but not in 14 days. */
export async function getDashboardAlerts(): Promise<DashboardAlerts> {
  const t = today();
  const trialsEndingSoon = (await listTrialStudents())
    .filter((s) => s.daysLeft >= 0 && s.daysLeft <= 7)
    .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, daysLeft: s.daysLeft }));

  const db = await getDb();
  const lastRows = await db
    .select({ studentId: attendanceRecords.studentId, last: sql<string>`max(${attendanceSessions.sessionDate})` })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(eq(attendanceRecords.status, "present"))
    .groupBy(attendanceRecords.studentId);
  const lastByStudent = new Map(lastRows.map((r) => [r.studentId, r.last]));
  const cutoff = addDays(t, -ABSENCE_DAYS);

  const all = await listStudents();
  const recurringAbsences = all
    .filter((s) => s.isActive)
    .map((s) => ({ s, last: lastByStudent.get(s.id) }))
    .filter((x) => x.last != null && x.last < cutoff) // attended before, but not recently
    .map((x) => ({ id: x.s.id, name: `${x.s.firstName} ${x.s.lastName}`, lastPresent: x.last as string }))
    .sort((a, b) => a.lastPresent.localeCompare(b.lastPresent));

  const specialTestsUpcoming = (await listSpecialTesters())
    .filter((s) => !s.tested)
    .map((s) => ({ id: s.specialTesterId, name: `${s.firstName} ${s.lastName}`, date: s.testDate, timing: s.timing }));

  return { trialsEndingSoon, recurringAbsences, specialTestsUpcoming };
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

// ----------------------------------------------------------------------------
// Inventory
// ----------------------------------------------------------------------------

export interface InventorySectionWithItems {
  section: InventorySection;
  items: InventoryItem[];
}

export async function listInventory(): Promise<InventorySectionWithItems[]> {
  const db = await getDb();
  const sections = await db
    .select()
    .from(inventorySections)
    .orderBy(asc(inventorySections.sortOrder));
  const items = await db
    .select()
    .from(inventoryItems)
    .orderBy(asc(inventoryItems.sectionId), asc(inventoryItems.sortOrder));
  return sections.map((section) => ({
    section,
    items: items.filter((i) => i.sectionId === section.id),
  }));
}

async function touchSection(sectionId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(inventorySections)
    .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(inventorySections.id, sectionId));
}

export async function updateInventoryItem(
  itemId: number,
  patch: Partial<{ name: string; size: string | null; inStock: number; toOrder: number }>,
): Promise<void> {
  const db = await getDb();
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) return;
  await db
    .update(inventoryItems)
    .set({ ...patch, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(inventoryItems.id, itemId));
  await touchSection(item.sectionId);
}

export async function addInventoryItem(
  sectionId: number,
  name: string,
  size: string | null,
): Promise<number> {
  const db = await getDb();
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${inventoryItems.sortOrder}), -1)` })
    .from(inventoryItems)
    .where(eq(inventoryItems.sectionId, sectionId));
  const [row] = await db
    .insert(inventoryItems)
    .values({ sectionId, name, size, sortOrder: Number(max?.m ?? -1) + 1 })
    .returning({ id: inventoryItems.id });
  await touchSection(sectionId);
  return row.id;
}

/**
 * Add one or more rows for a single item name — one row per size, so a multi-size
 * item (e.g. a belt color in sizes 1–7) keeps the same grouped layout as the rest.
 * With no sizes, adds a single row with null size. Returns the new item ids.
 */
export async function addInventoryItems(
  sectionId: number,
  name: string,
  sizes: (string | null)[],
): Promise<number[]> {
  const db = await getDb();
  const [max] = await db
    .select({ m: sql<number>`coalesce(max(${inventoryItems.sortOrder}), -1)` })
    .from(inventoryItems)
    .where(eq(inventoryItems.sectionId, sectionId));
  let order = Number(max?.m ?? -1);
  const ids: number[] = [];
  for (const size of sizes.length ? sizes : [null]) {
    order += 1;
    const [row] = await db
      .insert(inventoryItems)
      .values({ sectionId, name, size, sortOrder: order })
      .returning({ id: inventoryItems.id });
    ids.push(row.id);
  }
  await touchSection(sectionId);
  return ids;
}

/** Zero out every item's inStock or toOrder count within one section. */
export async function clearInventoryColumn(
  sectionId: number,
  field: "inStock" | "toOrder",
): Promise<void> {
  const db = await getDb();
  await db
    .update(inventoryItems)
    .set({ [field]: 0, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(inventoryItems.sectionId, sectionId));
  await touchSection(sectionId);
}

export async function deleteInventoryItem(itemId: number): Promise<void> {
  const db = await getDb();
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) return;
  await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));
  await touchSection(item.sectionId);
}

// ----------------------------------------------------------------------------
// Statistics
// ----------------------------------------------------------------------------

function mean(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** "Tiger Cubs" / "Jr." / "Adult" bucket for age & tenure breakdowns. */
function studentGroup(s: Pick<Student, "track" | "ageGroup">): string {
  if (s.track === "tiger") return "Tiger Cubs";
  return s.ageGroup === "adult" ? "Adult" : "Jr.";
}

export type TrackFilter = "all" | "tiger" | "regular";
export type AgeGroupFilter = "all" | "jr" | "adult";

/**
 * Shared filter for the Statistics tab. Each stats function only reads the
 * fields relevant to it (e.g. classTypes is ignored by roster/event stats) so
 * one filter object can drive every section, and two of them side by side
 * ("Period A" / "Period B") drive the compare view.
 */
export interface StatsFilter {
  start: string;
  end: string;
  classTypes: string[]; // empty = all class types
  track: TrackFilter;
  ageGroup: AgeGroupFilter;
}

function matchesRosterFilter(s: Pick<StudentRow, "track" | "ageGroup">, f: Pick<StatsFilter, "track" | "ageGroup">): boolean {
  if (f.track !== "all" && s.track !== f.track) return false;
  if (f.ageGroup !== "all") {
    if (s.track === "tiger") return false; // Tiger Cubs aren't Jr. or Adult
    if (s.ageGroup !== f.ageGroup) return false;
  }
  return true;
}

export interface GroupStat {
  group: string;
  count: number;
  avg: number | null;
  median: number | null;
}

export interface RankDistributionRow {
  rankId: number;
  name: string;
  sortOrder: number;
  count: number;
}

export interface RosterStats {
  activeTotal: number;
  totalEverEnrolled: number;
  byTrack: { track: string; label: string; count: number }[];
  ageOverall: GroupStat;
  ageByGroup: GroupStat[];
  membershipYearsOverall: GroupStat;
  membershipYearsByGroup: GroupStat[];
  beltDistribution: { track: string; label: string; rows: RankDistributionRow[] }[];
  avgRankPosition: { track: string; label: string; avgPosition: number; totalRanks: number; nearestRankName: string }[];
  trialRetention: { everTrial: number; stillActive: number; rate: number | null };
  enrollmentByMonth: { key: string; label: string; count: number }[];
}

/**
 * Roster-wide demographics for the Statistics tab: age, membership tenure,
 * belt distribution, and enrollment trend. Age/tenure are also split into
 * Tiger Cubs / Jr. / Adult groups since a single blended average across a
 * 4-year-old's age and an adult's age isn't very meaningful on its own.
 * `filter.track`/`filter.ageGroup` scope everything except `byTrack`, which
 * stays a whole-school reference number regardless of the filter. `filter.start`/
 * `filter.end` scope the enrollment trend and which trial starts count toward
 * retention; they don't affect the (inherently point-in-time) roster snapshot.
 */
export async function getRosterStats(filter: StatsFilter): Promise<RosterStats> {
  const everyone = await listStudents(); // every student ever, any status
  const activeUnfiltered = everyone.filter((s) => s.isActive);
  const all = everyone.filter((s) => matchesRosterFilter(s, filter));
  const active = all.filter((s) => s.isActive);
  const t = today();
  const groupNames = ["Tiger Cubs", "Jr.", "Adult"];

  const ageYears = (s: StudentRow) => ageFromDob(s.dateOfBirth);
  const tenureYears = (s: StudentRow) => daysBetween(s.joinDate, t) / 365.25;

  const groupStats = (pick: (s: StudentRow) => number | null): GroupStat[] =>
    groupNames.map((group) => {
      const nums = active.filter((s) => studentGroup(s) === group).map(pick).filter((n): n is number => n != null);
      return { group, count: nums.length, avg: mean(nums), median: median(nums) };
    });

  const ageNums = active.map(ageYears).filter((n): n is number => n != null);
  const tenureNums = active.map(tenureYears);

  const ranks = await listBeltRanks();
  // An age-group filter always excludes Tiger Cubs (see matchesRosterFilter), so
  // don't show an always-empty Tiger Cubs card in that case.
  const tracksToShow: ("tiger" | "regular")[] =
    filter.ageGroup !== "all" ? ["regular"] : filter.track === "all" ? ["tiger", "regular"] : [filter.track];
  const beltDistribution = tracksToShow.map((track) => {
    const trackRanks = ranks.filter((r) => r.track === track).sort((a, b) => a.sortOrder - b.sortOrder);
    const countByRank = new Map<number, number>();
    for (const s of active) if (s.track === track) countByRank.set(s.beltRankId, (countByRank.get(s.beltRankId) ?? 0) + 1);
    return {
      track,
      label: track === "tiger" ? "Tiger Cubs" : "Jr./Adult",
      rows: trackRanks.map((r) => ({ rankId: r.id, name: r.name, sortOrder: r.sortOrder, count: countByRank.get(r.id) ?? 0 })),
    };
  });

  const avgRankPosition = beltDistribution.map(({ track, label, rows }) => {
    const totalStudents = rows.reduce((sum, r) => sum + r.count, 0);
    const avgPosition = totalStudents > 0 ? rows.reduce((sum, r) => sum + r.sortOrder * r.count, 0) / totalStudents : 0;
    const nearest = rows.reduce((best, r) => (Math.abs(r.sortOrder - avgPosition) < Math.abs(best.sortOrder - avgPosition) ? r : best), rows[0]);
    return { track, label, avgPosition, totalRanks: rows.length, nearestRankName: nearest?.name ?? "—" };
  });

  const everTrial = all.filter((s) => {
    if (s.trialStartDate != null) return s.trialStartDate >= filter.start && s.trialStartDate <= filter.end;
    return s.isStarterStudent; // legacy row with no recorded start date -- can't range-filter it, so just include it
  });
  const trialRetention = {
    everTrial: everTrial.length,
    stillActive: everTrial.filter((s) => s.isActive).length,
    rate: everTrial.length ? everTrial.filter((s) => s.isActive).length / everTrial.length : null,
  };

  const monthKeys = monthKeysBetween(filter.start, filter.end);
  const enrollmentByMonth = monthKeys.map((key) => ({
    key,
    label: monthLabel(key),
    count: all.filter((s) => s.joinDate.slice(0, 7) === key).length,
  }));

  return {
    activeTotal: active.length,
    totalEverEnrolled: all.length,
    byTrack: [
      { track: "tiger", label: "Tiger Cubs", count: activeUnfiltered.filter((s) => s.track === "tiger").length },
      { track: "regular", label: "Jr./Adult", count: activeUnfiltered.filter((s) => s.track === "regular").length },
    ],
    ageOverall: { group: "All active", count: ageNums.length, avg: mean(ageNums), median: median(ageNums) },
    ageByGroup: groupStats(ageYears),
    membershipYearsOverall: { group: "All active", count: tenureNums.length, avg: mean(tenureNums), median: median(tenureNums) },
    membershipYearsByGroup: groupStats(tenureYears),
    beltDistribution,
    avgRankPosition,
    trialRetention,
    enrollmentByMonth,
  };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Display Monday through Sunday (a dojang's week runs Mon-Sat with Sunday off, so
// Sunday reads more naturally last than first).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
// Defensive cap on generated month/week buckets -- these ranges come from a
// plain <input type="date"> pair, so a mis-typed year (e.g. "9999") shouldn't
// be able to spin the loop below into generating tens of thousands of keys.
const MAX_PERIOD_BUCKETS = 1200;

function localDate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** The Monday on or before `iso`, as an ISO date string. */
function mondayOf(iso: string): string {
  const dow = localDate(iso).getDay(); // 0=Sun..6=Sat
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

/** Every "YYYY-MM" month key from `start` through `end`, inclusive. */
function monthKeysBetween(start: string, end: string): string[] {
  if (end < start) return [];
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const keys: string[] = [];
  let y = sy, m = sm;
  while ((y < ey || (y === ey && m <= em)) && keys.length < MAX_PERIOD_BUCKETS) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
/** Every Monday from `start`'s week through `end`'s week, inclusive. */
function weekKeysBetween(start: string, end: string): string[] {
  if (end < start) return [];
  const lastMonday = mondayOf(end);
  const keys: string[] = [];
  let cur = mondayOf(start);
  while (cur <= lastMonday && keys.length < MAX_PERIOD_BUCKETS) {
    keys.push(cur);
    cur = addDays(cur, 7);
  }
  return keys;
}
function weekLabel(mondayIso: string): string {
  return `Wk of ${localDate(mondayIso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export interface RateRow {
  key: string;
  label: string;
  sessions: number;
  present: number;
  avgPerSession: number;
}

export interface ClassDayRow {
  classType: string;
  classLabel: string;
  day: string;
  sessions: number;
  present: number;
  avgPerSession: number;
}

export interface AttendanceStats {
  byMonth: RateRow[];
  byWeek: RateRow[];
  byClassType: RateRow[];
  byDayOfWeek: RateRow[];
  classByDay: ClassDayRow[];
}

function classLabel(classType: string): string {
  return classType === "legacy" ? "Legacy (imported)" : CLASS_TYPE_LABELS[classType as ClassType] ?? classType;
}

/** Natural class progression (Tiger -> Jr -> Adult -> Private), legacy last, for display ordering. */
function classTypeSortKey(classType: string): number {
  const i = CLASS_TYPES.indexOf(classType as ClassType);
  return i === -1 ? CLASS_TYPES.length : i;
}

/**
 * Attendance breakdowns for the Statistics tab, all scoped to `filter.start`..
 * `filter.end` and (if non-empty) `filter.classTypes`: monthly and weekly
 * trends spanning the range, by class type, by day of week, and the
 * class-type x day-of-week combination (which class runs strongest on which day).
 */
export async function getAttendanceStats(filter: StatsFilter): Promise<AttendanceStats> {
  const db = await getDb();
  const conds = [gte(attendanceSessions.sessionDate, filter.start), lte(attendanceSessions.sessionDate, filter.end)];
  if (filter.classTypes.length) conds.push(inArray(attendanceSessions.classType, filter.classTypes));
  const sessions = await db
    .select({ id: attendanceSessions.id, date: attendanceSessions.sessionDate, classType: attendanceSessions.classType })
    .from(attendanceSessions)
    .where(and(...conds));
  const presentRows = await db
    .select({ sessionId: attendanceRecords.sessionId, n: sql<number>`count(*)` })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.status, "present"))
    .groupBy(attendanceRecords.sessionId);
  const presentBySession = new Map(presentRows.map((r) => [r.sessionId, Number(r.n)]));

  const rows = sessions.map((s) => ({
    date: s.date,
    classType: s.classType,
    present: presentBySession.get(s.id) ?? 0,
  }));

  const aggregate = (
    keyFn: (r: (typeof rows)[number]) => string,
    labelFn: (key: string) => string,
    keys?: string[],
  ): RateRow[] => {
    const byKey = new Map<string, { sessions: number; present: number }>();
    for (const r of rows) {
      const k = keyFn(r);
      const cur = byKey.get(k) ?? { sessions: 0, present: 0 };
      cur.sessions += 1;
      cur.present += r.present;
      byKey.set(k, cur);
    }
    const outKeys = keys ?? [...byKey.keys()].sort();
    return outKeys.map((k) => {
      const v = byKey.get(k) ?? { sessions: 0, present: 0 };
      return { key: k, label: labelFn(k), sessions: v.sessions, present: v.present, avgPerSession: v.sessions ? v.present / v.sessions : 0 };
    });
  };

  const byMonth = aggregate((r) => r.date.slice(0, 7), monthLabel, monthKeysBetween(filter.start, filter.end));
  const byWeek = aggregate((r) => mondayOf(r.date), weekLabel, weekKeysBetween(filter.start, filter.end));
  const classTypesPresent = [...new Set(rows.map((r) => r.classType))].sort((a, b) => classTypeSortKey(a) - classTypeSortKey(b));
  const byClassType = aggregate((r) => r.classType, classLabel, classTypesPresent);
  const byDayOfWeek = aggregate(
    (r) => String(localDate(r.date).getDay()),
    (k) => DAY_NAMES[Number(k)],
    DAY_ORDER.map(String),
  );

  const classByDayMap = new Map<string, { sessions: number; present: number }>();
  for (const r of rows) {
    const k = `${r.classType}|${localDate(r.date).getDay()}`;
    const cur = classByDayMap.get(k) ?? { sessions: 0, present: 0 };
    cur.sessions += 1;
    cur.present += r.present;
    classByDayMap.set(k, cur);
  }
  const classByDay: ClassDayRow[] = [];
  for (const classType of classTypesPresent) {
    for (const dow of DAY_ORDER) {
      const v = classByDayMap.get(`${classType}|${dow}`) ?? { sessions: 0, present: 0 };
      classByDay.push({
        classType,
        classLabel: classLabel(classType),
        day: DAY_NAMES[dow],
        sessions: v.sessions,
        present: v.present,
        avgPerSession: v.sessions ? v.present / v.sessions : 0,
      });
    }
  }

  return { byMonth, byWeek, byClassType, byDayOfWeek, classByDay };
}

export interface SizeStat {
  count: number;
  avg: number | null;
  median: number | null;
  sizes: number[];
}

function sizeStat(sizes: number[]): SizeStat {
  return { count: sizes.length, avg: mean(sizes), median: median(sizes), sizes };
}

/** A date with at least this many students promoted or marked No Change counts as a testing day; fewer is a make-up or individual promotion. */
export const MIN_TESTING_SIZE = 20;

export interface EventStats {
  /** Students promoted or marked No Change on the same day, for testing days only (MIN_TESTING_SIZE+ students). */
  testingSize: SizeStat;
  /** Dates with promotions but too few students to be a testing (make-ups, late tests, individual promotions). */
  smallerPromotionDates: { dates: number; students: number };
  promotionRate: { promoted: number; noChange: number; rate: number | null };
  eventSizeByType: { eventType: string; stat: SizeStat }[];
}

/**
 * Testing and event size stats within `filter.start`..`filter.end`. Testing
 * size has no direct roster to count (belt testing isn't an event type --
 * see docs/schema.md), so it's inferred by grouping rank_history promotions +
 * no_change_history rows by date, counting each student once per date (a Tiger
 * Cub graduating is two rows). Only dates with MIN_TESTING_SIZE+ students count
 * as a testing: the history is full of one-off promotions on their own dates,
 * which would otherwise drag the average and median far below a real testing's
 * size. Event size (tournaments, seminars, etc.) uses posted events' roster counts.
 */
export async function getEventStats(filter: StatsFilter): Promise<EventStats> {
  const db = await getDb();

  const promotions = await db
    .select({ studentId: rankHistory.studentId, date: rankHistory.promotionDate })
    .from(rankHistory)
    .where(and(gte(rankHistory.promotionDate, filter.start), lte(rankHistory.promotionDate, filter.end)));
  const noChanges = await db
    .select({ studentId: noChangeHistory.studentId, date: noChangeHistory.testDate })
    .from(noChangeHistory)
    .where(and(gte(noChangeHistory.testDate, filter.start), lte(noChangeHistory.testDate, filter.end)));
  const promoted = new Set(promotions.map((p) => `${p.studentId}|${p.date}`));
  const noChange = new Set(noChanges.map((n) => `${n.studentId}|${n.date}`));
  const processedByDate = new Map<string, Set<number>>();
  for (const p of [...promotions, ...noChanges]) {
    if (!processedByDate.has(p.date)) processedByDate.set(p.date, new Set());
    processedByDate.get(p.date)!.add(p.studentId);
  }
  const sizes = [...processedByDate.values()].map((set) => set.size);
  const testingSize = sizeStat(sizes.filter((n) => n >= MIN_TESTING_SIZE));
  const smaller = sizes.filter((n) => n < MIN_TESTING_SIZE);
  const smallerPromotionDates = { dates: smaller.length, students: smaller.reduce((a, n) => a + n, 0) };

  const promotionRate = {
    promoted: promoted.size,
    noChange: noChange.size,
    rate: promoted.size + noChange.size > 0 ? promoted.size / (promoted.size + noChange.size) : null,
  };


  const postedEvents = await db
    .select({ id: events.id, eventType: events.eventType })
    .from(events)
    .where(and(isNotNull(events.postedAt), gte(events.eventDate, filter.start), lte(events.eventDate, filter.end)));
  const rosterCounts = await db
    .select({ eventId: eventRoster.eventId, n: sql<number>`count(*)` })
    .from(eventRoster)
    .groupBy(eventRoster.eventId);
  const countByEvent = new Map(rosterCounts.map((r) => [r.eventId, Number(r.n)]));

  const sizesByType = new Map<string, number[]>();
  for (const e of postedEvents) {
    if (!sizesByType.has(e.eventType)) sizesByType.set(e.eventType, []);
    sizesByType.get(e.eventType)!.push(countByEvent.get(e.id) ?? 0);
  }
  const eventTypeSortKey = (t: string) => {
    const i = (EVENT_TYPES as readonly string[]).indexOf(t);
    return i === -1 ? EVENT_TYPES.length : i;
  };
  const eventSizeByType = [...sizesByType.entries()]
    .sort(([a], [b]) => eventTypeSortKey(a) - eventTypeSortKey(b))
    .map(([eventType, sizes]) => ({ eventType, stat: sizeStat(sizes) }));

  return { testingSize, smallerPromotionDates, promotionRate, eventSizeByType };
}

/** Earliest date with any real activity (attendance, enrollment, or events) -- backs the "All time" range preset. */
export async function getEarliestActivityDate(): Promise<string> {
  const db = await getDb();
  const [a] = await db.select({ d: sql<string | null>`min(${attendanceSessions.sessionDate})` }).from(attendanceSessions);
  const [b] = await db.select({ d: sql<string | null>`min(${students.joinDate})` }).from(students);
  const [c] = await db.select({ d: sql<string | null>`min(${events.eventDate})` }).from(events);
  const dates = [a?.d, b?.d, c?.d].filter((d): d is string => Boolean(d));
  return dates.length ? dates.sort()[0] : today();
}

// ----------------------------------------------------------------------------
// Class slots (optional schedule details: start time + capacity per class x weekday)
// ----------------------------------------------------------------------------

export async function listClassSlots(): Promise<ClassSlot[]> {
  const db = await getDb();
  return db.select().from(classSlots).orderBy(asc(classSlots.weekday), asc(classSlots.startTime));
}

/** Add or update the slot for (classType, weekday). */
export async function saveClassSlot(slot: {
  classType: string;
  weekday: number;
  startTime: string | null;
  capacity: number | null;
}): Promise<void> {
  const db = await getDb();
  await db
    .insert(classSlots)
    .values(slot)
    .onConflictDoUpdate({
      target: [classSlots.classType, classSlots.weekday],
      set: { startTime: slot.startTime, capacity: slot.capacity },
    });
}

export async function deleteClassSlot(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(classSlots).where(eq(classSlots.id, id));
}

// ----------------------------------------------------------------------------
// Reports (the Reports tab). Each function fetches plain rows and hands them to
// the pure, separately-tested math in src/lib/reports.ts. Pass a shared `base`
// (see loadReportBase) to run several reports off one load of the students.
// ----------------------------------------------------------------------------

export interface AttendanceSpan {
  first: string;
  last: string;
  visits: number;
}

export interface ReportBase {
  asOf: string;
  students: StudentRow[];
  spans: Map<number, AttendanceSpan>;
}

/** Every student plus, for each, their first/last attended class and total visits (never counting future-dated sessions). */
export async function loadReportBase(): Promise<ReportBase> {
  const asOf = today();
  const db = await getDb();
  const students = await listStudents();
  const rows = await db
    .select({
      studentId: attendanceRecords.studentId,
      first: sql<string>`min(${attendanceSessions.sessionDate})`.as("first_seen"),
      last: sql<string>`max(${attendanceSessions.sessionDate})`.as("last_seen"),
      visits: sql<number>`count(*)`.as("visit_count"),
    })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(and(eq(attendanceRecords.status, "present"), lte(attendanceSessions.sessionDate, asOf)))
    .groupBy(attendanceRecords.studentId);
  return {
    asOf,
    students,
    spans: new Map(rows.map((r) => [r.studentId, { first: r.first, last: r.last, visits: Number(r.visits) }])),
  };
}

function lifecycleOf(b: ReportBase): LifecycleStudent[] {
  return b.students.map((s) => {
    const span = b.spans.get(s.id);
    return {
      id: s.id,
      name: fullName(s),
      joinDate: s.joinDate,
      isActive: s.isActive,
      leftDate: s.leftDate,
      lastSeen: span?.last ?? null,
      attended: span?.visits ?? 0,
    };
  });
}

function rankInfoOf(r: BeltRank): RankInfo {
  return { id: r.id, name: r.name, track: r.track, sortOrder: r.sortOrder, classGroup: r.classGroup, degree: r.degree, colorHex: r.colorHex };
}

export type ReportWindow = "1y" | "3y" | "5y" | "all";

/** Start date of a "last N years" window, or undefined for all time. */
export function windowStartOf(asOf: string, w: ReportWindow): string | undefined {
  if (w === "all") return undefined;
  return addMonthsIso(asOf, -12 * Number(w[0]));
}

/** Class sessions in [from, to] with how many students were marked present at each. */
async function loadSessionHeadcounts(from: string, to: string): Promise<{ date: string; classType: string; present: number }[]> {
  const db = await getDb();
  const sessions = await db
    .select({ id: attendanceSessions.id, date: attendanceSessions.sessionDate, classType: attendanceSessions.classType })
    .from(attendanceSessions)
    .where(and(gte(attendanceSessions.sessionDate, from), lte(attendanceSessions.sessionDate, to)));
  const counts = await db
    .select({ sessionId: attendanceRecords.sessionId, n: sql<number>`count(*)`.as("present_count") })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(and(eq(attendanceRecords.status, "present"), gte(attendanceSessions.sessionDate, from), lte(attendanceSessions.sessionDate, to)))
    .groupBy(attendanceRecords.sessionId);
  const byId = new Map(counts.map((c) => [c.sessionId, Number(c.n)]));
  return sessions.map((s) => ({ date: s.date, classType: s.classType, present: byId.get(s.id) ?? 0 }));
}

// 1. Attendance trend -------------------------------------------------------

export interface AttendanceTrendReport {
  asOf: string;
  rows: TrendRow[];
  summary: TrendSummary;
  school: { weeks: WeekTotal[]; gaps: { from: string; to: string }[] };
}

export async function getAttendanceTrendReport(base?: ReportBase): Promise<AttendanceTrendReport> {
  const b = base ?? (await loadReportBase());
  const db = await getDb();
  const windowStart = addDaysIso(b.asOf, -(TREND_WEEKS * 7 - 1));
  const visitRows = await db
    .select({ studentId: attendanceRecords.studentId, date: attendanceSessions.sessionDate })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(and(eq(attendanceRecords.status, "present"), gte(attendanceSessions.sessionDate, windowStart), lte(attendanceSessions.sessionDate, b.asOf)));
  const visits = new Map<number, string[]>();
  for (const v of visitRows) {
    if (!visits.has(v.studentId)) visits.set(v.studentId, []);
    visits.get(v.studentId)!.push(v.date);
  }

  const rows = computeTrends(
    b.students.filter((s) => s.isActive).map((s) => ({
      id: s.id,
      name: fullName(s),
      joinDate: s.joinDate,
      lastSeen: b.spans.get(s.id)?.last ?? null,
      visitDates: visits.get(s.id) ?? [],
    })),
    b.asOf,
  );

  const SCHOOL_WEEKS = 26;
  const from = addDaysIso(b.asOf, -7 * SCHOOL_WEEKS);
  const perDay = new Map<string, { sessions: number; present: number }>();
  for (const s of await loadSessionHeadcounts(from, b.asOf)) {
    if (s.present <= 0) continue; // a session nobody was marked at isn't a class that ran
    const cur = perDay.get(s.date) ?? { sessions: 0, present: 0 };
    cur.sessions += 1;
    cur.present += s.present;
    perDay.set(s.date, cur);
  }
  const school = schoolWeeks([...perDay.entries()].map(([date, v]) => ({ date, ...v })), b.asOf, SCHOOL_WEEKS);
  return { asOf: b.asOf, rows, summary: summarizeTrends(rows), school };
}

// 2. Retention --------------------------------------------------------------

export interface RetentionReport extends RetentionResult {
  asOf: string;
  window: ReportWindow;
  countNeverAttended: boolean;
}

export async function getRetentionReport(
  opts: { window: ReportWindow; countNeverAttended: boolean },
  base?: ReportBase,
): Promise<RetentionReport> {
  const b = base ?? (await loadReportBase());
  const result = computeRetention(lifecycleOf(b), b.asOf, {
    joinedFrom: windowStartOf(b.asOf, opts.window),
    countNeverAttended: opts.countNeverAttended,
  });
  return { ...result, asOf: b.asOf, ...opts };
}

// 3. Trial -> member conversion ---------------------------------------------

export interface TrialReport extends TrialSummary {
  /** Earliest trial on record -- trials before this weren't tracked. */
  trackingSince: string | null;
}

export async function getTrialReport(base?: ReportBase): Promise<TrialReport> {
  const b = base ?? (await loadReportBase());
  const db = await getDb();
  const history = await db.select({ studentId: trialHistory.studentId, startDate: trialHistory.startDate }).from(trialHistory);
  const byId = new Map(b.students.map((s) => [s.id, s]));
  const summary = summarizeTrials(
    history.flatMap((h) => {
      const s = byId.get(h.studentId);
      return s ? [{ studentId: s.id, name: fullName(s), startDate: h.startDate, isActive: s.isActive, lastSeen: b.spans.get(s.id)?.last ?? null }] : [];
    }),
    b.asOf,
  );
  return { ...summary, trackingSince: history.map((h) => h.startDate).sort()[0] ?? null };
}

// 4. Belt pyramid -----------------------------------------------------------

export type PyramidFilter = "all" | "tiger" | "jr" | "adult";

export async function getBeltPyramidReport(filter: PyramidFilter = "all", base?: ReportBase): Promise<Pyramid> {
  const b = base ?? (await loadReportBase());
  const ranks = (await listBeltRanks()).map(rankInfoOf);
  const inGroup = (s: StudentRow) =>
    filter === "all" ||
    (filter === "tiger" && s.track === "tiger") ||
    (filter === "jr" && s.track === "regular" && s.ageGroup === "jr") ||
    (filter === "adult" && s.track === "regular" && s.ageGroup === "adult");
  return buildPyramid(ranks, b.students.filter((s) => s.isActive && inGroup(s)).map((s) => s.beltRankId));
}

// 6. Membership length + when students quit ----------------------------------

export interface MembershipReport extends Membership {
  window: ReportWindow;
  /** How far up the ladder students got before leaving, lowest rank first. */
  byRank: { rankId: number; name: string; group: PyramidGroup; colorHex: string; left: number; reached: number | null; rate: number | null }[];
}

export async function getMembershipReport(window: ReportWindow, base?: ReportBase): Promise<MembershipReport> {
  const b = base ?? (await loadReportBase());
  const ranks = (await listBeltRanks()).map(rankInfoOf);
  const byStudent = new Map(b.students.map((s) => [s.id, s]));
  const result = computeMembership(
    lifecycleOf(b).map((s) => {
      const rank = byStudent.get(s.id)!.rank;
      return { ...s, rankId: rank.id, rankTrack: rank.track, rankOrder: rank.sortOrder };
    }),
    b.asOf,
    { leftFrom: windowStartOf(b.asOf, window), ranks },
  );
  const departures = new Map(result.rankDepartures.map((d) => [d.rankId, d]));
  // Passing the ranks people left from keeps any rank past 4th Degree visible when someone left there.
  const byRank = buildPyramid(ranks, Object.keys(result.departedByRank).map(Number)).rows
    .map((r) => ({ name: r.name, group: r.group, colorHex: r.colorHex, ...departures.get(r.rankId)! }))
    .filter((r) => r.left > 0 || r.group !== "Black Belt");
  return { ...result, window, byRank };
}

// 7. Time in rank, stuck students, testing pass rate --------------------------

export interface PassRate {
  /** Testing dates on/after this are counted: the first day the app itself recorded a class, since imported history only ever recorded passes. */
  since: string | null;
  promoted: number;
  noChange: number;
  rate: number | null;
  byDate: { date: string; promoted: number; noChange: number }[];
}

async function loadPassRate(): Promise<PassRate> {
  const db = await getDb();
  const [first] = await db
    .select({ d: sql<string | null>`min(${attendanceSessions.sessionDate})`.as("first_app_class") })
    .from(attendanceSessions)
    .where(ne(attendanceSessions.classType, "legacy"));
  const since = first?.d ?? null;
  if (since === null) return { since, promoted: 0, noChange: 0, rate: null, byDate: [] };

  const promos = await db
    .select({ studentId: rankHistory.studentId, date: rankHistory.promotionDate })
    .from(rankHistory)
    .where(gte(rankHistory.promotionDate, since));
  const ncs = await db
    .select({ studentId: noChangeHistory.studentId, date: noChangeHistory.testDate })
    .from(noChangeHistory)
    .where(gte(noChangeHistory.testDate, since));
  // A Tiger Cub graduating is two rank_history rows for one test; count each student once per date.
  const promoted = new Set(promos.map((p) => `${p.studentId}|${p.date}`));
  const noChange = new Set(ncs.map((n) => `${n.studentId}|${n.date}`));
  const byDate = new Map<string, { promoted: number; noChange: number }>();
  const bump = (key: string, field: "promoted" | "noChange") => {
    const date = key.split("|")[1];
    const cur = byDate.get(date) ?? { promoted: 0, noChange: 0 };
    cur[field] += 1;
    byDate.set(date, cur);
  };
  for (const k of promoted) bump(k, "promoted");
  for (const k of noChange) bump(k, "noChange");
  return {
    since,
    promoted: promoted.size,
    noChange: noChange.size,
    rate: promoted.size + noChange.size ? promoted.size / (promoted.size + noChange.size) : null,
    byDate: [...byDate.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export interface TimeInRankReport {
  window: ReportWindow;
  stuckFactor: number;
  perRank: (RankTime & { name: string; group: PyramidGroup; colorHex: string })[];
  stuck: (StuckStudent & { rankName: string })[];
  passRate: PassRate;
}

export async function getTimeInRankReport(
  window: ReportWindow,
  base?: ReportBase,
  opts: { stuckFactor?: number } = {},
): Promise<TimeInRankReport> {
  const b = base ?? (await loadReportBase());
  const db = await getDb();
  const promoRows = await db
    .select({ id: rankHistory.id, studentId: rankHistory.studentId, toRankId: rankHistory.toRankId, date: rankHistory.promotionDate })
    .from(rankHistory);
  const ranks = (await listBeltRanks()).map(rankInfoOf);
  const ladder = buildPyramid(ranks, []).rows;
  const ladderOf = new Map(ladder.map((r, i) => [r.rankId, { index: i, ...r }]));
  const rankById = new Map(ranks.map((r) => [r.id, r]));

  const { perRank, stuck } = computeTimeInRank(
    promoRows,
    b.students.filter((s) => s.isActive).map((s) => ({
      id: s.id,
      name: fullName(s),
      rankId: s.beltRankId,
      isEntryRank: s.rank.sortOrder === 0,
      joinDate: s.joinDate,
      lastSeen: b.spans.get(s.id)?.last ?? null,
    })),
    b.asOf,
    { since: windowStartOf(b.asOf, window), stuckFactor: opts.stuckFactor },
  );

  return {
    window,
    stuckFactor: opts.stuckFactor ?? 1.5,
    perRank: perRank
      .filter((r) => ladderOf.has(r.rankId))
      .sort((a, c) => ladderOf.get(a.rankId)!.index - ladderOf.get(c.rankId)!.index)
      .map((r) => ({ ...r, name: ladderOf.get(r.rankId)!.name, group: ladderOf.get(r.rankId)!.group, colorHex: ladderOf.get(r.rankId)!.colorHex })),
    stuck: stuck.map((s) => ({ ...s, rankName: rankById.get(s.rankId)?.name ?? "" })),
    passRate: await loadPassRate(),
  };
}

// 8. Demographics -----------------------------------------------------------

export interface DemographicsReport extends Demographics {
  /** Active students with no gender recorded yet, for quick fill-in. */
  missingGender: { id: number; name: string; age: number | null }[];
}

export async function getDemographicsReport(base?: ReportBase): Promise<DemographicsReport> {
  const b = base ?? (await loadReportBase());
  const active = b.students.filter((s) => s.isActive);
  const result = computeDemographics(
    active.map((s) => ({
      id: s.id,
      name: fullName(s),
      dateOfBirth: s.dateOfBirth,
      gender: s.gender,
      phone: s.phone,
      email: s.email,
      guardian1Phone: s.guardian1Phone,
      guardian1Email: s.guardian1Email,
      guardian2Phone: s.guardian2Phone,
      guardian2Email: s.guardian2Email,
    })),
    b.asOf,
  );
  return {
    ...result,
    missingGender: active.filter((s) => !s.gender).map((s) => ({ id: s.id, name: fullName(s), age: ageFromDob(s.dateOfBirth) })),
  };
}

// 9. Enrollment flow --------------------------------------------------------

export interface EnrollmentFlowReport {
  months: number;
  flow: FlowMonth[];
  /** Former students with no attendance and no leave date: counted as never having enrolled. */
  undatedDepartures: number;
}

export async function getEnrollmentFlowReport(months: number, base?: ReportBase): Promise<EnrollmentFlowReport> {
  const b = base ?? (await loadReportBase());
  const life = lifecycleOf(b);
  return {
    months,
    flow: computeEnrollmentFlow(life, b.asOf, months),
    undatedDepartures: life.filter((s) => !s.isActive && s.joinDate >= "1950-01-01" && s.attended === 0 && !s.leftDate).length,
  };
}

// 5. Class slots ------------------------------------------------------------

export interface ClassSlotReport {
  from: string;
  to: string;
  rows: SlotRow[];
}

export async function getClassSlotReport(days: number): Promise<ClassSlotReport> {
  const to = today();
  const from = addDaysIso(to, -days);
  const [sessions, configs] = await Promise.all([loadSessionHeadcounts(from, to), listClassSlots()]);
  return { from, to, rows: computeSlots(sessions, configs, from, to) };
}

// Scorecard -----------------------------------------------------------------

export interface Scorecard {
  asOf: string;
  attendance: TrendSummary;
  retention: RetentionResult["marks"];
  trials: Pick<TrialReport, "inTrial" | "deciding" | "converted" | "dropped" | "rate" | "trackingSince">;
  pyramid: Pick<Pyramid, "rows" | "groups" | "total" | "bulges">;
  membership: { activeAvgMonths: number | null; departedMedianMonths: number | null; peak: string | null };
  timeInRank: { stuck: number; passRate: number | null; testings: number };
  demographics: { kids: number; adults: number; kidsPerAdult: number | null; missingGender: number; total: number };
  enrollment: { signups: number; lost: number; net: number };
  slots: { fullest: SlotRow | null; lightest: SlotRow | null; anyCapacity: boolean };
}

/** The numbers for the Reports scorecard, computed off a single load of the students. */
export async function getReportsScorecard(): Promise<Scorecard> {
  const base = await loadReportBase();
  const [trend, retention, trials, pyramid, membership, tir, demo, flow, slots] = await Promise.all([
    getAttendanceTrendReport(base),
    getRetentionReport({ window: "3y", countNeverAttended: false }, base),
    getTrialReport(base),
    getBeltPyramidReport("all", base),
    getMembershipReport("5y", base),
    getTimeInRankReport("5y", base),
    getDemographicsReport(base),
    getEnrollmentFlowReport(12, base),
    getClassSlotReport(90),
  ]);
  const graded = slots.rows.filter((r) => r.utilization !== null && r.sessions > 0);
  return {
    asOf: base.asOf,
    attendance: trend.summary,
    retention: retention.marks,
    trials,
    pyramid,
    membership: { activeAvgMonths: membership.active.avgMonths, departedMedianMonths: membership.departed.medianMonths, peak: membership.peak },
    timeInRank: { stuck: tir.stuck.length, passRate: tir.passRate.rate, testings: tir.passRate.byDate.length },
    demographics: { kids: demo.kids, adults: demo.adults, kidsPerAdult: demo.kidsPerAdult, missingGender: demo.missingGender.length, total: demo.total },
    enrollment: {
      signups: flow.flow.reduce((s, m) => s + m.signups, 0),
      lost: flow.flow.reduce((s, m) => s + m.lost, 0),
      net: flow.flow.reduce((s, m) => s + m.net, 0),
    },
    slots: {
      fullest: graded.length ? graded.reduce((a, r) => (r.utilization! > a.utilization! ? r : a)) : null,
      lightest: graded.length ? graded.reduce((a, r) => (r.utilization! < a.utilization! ? r : a)) : null,
      anyCapacity: slots.rows.some((r) => r.capacity !== null),
    },
  };
}
