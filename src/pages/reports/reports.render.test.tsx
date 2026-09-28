// Renders every Reports screen (server-side, to HTML) against real query results
// and checks nothing comes out broken. There's no browser in the test setup, so
// this is what catches a screen that throws or prints "NaN" instead of a number.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import BetterSqlite3 from "better-sqlite3";
import type { ReactElement } from "react";
import { afterAll, describe, expect, it } from "vitest";

import { __setTestDb, createDb } from "@/db/client";
import {
  createEvent, createStudent, getAttendanceTrendReport, getBeltPyramidReport, getClassSlotReport, getDemographicsReport,
  getEnrollmentFlowReport, getMembershipReport, getOrCreateSession, getReportsScorecard, getRetentionReport, getTimeInRankReport,
  getTrialReport, listBeltRanks, markNoChange, postEvent, addToRoster, promoteStudent, saveClassSlot, setAttendance,
  setStudentActive, setStudentGender, getCurrentCycle, updateCycle, type StudentInput,
} from "@/db/repos";
import { addDaysIso } from "@/lib/dates";
import { today } from "@/lib/format";
import { ScorecardBody } from "@/pages/Reports";
import { AttendanceBody, AttendanceReportPage } from "./AttendanceReport";
import { ClassSlotsBody, ClassSlotsReportPage } from "./ClassSlotsReport";
import { DemographicsBody, DemographicsReportPage } from "./DemographicsReport";
import { EnrollmentBody, EnrollmentReportPage } from "./EnrollmentReport";
import { MembershipBody, MembershipReportPage } from "./MembershipReport";
import { PyramidBody, PyramidReportPage } from "./PyramidReport";
import { RetentionBody, RetentionReportPage } from "./RetentionReport";
import { TimeInRankBody, TimeInRankReportPage } from "./TimeInRankReport";
import { TrialBody, TrialReportPage } from "./TrialReport";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "src-tauri", "migrations");

function freshDb() {
  const sqlite = new BetterSqlite3(":memory:");
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(migrationsDir, f), "utf8"));
  }
  __setTestDb(createDb({
    query: async (sql, params) => sqlite.prepare(sql).all(...(params as never[])) as Record<string, unknown>[],
    run: async (sql, params) => { sqlite.prepare(sql).run(...(params as never[])); },
  }));
  return sqlite;
}

const html = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);

/** Every screen, rendered from live query results. */
async function renderAll(): Promise<Record<string, string>> {
  const [trend, ret, retNever, trials, pyr, mem, tir, demo, flow, slots, card] = await Promise.all([
    getAttendanceTrendReport(),
    getRetentionReport({ window: "3y", countNeverAttended: false }),
    getRetentionReport({ window: "all", countNeverAttended: true }),
    getTrialReport(),
    getBeltPyramidReport("all"),
    getMembershipReport("all"),
    getTimeInRankReport("all"),
    getDemographicsReport(),
    getEnrollmentFlowReport(24),
    getClassSlotReport(180),
    getReportsScorecard(),
  ]);
  return {
    "attendance (needs attention)": html(<AttendanceBody data={trend} view="attention" />),
    "attendance (everyone)": html(<AttendanceBody data={trend} view="all" />),
    retention: html(<RetentionBody data={ret} />),
    "retention (with never-attended)": html(<RetentionBody data={retNever} />),
    trials: html(<TrialBody data={trials} />),
    pyramid: html(<PyramidBody p={pyr} />),
    membership: html(<MembershipBody m={mem} />),
    "time in rank": html(<TimeInRankBody r={tir} />),
    demographics: html(<DemographicsBody d={demo} onChanged={() => undefined} />),
    enrollment: html(<EnrollmentBody data={flow} />),
    "class slots": html(<ClassSlotsBody data={slots} showOccasional />),
    "class slots (hiding occasional)": html(<ClassSlotsBody data={slots} showOccasional={false} />),
    scorecard: html(<ScorecardBody c={card} />),
  };
}

function expectClean(pages: Record<string, string>, minLength = 200) {
  for (const [name, out] of Object.entries(pages)) {
    expect(out.length, `${name} rendered nothing`).toBeGreaterThan(minLength);
    for (const bad of ["NaN", "undefined", "Infinity", "[object Object]", "null"]) {
      // Compare on visible text only, so CSS/attribute values can't trigger a false alarm.
      const text = out.replace(/<[^>]*>/g, " ");
      expect(text.includes(bad), `${name} shows "${bad}"`).toBe(false);
    }
  }
}

afterAll(() => __setTestDb(null));

describe("reports screens: empty database", () => {
  it("renders every screen with no students or attendance, without NaN or crashes", async () => {
    freshDb();
    const pages = await renderAll();
    expectClean(pages, 50); // some screens are just a short "nothing here yet" message
    expect(pages.trials).toContain("No trials recorded yet");
    expect(pages.pyramid).toContain("No active students");
    expect(pages.scorecard).toContain("Too early");
    expect(pages["class slots"]).toContain("No classes recorded");
  });
});

