import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
  check,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

import {
  TRACKS,
  AGE_GROUPS,
  STORED_CLASS_TYPES,
  CLASS_GROUPS,
  EVENT_TYPES,
  ATTENDANCE_STATUSES,
} from "./enums";

const enumCheck = (col: string, values: readonly string[]) =>
  sql.raw(`${col} IN (${values.map((v) => `'${v}'`).join(", ")})`);

export const beltRanks = sqliteTable(
  "belt_ranks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    track: text("track").notNull(),
    sortOrder: integer("sort_order").notNull(),
    name: text("name", { length: 100 }).notNull(),
    classGroup: text("class_group"),
    degree: text("degree", { length: 50 }),
    level: text("level", { length: 10 }),
    colorHex: text("color_hex", { length: 7 }).notNull(),
    textHex: text("text_hex", { length: 7 }).notNull(),
    borderHex: text("border_hex", { length: 7 }).notNull(),
    isGraduationRank: integer("is_graduation_rank", { mode: "boolean" })
      .notNull()
      .default(false),
    nextRankId: integer("next_rank_id").references(
      (): AnySQLiteColumn => beltRanks.id
    ),
  },
  (t) => ({
    trackSortUnique: uniqueIndex("belt_ranks_track_sort_uniq").on(
      t.track,
      t.sortOrder
    ),
    classGroupIdx: index("belt_ranks_class_group_idx").on(t.classGroup),
    trackCheck: check("belt_ranks_track_chk", enumCheck("track", TRACKS)),
    classGroupCheckCk: check(
      "belt_ranks_class_group_chk",
      sql.raw(
        `class_group IS NULL OR class_group IN (${CLASS_GROUPS.map(
          (v) => `'${v}'`
        ).join(", ")})`
      )
    ),
  })
);

export const students = sqliteTable(
  "students",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    firstName: text("first_name", { length: 100 }).notNull(),
    lastName: text("last_name", { length: 100 }).notNull(),
    dateOfBirth: text("date_of_birth"),
    phone: text("phone", { length: 30 }),
    email: text("email", { length: 255 }),
    guardian1Name: text("guardian1_name"),
    guardian1Phone: text("guardian1_phone"),
    guardian1Email: text("guardian1_email"),
    guardian2Name: text("guardian2_name"),
    guardian2Phone: text("guardian2_phone"),
    guardian2Email: text("guardian2_email"),
    emergencyContact: text("emergency_contact", { length: 255 }),
    track: text("track").notNull().default("regular"),
    ageGroup: text("age_group").notNull().default("jr"),
    beltRankId: integer("belt_rank_id")
      .notNull()
      .references(() => beltRanks.id),
    beltSize: text("belt_size", { length: 10 }),
    joinDate: text("join_date").notNull(),
    isStarterStudent: integer("is_starter_student", { mode: "boolean" })
      .notNull()
      .default(false),
    trialStartDate: text("trial_start_date"),
    notes: text("notes"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    legacyId: integer("legacy_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    nameIdx: index("students_name_idx").on(t.lastName, t.firstName),
    legacyIdIdx: index("students_legacy_id_idx").on(t.legacyId),
    trackIdx: index("students_track_idx").on(t.track),
    ageGroupIdx: index("students_age_group_idx").on(t.ageGroup),
    beltRankIdx: index("students_belt_rank_idx").on(t.beltRankId),
    activeIdx: index("students_active_idx").on(t.isActive),
    trackCheck: check("students_track_chk", enumCheck("track", TRACKS)),
    ageGroupCheck: check(
      "students_age_group_chk",
      enumCheck("age_group", AGE_GROUPS)
    ),
  })
);

export const rankHistory = sqliteTable(
  "rank_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id),
    fromRankId: integer("from_rank_id").references(() => beltRanks.id),
    toRankId: integer("to_rank_id")
      .notNull()
      .references(() => beltRanks.id),
    trackAtTime: text("track_at_time").notNull(),
    promotionDate: text("promotion_date").notNull(),
    note: text("note", { length: 500 }),
    promotedAtEventId: integer("promoted_at_event_id").references(
      (): AnySQLiteColumn => events.id
    ),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    studentDateIdx: index("rank_history_student_date_idx").on(
      t.studentId,
      t.promotionDate
    ),
    eventIdx: index("rank_history_event_idx").on(t.promotedAtEventId),
    trackCheck: check(
      "rank_history_track_chk",
      enumCheck("track_at_time", TRACKS)
    ),
  })
);

