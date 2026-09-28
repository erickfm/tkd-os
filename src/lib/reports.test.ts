import { describe, expect, it } from "vitest";

import { addDaysIso, addMonthsIso, ageOn, daysBetweenIso, endOfMonthKey, mondayOfIso, monthKeysBetweenIso } from "./dates";
import {
  buildPyramid,
  classifyTrial,
  computeDemographics,
  computeEnrollmentFlow,
  computeMembership,
  computeRetention,
  computeSlots,
  computeTimeInRank,
  computeTrends,
  findRecordingGaps,
  leftDateOf,
  schoolWeeks,
  summarizeTrends,
  summarizeTrials,
  type DemographicStudent,
  type LifecycleStudent,
  type MembershipStudent,
  type RankInfo,
} from "./reports";

const ASOF = "2026-09-18"; // a Friday

const daysAgo = (n: number) => addDaysIso(ASOF, -n);

function life(over: Partial<LifecycleStudent> & { id: number }): LifecycleStudent {
  return { name: `S${over.id}`, joinDate: "2025-01-10", isActive: true, leftDate: null, lastSeen: null, attended: 1, ...over };
}

describe("date helpers", () => {
  it("does calendar math without timezone drift", () => {
    expect(addDaysIso("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetweenIso("2026-09-01", "2026-09-18")).toBe(17);
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsIso("2025-11-15", 3)).toBe("2026-02-15");
    expect(mondayOfIso("2026-09-18")).toBe("2026-09-14");
    expect(mondayOfIso("2026-09-20")).toBe("2026-09-14"); // Sunday belongs to the week before
    expect(endOfMonthKey("2026-02")).toBe("2026-02-28");
    expect(monthKeysBetweenIso("2025-11-01", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("computes whole-year age from the birthday, and rejects implausible dates of birth", () => {
    expect(ageOn("2021-09-18", ASOF)).toBe(5); // birthday today
    expect(ageOn("2021-09-19", ASOF)).toBe(4); // birthday tomorrow
    expect(ageOn(null, ASOF)).toBeNull();
    expect(ageOn("1850-01-01", ASOF)).toBeNull();
    expect(ageOn("2030-01-01", ASOF)).toBeNull();
  });
});

describe("leftDateOf", () => {
  it("is the earlier of deactivation and last class, never before joining, and null for active students", () => {
    expect(leftDateOf(life({ id: 1, isActive: true, lastSeen: "2026-01-01" }))).toBeNull();
    // Batch clean-up: deactivated long after they stopped coming.
    expect(leftDateOf(life({ id: 2, isActive: false, leftDate: "2026-09-08", lastSeen: "2025-03-01" }))).toBe("2025-03-01");
    expect(leftDateOf(life({ id: 3, isActive: false, leftDate: "2025-02-01", lastSeen: "2025-03-01" }))).toBe("2025-02-01");
    expect(leftDateOf(life({ id: 4, isActive: false, leftDate: "2025-06-01", lastSeen: null }))).toBe("2025-06-01");
    expect(leftDateOf(life({ id: 5, isActive: false, lastSeen: "2020-01-01", joinDate: "2025-01-10" }))).toBe("2025-01-10");
    expect(leftDateOf(life({ id: 6, isActive: false }))).toBeNull(); // nothing to go on
  });
});

describe("attendance trend", () => {
  const steady = (from: number, to: number) => {
    // two visits in every 7-day window between `from` and `to` days ago
    const out: string[] = [];
    for (let w = Math.floor(from / 7); w * 7 < to; w++) out.push(daysAgo(w * 7 + 1), daysAgo(w * 7 + 3));
    return out;
  };

  it("buckets visits into the last 12 seven-day windows, oldest first", () => {
    const [row] = computeTrends([
      { id: 1, name: "A", joinDate: "2024-01-01", lastSeen: ASOF, visitDates: [daysAgo(0), daysAgo(7), daysAgo(83), daysAgo(84)] },
    ], ASOF);
    expect(row.weeks[11]).toBe(1); // today
    expect(row.weeks[10]).toBe(1); // exactly 7 days ago is the previous window
    expect(row.weeks[0]).toBe(1); // 83 days ago is the oldest window
    expect(row.weeks.reduce((a, b) => a + b, 0)).toBe(3); // 84 days ago falls outside
  });

  it("flags lapsed, never-attended, and sharply dropping students, and sorts the worst first", () => {
    const rows = computeTrends([
      { id: 1, name: "Steady", joinDate: "2024-01-01", lastSeen: daysAgo(1), visitDates: steady(0, 84) },
      // 2 visits/week for 8 weeks, then a single visit in the last 4 weeks
      { id: 2, name: "Dropping", joinDate: "2024-01-01", lastSeen: daysAgo(5), visitDates: [...steady(28, 84), daysAgo(5)] },
      { id: 3, name: "Lapsed", joinDate: "2024-01-01", lastSeen: daysAgo(20), visitDates: [daysAgo(20)] },
      { id: 4, name: "Never", joinDate: daysAgo(100), lastSeen: null, visitDates: [] },
      { id: 5, name: "Brand new", joinDate: daysAgo(3), lastSeen: null, visitDates: [] },
      { id: 6, name: "Recent joiner", joinDate: daysAgo(30), lastSeen: daysAgo(2), visitDates: [daysAgo(2), daysAgo(9)] },
    ], ASOF);

    const status = Object.fromEntries(rows.map((r) => [r.name, r.status]));
    expect(status).toEqual({
      Steady: "ok", Dropping: "dropping", Lapsed: "lapsed", Never: "never", "Brand new": "new", "Recent joiner": "new",
    });
    expect(rows.map((r) => r.name).slice(0, 3)).toEqual(["Lapsed", "Never", "Dropping"]);
    expect(rows.find((r) => r.name === "Lapsed")!.daysSince).toBe(20);
    expect(rows.find((r) => r.name === "Dropping")!.baselineAvg).toBe(2);

    expect(summarizeTrends(rows)).toEqual({ total: 6, lapsed: 1, never: 1, dropping: 1, healthy: 3 });
  });

  it("only calls a student lapsed at 14+ days", () => {
    const rows = computeTrends([
      { id: 1, name: "Thirteen", joinDate: "2024-01-01", lastSeen: daysAgo(13), visitDates: [daysAgo(13)] },
      { id: 2, name: "Fourteen", joinDate: "2024-01-01", lastSeen: daysAgo(14), visitDates: [daysAgo(14)] },
    ], ASOF);
    expect(rows.find((r) => r.name === "Thirteen")!.status).not.toBe("lapsed");
    expect(rows.find((r) => r.name === "Fourteen")!.status).toBe("lapsed");
  });
});

describe("school-wide weekly attendance and recording gaps", () => {
  it("finds a stretch with no recorded classes and greys only the weeks wholly inside it", () => {
    const days = [
      { date: "2026-05-27", sessions: 5, present: 40 },
      { date: "2026-05-29", sessions: 1, present: 4 },
      { date: "2026-06-20", sessions: 5, present: 45 },
      { date: "2026-06-22", sessions: 5, present: 50 },
    ];
    expect(findRecordingGaps(days.map((d) => d.date))).toEqual([{ from: "2026-05-30", to: "2026-06-19" }]);

    const { weeks } = schoolWeeks(days, "2026-06-26", 6);
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-05-18", "2026-05-25", "2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"]);
    expect(weeks.map((w) => w.noData)).toEqual([false, false, true, true, false, false]);
    expect(weeks[1].present).toBe(44); // 05-27 + 05-29 are the same Monday-start week
    expect(weeks[5].present).toBe(50);
  });
});

describe("retention", () => {
  const students: LifecycleStudent[] = [
    life({ id: 1 }), // active since Jan 2025 -> retained at every mark
    life({ id: 2, isActive: false, lastSeen: "2025-02-20" }), // gone before 3 months
    life({ id: 3, isActive: false, lastSeen: "2025-08-01" }), // made 3 and 6 months, not 12
    life({ id: 4, joinDate: "2026-08-01" }), // too new to judge
    life({ id: 5, joinDate: "2025-03-01", isActive: false, attended: 0 }), // signed up, never came
    life({ id: 6, joinDate: "0200-01-14", isActive: false, lastSeen: "2001-01-01" }), // bad data
  ];

  it("measures who was still active at 3, 6 and 12 months, only among students old enough", () => {
    const r = computeRetention(students, ASOF, { countNeverAttended: false });
    expect(r.marks.map((m) => [m.months, m.retained, m.eligible])).toEqual([[3, 2, 3], [6, 2, 3], [12, 1, 3]]);
    expect(r.marks[0].rate).toBeCloseTo(2 / 3);
    expect(r.neverAttended).toBe(1);
  });

  it("can count sign-ups who never attended as lost at once", () => {
    const r = computeRetention(students, ASOF, { countNeverAttended: true });
    expect(r.marks.map((m) => [m.retained, m.eligible])).toEqual([[2, 4], [2, 4], [1, 4]]);
  });

  it("limits to a join window and breaks results out by join year", () => {
    const r = computeRetention(students, ASOF, { countNeverAttended: false, joinedFrom: "2026-01-01" });
    expect(r.marks.every((m) => m.eligible === 0 && m.rate === null)).toBe(true);
    const y2025 = computeRetention(students, ASOF, { countNeverAttended: false }).byYear.find((y) => y.year === 2025)!;
    expect(y2025.signups).toBe(3);
    expect(computeRetention(students, ASOF, { countNeverAttended: false }).byYear).toHaveLength(8);
  });
});

describe("trial conversion", () => {
  const t = (over: Partial<Parameters<typeof classifyTrial>[0]>) =>
    ({ studentId: 1, name: "T", startDate: "2026-07-01", isActive: true, lastSeen: null, ...over });

  it("classifies each trial by what happened after it ended", () => {
    expect(classifyTrial(t({ startDate: "2026-09-01", lastSeen: "2026-09-16" }), ASOF)).toBe("inTrial");
    expect(classifyTrial(t({ startDate: "2026-09-01", isActive: false }), ASOF)).toBe("dropped"); // left mid-trial
    expect(classifyTrial(t({ startDate: "2026-07-01", lastSeen: "2026-09-10" }), ASOF)).toBe("converted");
    expect(classifyTrial(t({ startDate: "2026-07-10", lastSeen: "2026-08-15" }), ASOF)).toBe("dropped");
    expect(classifyTrial(t({ startDate: "2026-08-01", lastSeen: "2026-08-30" }), ASOF)).toBe("deciding"); // ended 09-12, within grace
    expect(classifyTrial(t({ startDate: "2026-07-01", isActive: false, lastSeen: "2026-09-01" }), ASOF)).toBe("converted"); // stayed on, quit later
  });

  it("summarizes a conversion rate over finished trials only", () => {
    const s = summarizeTrials([
      t({ studentId: 1, startDate: "2026-09-01", lastSeen: "2026-09-16" }),
      t({ studentId: 2, startDate: "2026-09-01", isActive: false }),
      t({ studentId: 3, startDate: "2026-07-01", lastSeen: "2026-09-10" }),
      t({ studentId: 4, startDate: "2026-07-10", lastSeen: "2026-08-15" }),
      t({ studentId: 5, startDate: "2026-08-01", lastSeen: "2026-08-30" }),
    ], ASOF);
    expect([s.inTrial, s.deciding, s.converted, s.dropped]).toEqual([1, 1, 1, 2]);
    expect(s.rate).toBeCloseTo(1 / 3);
    expect(s.rows[0].startDate).toBe("2026-09-01"); // newest first
    expect(summarizeTrials([], ASOF).rate).toBeNull();
  });
});

describe("belt pyramid", () => {
  const rank = (id: number, name: string, track: string, sortOrder: number, classGroup: string | null, degree: string | null): RankInfo =>
    ({ id, name, track, sortOrder, classGroup, degree, colorHex: "#000" });
  const ranks = [
    rank(1, "Tiger White", "tiger", 0, null, null),
    rank(2, "Tiger Yellow", "tiger", 1, null, null),
    rank(10, "White", "regular", 0, "jr-wy", null),
    rank(11, "Yellow", "regular", 1, "jr-wy", null),
    rank(12, "Green", "regular", 2, "jr-gbp", null),
    rank(13, "Brown L1", "regular", 8, "jr-brb", null),
    rank(14, "1st Degree", "regular", 14, "jr-brb", "1st Degree"),
    rank(15, "5th Degree", "regular", 28, "jr-brb", "5th Degree"),
  ];
  const at = (id: number, n: number) => Array<number>(n).fill(id);

  it("orders one ladder Tiger Cubs first, counts each rank, and hides unused ranks past 4th Degree", () => {
    const p = buildPyramid(ranks, [...at(10, 10), ...at(11, 6), ...at(12, 5), ...at(13, 2), ...at(14, 1), ...at(1, 3)]);
    expect(p.rows.map((r) => r.name)).toEqual(["Tiger White", "Tiger Yellow", "White", "Yellow", "Green", "Brown L1", "1st Degree"]);
    expect(p.rows.map((r) => r.count)).toEqual([3, 0, 10, 6, 5, 2, 1]);
    expect(p.total).toBe(27);
    const g = Object.fromEntries(p.groups.map((x) => [x.group, x.count]));
    expect(g).toEqual({ "Tiger Cubs": 3, "White & Yellow": 16, "Green – Purple": 5, "Brown & Red": 2, "Black Belt": 1 });
    expect(p.bulges).toEqual([]); // 8.0 -> 5.0 -> 2.0 -> 1.0 per level: a healthy taper
  });

  it("shows a rank past 4th Degree once someone holds it, and calls out a mid-ladder bulge", () => {
    const p = buildPyramid(ranks, [...at(10, 4), ...at(12, 20), ...at(15, 1)]);
    expect(p.rows.some((r) => r.name === "5th Degree" && r.count === 1)).toBe(true);
    expect(p.bulges).toHaveLength(2); // Green–Purple > White & Yellow, and Black Belt > Brown & Red (1 vs 0 per level)
    expect(p.bulges[0]).toContain("Green – Purple");
  });
});

describe("membership length and when students quit", () => {
  const m = (over: Partial<MembershipStudent> & { id: number }): MembershipStudent => ({ ...life(over), rankId: 10, rankTrack: "regular", rankOrder: 0, ...over });
  const students = [
    m({ id: 1, joinDate: "2025-09-18" }), // active for exactly a year
    m({ id: 2, joinDate: "2026-01-01", isActive: false, lastSeen: "2026-01-20", rankId: 10 }), // ~0.6 months
    m({ id: 3, joinDate: "2025-01-01", isActive: false, lastSeen: "2025-03-01", rankId: 11 }), // ~1.9 months
    m({ id: 4, joinDate: "2025-02-01", isActive: false, lastSeen: "2025-03-25", rankId: 11 }), // ~1.7 months
    m({ id: 5, joinDate: "2020-01-01", isActive: false, lastSeen: "2023-06-01", rankId: 12 }), // ~41 months
    m({ id: 6, joinDate: "2024-01-01", isActive: false, attended: 0 }), // no way to date it
  ];

  it("summarizes tenure and finds the tenure where the most students left", () => {
    const r = computeMembership(students, ASOF);
    expect(r.active.n).toBe(1);
    expect(r.active.avgMonths).toBeCloseTo(12, 0);
    expect(r.departed.n).toBe(4);
    expect(Object.fromEntries(r.buckets.filter((b) => b.count).map((b) => [b.label, b.count]))).toEqual({
      "Under 1 month": 1, "1–2 months": 2, "3–5 years": 1,
    });
    expect(r.peak).toBe("1–2 months");
    expect(r.departedByRank).toEqual({ 10: 1, 11: 2, 12: 1 });
    expect(r.unknownTenure).toBe(1);
  });

  it("finds the dropout cliff by rate per month, so a wide bucket doesn't win just by being wide", () => {
    const r = computeMembership([
      // three students who left after ~7 months (a 6-month-wide bucket)...
      m({ id: 1, joinDate: "2025-01-01", isActive: false, lastSeen: "2025-08-01" }),
      m({ id: 2, joinDate: "2025-01-01", isActive: false, lastSeen: "2025-08-01" }),
      m({ id: 3, joinDate: "2025-01-01", isActive: false, lastSeen: "2025-08-01" }),
      // ...and two who left within their first month (a 1-month-wide bucket)
      m({ id: 4, joinDate: "2026-01-01", isActive: false, lastSeen: "2026-01-10" }),
      m({ id: 5, joinDate: "2026-01-01", isActive: false, lastSeen: "2026-01-10" }),
    ], ASOF);
    const by = Object.fromEntries(r.buckets.map((b) => [b.label, b]));
    expect(by["6–12 months"]).toMatchObject({ count: 3, perMonth: 0.5 });
    expect(by["Under 1 month"]).toMatchObject({ count: 2, perMonth: 2 });
    expect(r.peak).toBe("Under 1 month"); // although 3 > 2 by raw count
  });

  it("works out, for each regular-track belt, the share of students who reached it but left there", () => {
    const rank = (id: number, track: string, sortOrder: number): RankInfo =>
      ({ id, name: `R${id}`, track, sortOrder, classGroup: null, degree: null, colorHex: "#000" });
    const ranks = [rank(10, "regular", 0), rank(11, "regular", 1), rank(12, "regular", 2), rank(1, "tiger", 0)];
    const at = (id: number, order: number, over: Partial<MembershipStudent> = {}) =>
      m({ id, rankId: 10 + order, rankOrder: order, ...over });
    const r = computeMembership([
      at(1, 2), // active, reached the top
      at(2, 0, { isActive: false, lastSeen: "2026-03-01" }),
      at(3, 1, { isActive: false, lastSeen: "2026-03-01" }),
      at(4, 1), // active
      at(5, 0, { isActive: false, lastSeen: "2026-03-01" }),
      at(6, 0, { joinDate: "2018-01-01", isActive: false, lastSeen: "2019-03-01" }), // left before the window: not in play
      m({ id: 7, rankId: 1, rankTrack: "tiger", rankOrder: 0, isActive: false, lastSeen: "2026-03-01" }),
    ], ASOF, { leftFrom: "2025-01-01", ranks });
    const rates = Object.fromEntries(r.rankDepartures.map((d) => [d.rankId, d]));
    // In play: #1 (active), #2, #3, #4 (active), #5 and the Tiger Cub #7 -- five of them regular-track.
    expect(rates[10]).toMatchObject({ left: 2, reached: 5, rate: 0.4 });
    expect(rates[11]).toMatchObject({ left: 1, reached: 3, rate: 1 / 3 });
    expect(rates[12]).toMatchObject({ left: 0, reached: 1, rate: 0 });
    expect(rates[1]).toEqual({ rankId: 1, left: 1, reached: null, rate: null }); // Tiger Cubs: no reliable denominator
  });

  it("can limit departures to a recent window", () => {
    const r = computeMembership(students, ASOF, { leftFrom: "2026-01-01" });
    expect(r.departed.n).toBe(1);
    expect(r.peak).toBe("Under 1 month");
  });
});

describe("time in rank and stuck students", () => {
  const D0 = "2024-01-01";
  // Five students who each spent exactly 100 days at rank 2 (promoted to 2, then to 3).
  const promos = [1, 2, 3, 4, 5].flatMap((sid) => [
    { id: sid * 10, studentId: sid, toRankId: 2, date: D0 },
    { id: sid * 10 + 1, studentId: sid, toRankId: 3, date: addDaysIso(D0, 100) },
  ]);
  const active = (over: { id: number } & Partial<Parameters<typeof computeTimeInRank>[1][number]>) =>
    ({ name: `A${over.id}`, rankId: 2, isEntryRank: false, joinDate: "2020-01-01", lastSeen: daysAgo(2), ...over });

  it("takes the median of completed stays per rank", () => {
    const { perRank } = computeTimeInRank(promos, [], ASOF);
    expect(perRank).toEqual([{ rankId: 2, n: 5, medianDays: 100, avgDays: 100 }]);
  });

  it("flags active students well past the median, and can tell stuck from stopped-coming", () => {
    const { stuck } = computeTimeInRank([
      ...promos,
      { id: 900, studentId: 10, toRankId: 2, date: daysAgo(250) }, // 250 days at rank 2 -> 2.5x the median
      { id: 901, studentId: 11, toRankId: 2, date: daysAgo(140) }, // 1.4x: fine
      { id: 902, studentId: 12, toRankId: 2, date: daysAgo(151) }, // just over 1.5x
    ], [
      active({ id: 10, lastSeen: daysAgo(3) }),
      active({ id: 11 }),
      active({ id: 12, lastSeen: null }),
      active({ id: 13 }), // no promotions on record and not an entry rank -> can't tell
      active({ id: 14, isEntryRank: true, joinDate: daysAgo(400) }), // never promoted: measure from joining
    ], ASOF);
    expect(stuck.map((s) => s.studentId)).toEqual([14, 10, 12]); // worst ratio first: 4.0x, 2.5x, 1.51x
    expect(stuck[1]).toMatchObject({ daysInRank: 250, medianDays: 100, ratio: 2.5, daysSinceSeen: 3 });
    expect(stuck[2].daysSinceSeen).toBeNull();
  });

  it("ignores same-day promotions and repeat tests at the same rank", () => {
    const { perRank } = computeTimeInRank([
      { id: 1, studentId: 1, toRankId: 1, date: "2024-01-01" },
      { id: 2, studentId: 1, toRankId: 1, date: "2024-02-20" }, // re-test at the same rank: not a new rank
      { id: 3, studentId: 1, toRankId: 2, date: "2024-04-30" }, // 120 days after reaching rank 1
      { id: 4, studentId: 2, toRankId: 5, date: "2024-01-01" },
      { id: 5, studentId: 2, toRankId: 6, date: "2024-01-01" }, // graduation the same day: 0 days, skipped
    ], [], ASOF, { minSamples: 1 });
    expect(perRank).toEqual([{ rankId: 1, n: 1, medianDays: 120, avgDays: 120 }]);
  });

  it("won't judge a rank with too few examples, and can limit to recent stays", () => {
    const few = computeTimeInRank(promos.slice(0, 6), [active({ id: 10 })], ASOF); // 3 examples < 5
    expect(few.stuck).toEqual([]);
    const recent = computeTimeInRank(promos, [], ASOF, { since: "2025-01-01" });
    expect(recent.perRank).toEqual([]); // all the stays began in 2024
  });
});

describe("demographics", () => {
  const stu = (over: Partial<DemographicStudent> & { id: number }): DemographicStudent => ({
    name: `S${over.id}`, dateOfBirth: null, gender: null, phone: null, email: null,
    guardian1Phone: null, guardian1Email: null, guardian2Phone: null, guardian2Email: null, ...over,
  });
  const students = [
    stu({ id: 1, name: "Kid Five", dateOfBirth: "2021-05-01", gender: "Male", guardian1Phone: "(805) 555-1234" }),
    stu({ id: 2, name: "Kid Seven", dateOfBirth: "2019-01-01", gender: "Female", guardian1Phone: "805.555.1234" }),
    stu({ id: 3, name: "Kid Eleven", dateOfBirth: "2015-06-01" }),
    stu({ id: 4, name: "Teen", dateOfBirth: "2010-01-01", gender: "Other", email: "Sam@Example.com" }),
    stu({ id: 5, name: "Parent", dateOfBirth: "1985-04-04", gender: "Female", phone: "+1 805-555-1234" }),
    stu({ id: 6, name: "Adult", dateOfBirth: "1990-01-01", gender: "Male", guardian1Email: " sam@example.com " }), // shares the teen's email
    stu({ id: 7, name: "No DOB" }),
    stu({ id: 8, name: "Placeholder A", dateOfBirth: "2012-01-01", phone: "000-000-0000" }),
    stu({ id: 9, name: "Placeholder B", dateOfBirth: "2012-02-02", phone: "000-000-0000" }),
  ];

  it("counts age bands (4–5, 6–7, 8–12, 13–17, 18+), kids per adult, and gender", () => {
    const d = computeDemographics(students, ASOF);
    const band = Object.fromEntries(d.bands.map((b) => [b.key, b.count]));
    expect(band).toEqual({ under4: 0, "4-5": 1, "6-7": 1, "8-12": 1, "13-17": 3, "18+": 2 });
    expect(d.kids).toBe(6);
    expect(d.adults).toBe(2);
    expect(d.unknownAge).toBe(1);
    expect(d.kidsPerAdult).toBe(3);
    expect(d.gender).toEqual({ male: 2, female: 2, other: 1, unrecorded: 4 });
    expect(d.bands.find((b) => b.key === "4-5")).toMatchObject({ male: 1, female: 0 });
  });

  it("groups households by shared phone or email (however it's typed), classifying siblings and parent-child", () => {
    const d = computeDemographics(students, ASOF);
    expect(d.families).toHaveLength(2);
    const parentFamily = d.families.find((f) => f.members.some((m) => m.name === "Parent"))!;
    expect(parentFamily.members.map((m) => m.name)).toEqual(["Parent", "Kid Seven", "Kid Five"]); // oldest first
    expect(parentFamily).toMatchObject({ minors: 2, adults: 1 });
    const emailFamily = d.families.find((f) => f.members.some((m) => m.name === "Teen"))!;
    expect(emailFamily).toMatchObject({ minors: 1, adults: 1 });
    // Two students sharing only a junk placeholder number are NOT treated as a family.
    expect(d.families.some((f) => f.members.some((m) => m.name.startsWith("Placeholder")))).toBe(false);
    expect(d.familySummary).toEqual({ familyCount: 2, studentsInFamilies: 5, siblingSets: 1, parentChildSets: 2 });
  });

  it("has no kids-per-adult ratio when there are no adults", () => {
    expect(computeDemographics([students[0]], ASOF).kidsPerAdult).toBeNull();
  });
});

describe("enrollment flow", () => {
  it("counts sign-ups, losses, net change, and reconstructs who was enrolled at each month's end", () => {
    const flow = computeEnrollmentFlow([
      life({ id: 1, joinDate: "2026-07-10" }), // signed up in July, still here
      life({ id: 2, joinDate: "2026-01-01", isActive: false, lastSeen: "2026-08-15" }), // lost in August
      life({ id: 3, joinDate: "2025-06-01" }), // long-time member
      life({ id: 4, joinDate: "2026-02-01", isActive: false, attended: 0 }), // never came: never enrolled
      life({ id: 5, joinDate: "0200-01-14", isActive: false, lastSeen: "2026-08-01" }), // bad data: ignored
    ], ASOF, 3);
    expect(flow.map((f) => f.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(flow.map((f) => [f.signups, f.lost, f.net, f.enrolled])).toEqual([
      [1, 0, 1, 3], // Jul: #1, #2, #3
      [0, 1, -1, 2], // Aug: #2 left mid-month
      [0, 0, 0, 2],
    ]);
  });
});

describe("class slots", () => {
  const s = (date: string, classType: string, present: number) => ({ date, classType, present });
  const sessions = [
    s("2026-09-14", "adult", 10), // Monday
    s("2026-09-07", "adult", 6), // Monday
    s("2026-09-15", "adult", 0), // Tuesday, nobody marked: skipped
    s("2026-09-16", "tiger", 4), // Wednesday
    s("2026-09-16", "private", 1), // no slot
    s("2026-09-16", "legacy", 30), // imported history: no slot
    s("2026-06-01", "adult", 12), // outside the range
  ];
  const configs = [
    { classType: "adult", weekday: 1, startTime: "18:00", capacity: 12 },
    { classType: "tiger", weekday: 3, startTime: "16:00", capacity: 4 },
    { classType: "adult", weekday: 4, startTime: "18:30", capacity: 10 },
  ];

  it("averages headcount per class x weekday and grades it against capacity", () => {
    const rows = computeSlots(sessions, configs, "2026-08-01", "2026-09-18");
    expect(rows.map((r) => [r.classType, r.weekday])).toEqual([["adult", 1], ["tiger", 3], ["adult", 4]]);
    const [mon, wed, thu] = rows;
    expect(mon).toMatchObject({ sessions: 2, avgHeadcount: 8, peak: 10, capacity: 12, status: "healthy", startTime: "18:00" });
    expect(mon.utilization).toBeCloseTo(8 / 12);
    expect(wed).toMatchObject({ avgHeadcount: 4, utilization: 1, status: "full" });
    expect(thu).toMatchObject({ sessions: 0, avgHeadcount: 0, status: "light" }); // configured, never ran in range
  });

  it("shows headcount without a grade when no capacity is set", () => {
    const rows = computeSlots(sessions, [], "2026-08-01", "2026-09-18");
    expect(rows.map((r) => [r.classType, r.weekday, r.status])).toEqual([["adult", 1, "unknown"], ["tiger", 3, "unknown"]]);
    expect(rows[0].utilization).toBeNull();
  });
});