describe("reports screens: realistic data", () => {
  const input = (over: Partial<StudentInput>): StudentInput => ({
    firstName: "F", lastName: "L", dateOfBirth: "2014-05-01", phone: null, email: null,
    guardian1Name: null, guardian1Phone: null, guardian1Email: null, guardian2Name: null, guardian2Phone: null, guardian2Email: null,
    emergencyContact: null, track: "regular", ageGroup: "jr", beltRankId: 0, beltSize: null,
    joinDate: "2024-01-01", trialStartDate: null, notes: null, ...over,
  });

  it("renders every screen from seeded data and shows the seeded facts", async () => {
    freshDb();
    const ranks = await listBeltRanks();
    const white = ranks.find((r) => r.track === "regular" && r.sortOrder === 0)!;
    const yellow = ranks.find((r) => r.track === "regular" && r.sortOrder === 1)!;
    const green = ranks.find((r) => r.name === "Green Belt")!;
    const black = ranks.find((r) => r.degree === "1st Degree")!;
    const tigerWhite = ranks.find((r) => r.name === "Tiger Cub White Belt")!;
    const ago = (n: number) => addDaysIso(today(), -n);
    const attend = async (id: number, date: string, type: "adult" | "tiger" | "jr-wy" | "jr-gbp" = "jr-wy") =>
      setAttendance(await getOrCreateSession(date, type), id, "present");

    // A family: two siblings and a parent sharing a phone number.
    const kid1 = await createStudent(input({ firstName: "Ann", lastName: "Reed", dateOfBirth: "2018-03-01", beltRankId: yellow.id, guardian1Phone: "(805) 555-0142", joinDate: ago(400) }));
    const kid2 = await createStudent(input({ firstName: "Ben", lastName: "Reed", dateOfBirth: "2015-09-01", beltRankId: green.id, guardian1Phone: "805-555-0142", joinDate: ago(400) }));
    const parent = await createStudent(input({ firstName: "Cara", lastName: "Reed", dateOfBirth: "1984-06-01", ageGroup: "adult", beltRankId: white.id, phone: "8055550142", joinDate: ago(200) }));
    const cub = await createStudent(input({ firstName: "Dee", lastName: "Cub", dateOfBirth: "2021-08-01", track: "tiger", beltRankId: tigerWhite.id, joinDate: ago(60) }));
    const blackBelt = await createStudent(input({ firstName: "Eli", lastName: "Black", dateOfBirth: "1990-01-01", ageGroup: "adult", beltRankId: black.id, joinDate: ago(2000) }));
    const lapsed = await createStudent(input({ firstName: "Fay", lastName: "Gone", beltRankId: yellow.id, joinDate: ago(500) }));
    const trialing = await createStudent(input({ firstName: "Gus", lastName: "Trial", beltRankId: white.id, trialStartDate: ago(20), joinDate: ago(20) }));
    const graduate = await createStudent(input({ firstName: "Hal", lastName: "Trial", beltRankId: white.id, trialStartDate: ago(90), joinDate: ago(90) }));
    const quitter = await createStudent(input({ firstName: "Ivy", lastName: "Quit", beltRankId: yellow.id, joinDate: ago(300) }));
    const neverCame = await createStudent(input({ firstName: "Jon", lastName: "Ghost", beltRankId: white.id, joinDate: ago(150) }));

    for (let w = 0; w < 12; w++) {
      for (const id of [kid1, kid2, parent, blackBelt]) { await attend(id, ago(w * 7 + 1)); await attend(id, ago(w * 7 + 3), "jr-gbp"); }
    }
    await attend(cub, ago(2), "tiger");
    await attend(lapsed, ago(40), "adult");
    await attend(trialing, ago(5));
    await attend(graduate, ago(3));
    await attend(quitter, ago(250));
    await setStudentActive(quitter, false);
    await setStudentActive(neverCame, false);
    await setStudentGender(kid1, "Female");
    await setStudentGender(kid2, "Male");

    // Promotions on a shared testing day, a miss, and a rank that took a long time.
    await promoteStudent(kid1, { date: ago(100) });
    await promoteStudent(kid1, { date: ago(20) });
    await promoteStudent(kid2, { date: ago(100) });
    await promoteStudent(kid2, { date: ago(30) });
    const cycle = await getCurrentCycle();
    await updateCycle(cycle.id, ago(90), today(), ago(20));
    await markNoChange(cycle.id, parent, "F", null);
    await saveClassSlot({ classType: "jr-wy", weekday: new Date(`${ago(1)}T00:00:00Z`).getUTCDay(), startTime: "17:30", capacity: 8 });
    const eventId = await createEvent({ name: "Demo", eventDate: ago(10), eventTime: null, eventType: "Demo", location: null, notes: null, classCredit: 1 });
    await addToRoster(eventId, kid1);
    await postEvent(eventId);

    const pages = await renderAll();
    expectClean(pages);

    // The seeded facts show up where a person would read them.
    expect(pages["attendance (needs attention)"]).toContain("Fay Gone"); // hasn't attended in 40 days
    expect(pages["attendance (everyone)"]).toContain("Ann Reed");
    expect(pages.trials).toContain("Hal Trial");
    expect(pages.pyramid).toContain("Yellow Belt");
    expect(pages.demographics).toContain("Ann Reed"); // in the family list
    expect(pages.demographics).toContain("Parent + siblings");
    expect(pages.demographics).toContain("Fill in gender for"); // some students still have none
    expect(pages["class slots"]).toContain("5:30 PM");
    expect(pages.membership).toContain("Where on the belt ladder");
    expect(pages.enrollment).toContain("Month by month");
    expect(pages.scorecard).toContain("Watch these first");
  });

  it("renders each page's frame (title and way back) before its data has loaded", () => {
    const pages: [string, ReactElement][] = [
      ["Attendance trends", <AttendanceReportPage />], ["Retention", <RetentionReportPage />], ["Trial conversion", <TrialReportPage />],
      ["Belt pyramid", <PyramidReportPage />], ["Membership length", <MembershipReportPage />], ["Time in rank", <TimeInRankReportPage />],
      ["Demographics", <DemographicsReportPage />], ["Enrollment flow", <EnrollmentReportPage />], ["Class slots", <ClassSlotsReportPage />],
    ];
    for (const [title, el] of pages) {
      const out = html(el);
      expect(out, title).toContain(title);
      expect(out, title).toContain("All reports");
    }
  });
});