export const studentProgress = sqliteTable("student_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: integer("student_id")
    .notNull()
    .unique()
    .references(() => students.id),
  greenStripe: integer("green_stripe", { mode: "boolean" })
    .notNull()
    .default(false),
  blueStripe: integer("blue_stripe", { mode: "boolean" })
    .notNull()
    .default(false),
  orangeStripe: integer("orange_stripe", { mode: "boolean" })
    .notNull()
    .default(false),
  redStripe: integer("red_stripe", { mode: "boolean" }).notNull().default(false),
  permissionToTest: integer("permission_to_test", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attendanceSessions = sqliteTable(
  "attendance_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionDate: text("session_date").notNull(),
    classType: text("class_type").notNull(),
    notes: text("notes", { length: 500 }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    dateClassUnique: uniqueIndex("attendance_sessions_date_class_uniq").on(
      t.sessionDate,
      t.classType
    ),
    dateIdx: index("attendance_sessions_date_idx").on(t.sessionDate),
    classTypeIdx: index("attendance_sessions_class_type_idx").on(t.classType),
    classTypeCheck: check(
      "attendance_sessions_class_type_chk",
      enumCheck("class_type", STORED_CLASS_TYPES)
    ),
  })
);

export const attendanceRecords = sqliteTable(
  "attendance_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => attendanceSessions.id),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id),
    status: text("status").notNull().default("unmarked"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    sessionStudentUnique: uniqueIndex(
      "attendance_records_session_student_uniq"
    ).on(t.sessionId, t.studentId),
    studentStatusIdx: index("attendance_records_student_status_idx").on(
      t.studentId,
      t.status
    ),
    sessionIdx: index("attendance_records_session_idx").on(t.sessionId),
    statusCheck: check(
      "attendance_records_status_chk",
      enumCheck("status", ATTENDANCE_STATUSES)
    ),
  })
);

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name", { length: 255 }).notNull(),
    eventDate: text("event_date").notNull(),
    eventTime: text("event_time"),
    eventType: text("event_type").notNull(),
    location: text("location", { length: 255 }),
    notes: text("notes"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    dateIdx: index("events_date_idx").on(t.eventDate),
    typeIdx: index("events_type_idx").on(t.eventType),
    typeCheck: check("events_type_chk", enumCheck("event_type", EVENT_TYPES)),
  })
);

export const eventRoster = sqliteTable(
  "event_roster",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id),
    registeredAt: text("registered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    notes: text("notes", { length: 255 }),
  },
  (t) => ({
    eventStudentUnique: uniqueIndex("event_roster_event_student_uniq").on(
      t.eventId,
      t.studentId
    ),
    studentIdx: index("event_roster_student_idx").on(t.studentId),
  })
);

export const starterCourses = sqliteTable(
  "starter_courses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name", { length: 255 }).notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    notes: text("notes"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    endDateIdx: index("starter_courses_end_date_idx").on(t.endDate),
    dateCheck: check(
      "starter_courses_dates_chk",
      sql.raw("end_date >= start_date")
    ),
  })
);

export const starterCourseEnrollment = sqliteTable(
  "starter_course_enrollment",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    courseId: integer("course_id")
      .notNull()
      .references(() => starterCourses.id),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id),
    enrolledAt: text("enrolled_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    courseStudentUnique: uniqueIndex(
      "starter_course_enrollment_course_student_uniq"
    ).on(t.courseId, t.studentId),
    studentIdx: index("starter_course_enrollment_student_idx").on(t.studentId),
  })
);

export const testingCycles = sqliteTable("testing_cycles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  testingDate: text("testing_date"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const testingRegistration = sqliteTable(
  "testing_registration",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => testingCycles.id),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id),
    registeredAt: text("registered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    cycleStudentUnique: uniqueIndex("testing_registration_cycle_student_uniq").on(
      t.cycleId,
      t.studentId,
    ),
    studentIdx: index("testing_registration_student_idx").on(t.studentId),
  }),
);

export const inventorySections = sqliteTable("inventory_sections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sectionId: integer("section_id")
      .notNull()
      .references(() => inventorySections.id),
    name: text("name").notNull(),
    size: text("size"),
    inStock: integer("in_stock").notNull().default(0),
    toOrder: integer("to_order").notNull().default(0),
    sortOrder: integer("sort_order").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    sectionIdx: index("inventory_items_section_idx").on(t.sectionId, t.sortOrder),
  }),
);

export type BeltRank = typeof beltRanks.$inferSelect;
export type Student = typeof students.$inferSelect;
export type RankHistoryEntry = typeof rankHistory.$inferSelect;
export type StudentProgress = typeof studentProgress.$inferSelect;
export type AttendanceSession = typeof attendanceSessions.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type EventRosterEntry = typeof eventRoster.$inferSelect;
export type StarterCourse = typeof starterCourses.$inferSelect;
export type StarterCourseEnrollment = typeof starterCourseEnrollment.$inferSelect;
export type TestingCycle = typeof testingCycles.$inferSelect;
export type TestingRegistration = typeof testingRegistration.$inferSelect;
export type InventorySection = typeof inventorySections.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
