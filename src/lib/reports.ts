// Pure report math for the Reports tab. No database access here: repos.ts
// fetches plain rows and hands them to these functions, which keeps them easy to
// test with small hand-built examples (and immune to fixture-DB contamination).

import {
  addDaysIso,
  addMonthsIso,
  ageOn,
  daysBetweenIso,
  endOfMonthKey,
  mondayOfIso,
  monthKeyOf,
  monthKeysBetweenIso,
} from "./dates";

export function mean(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Join dates before this are data-entry errors (e.g. the year 0200) and are ignored. */
export const MIN_VALID_JOIN = "1950-01-01";

// ---------------------------------------------------------------------------
// Who counts as "left", and when
// ---------------------------------------------------------------------------

export interface LifecycleStudent {
  id: number;
  name: string;
  joinDate: string;
  isActive: boolean;
  /** Date staff deactivated them (null for anyone deactivated before we tracked it). */
  leftDate: string | null;
  /** Last class they attended (on or before today). */
  lastSeen: string | null;
  /** Number of classes ever attended. */
  attended: number;
}

export function hasValidJoin(s: Pick<LifecycleStudent, "joinDate">, asOf: string): boolean {
  return s.joinDate >= MIN_VALID_JOIN && s.joinDate <= asOf;
}

/**
 * The date a student left, or null if they're active (or it can't be told).
 * It's the EARLIER of their last attended class and the date they were
 * deactivated: that way a batch clean-up of long-gone students in one day
 * doesn't make them look like they quit that day.
 */
export function leftDateOf(s: LifecycleStudent): string | null {
  if (s.isActive) return null;
  const candidates = [s.leftDate, s.lastSeen].filter((d): d is string => !!d).sort();
  if (candidates.length === 0) return null;
  return candidates[0] < s.joinDate ? s.joinDate : candidates[0];
}

// ---------------------------------------------------------------------------
// 1. Attendance trend
// ---------------------------------------------------------------------------

export const LAPSED_DAYS = 14;
export const TREND_WEEKS = 12;

export type TrendStatus = "lapsed" | "never" | "dropping" | "new" | "ok";

export interface TrendStudent {
  id: number;
  name: string;
  joinDate: string;
  lastSeen: string | null;
  /** Dates attended within the last TREND_WEEKS weeks. */
  visitDates: string[];
}

export interface TrendRow {
  id: number;
  name: string;
  /** Visits in each of the last 12 seven-day windows, oldest first. */
  weeks: number[];
  /** Avg visits/week over the most recent 4 weeks. */
  recentAvg: number;
  /** Avg visits/week over the 8 weeks before that. */
  baselineAvg: number;
  lastSeen: string | null;
  daysSince: number | null;
  status: TrendStatus;
}

export function computeTrends(students: TrendStudent[], asOf: string): TrendRow[] {
  const rows: TrendRow[] = students.map((s) => {
    const weeks = new Array<number>(TREND_WEEKS).fill(0);
    for (const d of s.visitDates) {
      const ago = daysBetweenIso(d, asOf);
      if (ago < 0 || ago >= TREND_WEEKS * 7) continue;
      weeks[TREND_WEEKS - 1 - Math.floor(ago / 7)] += 1;
    }
    const recentAvg = mean(weeks.slice(8)) ?? 0;
    const baselineAvg = mean(weeks.slice(0, 8)) ?? 0;
    const daysSince = s.lastSeen ? daysBetweenIso(s.lastSeen, asOf) : null;
    const daysEnrolled = daysBetweenIso(s.joinDate, asOf);

    let status: TrendStatus;
    if (daysSince === null) status = daysEnrolled >= LAPSED_DAYS ? "never" : "new";
    else if (daysSince >= LAPSED_DAYS) status = "lapsed";
    else if (daysEnrolled < TREND_WEEKS * 7) status = "new";
    else if (baselineAvg >= 1 && recentAvg <= baselineAvg * 0.5) status = "dropping";
    else status = "ok";

    return { id: s.id, name: s.name, weeks, recentAvg, baselineAvg, lastSeen: s.lastSeen, daysSince, status };
  });

  const rank: Record<TrendStatus, number> = { lapsed: 0, never: 1, dropping: 2, new: 3, ok: 4 };
  return rows.sort((a, b) =>
    rank[a.status] - rank[b.status] ||
    (b.daysSince ?? 0) - (a.daysSince ?? 0) ||
    a.recentAvg / (a.baselineAvg || 1) - b.recentAvg / (b.baselineAvg || 1) ||
    a.name.localeCompare(b.name));
}

export interface TrendSummary {
  total: number;
  lapsed: number;
  never: number;
  dropping: number;
  healthy: number;
}

export function summarizeTrends(rows: TrendRow[]): TrendSummary {
  const count = (s: TrendStatus) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    lapsed: count("lapsed"),
    never: count("never"),
    dropping: count("dropping"),
    healthy: count("ok") + count("new"),
  };
}

export interface SessionDay {
  date: string;
  /** Number of class sessions held that day. */
  sessions: number;
  /** Total students marked present across them. */
  present: number;
}

export interface WeekTotal {
  weekStart: string;
  present: number;
  sessions: number;
  /** True when the whole week falls inside a stretch with no classes recorded. */
  noData: boolean;
}

/** Runs of days between recorded classes longer than `minDays` (likely missing data, not a closure). */
export function findRecordingGaps(dates: string[], minDays = 10): { from: string; to: string }[] {
  const sorted = [...new Set(dates)].sort();
  const gaps: { from: string; to: string }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (daysBetweenIso(sorted[i - 1], sorted[i]) > minDays) {
      gaps.push({ from: addDaysIso(sorted[i - 1], 1), to: addDaysIso(sorted[i], -1) });
    }
  }
  return gaps;
}

/** Total attendance per week for the last `nWeeks` calendar weeks, with recording gaps flagged. */
export function schoolWeeks(days: SessionDay[], asOf: string, nWeeks = 26): { weeks: WeekTotal[]; gaps: { from: string; to: string }[] } {
  const thisMonday = mondayOfIso(asOf);
  const starts = Array.from({ length: nWeeks }, (_, i) => addDaysIso(thisMonday, -7 * (nWeeks - 1 - i)));
  const gaps = findRecordingGaps(days.map((d) => d.date));
  const byWeek = new Map<string, { present: number; sessions: number }>();
  for (const d of days) {
    const key = mondayOfIso(d.date);
    const cur = byWeek.get(key) ?? { present: 0, sessions: 0 };
    cur.present += d.present;
    cur.sessions += d.sessions;
    byWeek.set(key, cur);
  }
  const weeks = starts.map((weekStart) => {
    const weekEnd = addDaysIso(weekStart, 6);
    const v = byWeek.get(weekStart) ?? { present: 0, sessions: 0 };
    return {
      weekStart,
      present: v.present,
      sessions: v.sessions,
      noData: gaps.some((g) => weekStart >= g.from && weekEnd <= g.to),
    };
  });
  return { weeks, gaps };
}

// ---------------------------------------------------------------------------
// 2. Retention
// ---------------------------------------------------------------------------

export const RETENTION_MARKS = [3, 6, 12] as const;

export interface RetentionMark {
  months: number;
  eligible: number;
  retained: number;
  rate: number | null;
}

export interface RetentionOptions {
  /** Only students who joined on/after this date. */
  joinedFrom?: string;
  /** Count sign-ups who never attended a class as students who started (and lost at once). */
  countNeverAttended: boolean;
}

function retentionMarks(students: LifecycleStudent[], asOf: string): RetentionMark[] {
  return RETENTION_MARKS.map((months) => {
    let eligible = 0;
    let retained = 0;
    for (const s of students) {
      const markDate = addMonthsIso(s.joinDate, months);
      if (markDate > asOf) continue; // hasn't been enrolled long enough to judge
      eligible += 1;
      const left = leftDateOf(s);
      if (s.isActive || (left !== null && left >= markDate)) retained += 1;
    }
    return { months, eligible, retained, rate: eligible ? retained / eligible : null };
  });
}

export interface RetentionResult {
  marks: RetentionMark[];
  byYear: { year: number; signups: number; marks: RetentionMark[] }[];
  /** Sign-ups (in the window) who never attended a class. */
  neverAttended: number;
}

export function computeRetention(students: LifecycleStudent[], asOf: string, opts: RetentionOptions): RetentionResult {
  const base = students.filter((s) => hasValidJoin(s, asOf) && (opts.countNeverAttended || s.attended > 0));
  const inWindow = base.filter((s) => !opts.joinedFrom || s.joinDate >= opts.joinedFrom);
  const thisYear = Number(asOf.slice(0, 4));
  const byYear = Array.from({ length: 8 }, (_, i) => thisYear - 7 + i).map((year) => {
    const cohort = base.filter((s) => s.joinDate.startsWith(String(year)));
    return { year, signups: cohort.length, marks: retentionMarks(cohort, asOf) };
  });
  return {
    marks: retentionMarks(inWindow, asOf),
    byYear,
    neverAttended: students.filter((s) => hasValidJoin(s, asOf) && s.attended === 0 && (!opts.joinedFrom || s.joinDate >= opts.joinedFrom)).length,
  };
}

// ---------------------------------------------------------------------------
// 3. Trial -> member conversion
// ---------------------------------------------------------------------------

export const TRIAL_DAYS = 42;
export const TRIAL_GRACE_DAYS = 14;

export type TrialOutcome = "inTrial" | "deciding" | "converted" | "dropped";

export interface TrialInput {
  studentId: number;
  name: string;
  startDate: string;
  isActive: boolean;
  lastSeen: string | null;
}

export interface TrialRowResult extends TrialInput {
  endDate: string;
  outcome: TrialOutcome;
}

/**
 * Payment isn't tracked, so "became a member" means they kept coming after the
 * trial ended: at least one class on/after the trial's last day. A trial that
 * ended without that (and past a short grace period) counts as dropped.
 */
export function classifyTrial(t: TrialInput, asOf: string): TrialOutcome {
  const end = addDaysIso(t.startDate, TRIAL_DAYS);
  if (t.lastSeen !== null && t.lastSeen >= end) return "converted";
  if (asOf < end) return t.isActive ? "inTrial" : "dropped";
  if (t.isActive && asOf < addDaysIso(end, TRIAL_GRACE_DAYS)) return "deciding";
  return "dropped";
}

export interface TrialSummary {
  rows: TrialRowResult[];
  inTrial: number;
  deciding: number;
  converted: number;
  dropped: number;
  /** Converted / (converted + dropped); null until at least one trial has a result. */
  rate: number | null;
}

export function summarizeTrials(trials: TrialInput[], asOf: string): TrialSummary {
  const rows = trials
    .map((t) => ({ ...t, endDate: addDaysIso(t.startDate, TRIAL_DAYS), outcome: classifyTrial(t, asOf) }))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const count = (o: TrialOutcome) => rows.filter((r) => r.outcome === o).length;
  const converted = count("converted");
  const dropped = count("dropped");
  return {
    rows,
    inTrial: count("inTrial"),
    deciding: count("deciding"),
    converted,
    dropped,
    rate: converted + dropped ? converted / (converted + dropped) : null,
  };
}

// ---------------------------------------------------------------------------
// 4. Belt pyramid
// ---------------------------------------------------------------------------

export interface RankInfo {
  id: number;
  name: string;
  track: string;
  sortOrder: number;
  classGroup: string | null;
  degree: string | null;
  colorHex: string;
}

export const PYRAMID_GROUPS = ["Tiger Cubs", "White & Yellow", "Green – Purple", "Brown & Red", "Black Belt"] as const;
export type PyramidGroup = (typeof PYRAMID_GROUPS)[number];

/** Regular-track ranks above this sortOrder (4th Degree Black) only show if someone holds one. */
const LADDER_ALWAYS_SHOWN_THROUGH = 26;

export function rankGroup(r: Pick<RankInfo, "track" | "classGroup" | "degree">): PyramidGroup {
  if (r.track === "tiger") return "Tiger Cubs";
  if (r.classGroup === "jr-wy") return "White & Yellow";
  if (r.classGroup === "jr-gbp") return "Green – Purple";
  return r.degree === null ? "Brown & Red" : "Black Belt";
}

export interface PyramidRow {
  rankId: number;
  name: string;
  group: PyramidGroup;
  colorHex: string;
  count: number;
}

export interface PyramidGroupTotal {
  group: PyramidGroup;
  count: number;
  share: number;
  levels: number;
  perLevel: number;
}

export interface Pyramid {
  /** Ladder order, lowest rank first. */
  rows: PyramidRow[];
  groups: PyramidGroupTotal[];
  total: number;
  /** Plain-English notes where a higher belt group has more students per belt level than the one below it. */
  bulges: string[];
}

/** Count of students at each rank, on one ladder (Tiger Cubs first, then White up through Black). */
export function buildPyramid(ranks: RankInfo[], rankIds: number[]): Pyramid {
  const counts = new Map<number, number>();
  for (const id of rankIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  const ladder = [...ranks].sort((a, b) =>
    (a.track === "tiger" ? 0 : 1) - (b.track === "tiger" ? 0 : 1) || a.sortOrder - b.sortOrder);

  const rows: PyramidRow[] = ladder
    .filter((r) => r.track === "tiger" || r.sortOrder <= LADDER_ALWAYS_SHOWN_THROUGH || (counts.get(r.id) ?? 0) > 0)
    .map((r) => ({ rankId: r.id, name: r.name, group: rankGroup(r), colorHex: r.colorHex, count: counts.get(r.id) ?? 0 }));

  const total = rows.reduce((s, r) => s + r.count, 0);
  const groups = PYRAMID_GROUPS.map((group) => {
    const inGroup = rows.filter((r) => r.group === group);
    const count = inGroup.reduce((s, r) => s + r.count, 0);
    return { group, count, share: total ? count / total : 0, levels: inGroup.length, perLevel: inGroup.length ? count / inGroup.length : 0 };
  });

  // Compare adjacent regular-track groups per belt level, so a group with more
  // belts isn't unfairly "bigger". Tiger Cubs are a separate program, so skipped.
  const chain = groups.filter((g) => g.group !== "Tiger Cubs");
  const bulges: string[] = [];
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].perLevel > chain[i - 1].perLevel && chain[i].count > 0) {
      bulges.push(
        `${chain[i].group} has more students per belt level (${chain[i].perLevel.toFixed(1)}) than ${chain[i - 1].group} (${chain[i - 1].perLevel.toFixed(1)}).`,
      );
    }
  }
  return { rows, groups, total, bulges };
}

// ---------------------------------------------------------------------------
// 6. Membership length + when students quit
// ---------------------------------------------------------------------------

export interface MembershipStudent extends LifecycleStudent {
  rankId: number;
  rankTrack: string;
  rankOrder: number;
}

export const TENURE_BUCKETS = [
  { label: "Under 1 month", maxMonths: 1, spanMonths: 1 },
  { label: "1–2 months", maxMonths: 2, spanMonths: 1 },
  { label: "2–3 months", maxMonths: 3, spanMonths: 1 },
  { label: "3–6 months", maxMonths: 6, spanMonths: 3 },
  { label: "6–12 months", maxMonths: 12, spanMonths: 6 },
  { label: "1–2 years", maxMonths: 24, spanMonths: 12 },
  { label: "2–3 years", maxMonths: 36, spanMonths: 12 },
  { label: "3–5 years", maxMonths: 60, spanMonths: 24 },
  // Open-ended; 5 years is assumed as its width when converting to a per-month rate.
  { label: "5+ years", maxMonths: Infinity, spanMonths: 60 },
] as const;

const DAYS_PER_MONTH = 30.4375;

export interface RankDeparture {
  rankId: number;
  /** Students who left while at this belt. */
  left: number;
  /** Students who got to this belt or beyond (regular track only; null for Tiger Cubs, whose earlier ranks aren't recoverable once they graduate). */
  reached: number | null;
  /** left / reached: the share of students who made it to this belt but went no further. */
  rate: number | null;
}

export interface Membership {
  active: { n: number; avgMonths: number | null; medianMonths: number | null };
  departed: { n: number; avgMonths: number | null; medianMonths: number | null };
  /** Where students left, by how long they'd been enrolled. perMonth is count / bucket width, so wide buckets aren't unfairly tall. */
  buckets: { label: string; count: number; share: number; perMonth: number }[];
  /** The tenure bucket with the highest departure rate per month. */
  peak: string | null;
  departedByRank: Record<number, number>;
  rankDepartures: RankDeparture[];
  /** Inactive students with no attendance and no leave date, so no tenure can be worked out. */
  unknownTenure: number;
}

export function computeMembership(
  students: MembershipStudent[],
  asOf: string,
  opts: { leftFrom?: string; ranks?: RankInfo[] } = {},
): Membership {
  const valid = students.filter((s) => hasValidJoin(s, asOf));

  const activeMonths = valid.filter((s) => s.isActive).map((s) => daysBetweenIso(s.joinDate, asOf) / DAYS_PER_MONTH);

  const departedRows = valid
    .filter((s) => !s.isActive)
    .map((s) => ({ s, left: leftDateOf(s) }))
    .filter((x): x is { s: MembershipStudent; left: string } => x.left !== null)
    .filter((x) => !opts.leftFrom || x.left >= opts.leftFrom);
  const departedMonths = departedRows.map((x) => daysBetweenIso(x.s.joinDate, x.left) / DAYS_PER_MONTH);

  const counts = TENURE_BUCKETS.map(() => 0);
  for (const m of departedMonths) counts[TENURE_BUCKETS.findIndex((b) => m < b.maxMonths)] += 1;
  const buckets = TENURE_BUCKETS.map((b, i) => ({
    label: b.label,
    count: counts[i],
    share: departedMonths.length ? counts[i] / departedMonths.length : 0,
    perMonth: counts[i] / b.spanMonths,
  }));
  const top = buckets.reduce((best, b) => (b.perMonth > best.perMonth ? b : best), buckets[0]);

  const departedByRank: Record<number, number> = {};
  for (const x of departedRows) departedByRank[x.s.rankId] = (departedByRank[x.s.rankId] ?? 0) + 1;

  // Everyone in play during the window: still enrolled, or left inside it.
  const inPlay = [...valid.filter((s) => s.isActive), ...departedRows.map((x) => x.s)];
  const rankDepartures: RankDeparture[] = (opts.ranks ?? []).map((r) => {
    const left = departedByRank[r.id] ?? 0;
    if (r.track !== "regular") return { rankId: r.id, left, reached: null, rate: null };
    const reached = inPlay.filter((s) => s.rankTrack === "regular" && s.rankOrder >= r.sortOrder).length;
    return { rankId: r.id, left, reached, rate: reached ? left / reached : null };
  });

  return {
    active: { n: activeMonths.length, avgMonths: mean(activeMonths), medianMonths: median(activeMonths) },
    departed: { n: departedMonths.length, avgMonths: mean(departedMonths), medianMonths: median(departedMonths) },
    buckets,
    peak: top.perMonth > 0 ? top.label : null,
    departedByRank,
    rankDepartures,
    unknownTenure: valid.filter((s) => !s.isActive && leftDateOf(s) === null).length,
  };
}

// ---------------------------------------------------------------------------
// 7. Time in rank
// ---------------------------------------------------------------------------

export interface PromoRow {
  id: number;
  studentId: number;
  toRankId: number;
  date: string;
}

export interface RankTime {
  rankId: number;
  n: number;
  medianDays: number;
  avgDays: number;
}

export interface StuckStudent {
  studentId: number;
  name: string;
  rankId: number;
  daysInRank: number;
  medianDays: number;
  /** daysInRank divided by the rank's median. */
  ratio: number;
  /** Days since they last attended (null = never), so "stuck" can be told apart from "stopped coming". */
  daysSinceSeen: number | null;
}

export interface ActiveInRank {
  id: number;
  name: string;
  rankId: number;
  /** True when their current rank is the first one on their track. */
  isEntryRank: boolean;
  joinDate: string;
  lastSeen: string | null;
}

export interface TimeInRankOptions {
  stuckFactor?: number;
  /** Ranks with fewer completed examples than this aren't judged. */
  minSamples?: number;
  /** Only count time in ranks that began on/after this date. */
  since?: string;
}

export function computeTimeInRank(
  promos: PromoRow[],
  actives: ActiveInRank[],
  asOf: string,
  opts: TimeInRankOptions = {},
): { perRank: RankTime[]; stuck: StuckStudent[] } {
  const factor = opts.stuckFactor ?? 1.5;
  const minSamples = opts.minSamples ?? 5;

  const byStudent = new Map<number, PromoRow[]>();
  for (const p of promos) {
    if (!byStudent.has(p.studentId)) byStudent.set(p.studentId, []);
    byStudent.get(p.studentId)!.push(p);
  }
  for (const list of byStudent.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  // Completed stays: the days between reaching a rank and reaching the next one.
  const durations = new Map<number, number[]>();
  for (const list of byStudent.values()) {
    // Re-tests recorded at the same rank aren't a new rank; keep the first.
    const steps = list.filter((p, i) => i === 0 || p.toRankId !== list[i - 1].toRankId);
    for (let i = 0; i < steps.length - 1; i++) {
      const days = daysBetweenIso(steps[i].date, steps[i + 1].date);
      if (days <= 0) continue; // same-day steps (graduation, rank skips) aren't time spent
      if (opts.since && steps[i].date < opts.since) continue;
      if (!durations.has(steps[i].toRankId)) durations.set(steps[i].toRankId, []);
      durations.get(steps[i].toRankId)!.push(days);
    }
  }

  const perRank: RankTime[] = [...durations.entries()].map(([rankId, days]) => ({
    rankId,
    n: days.length,
    medianDays: median(days)!,
    avgDays: mean(days)!,
  }));
  const medianOf = new Map(perRank.filter((r) => r.n >= minSamples && r.medianDays >= 14).map((r) => [r.rankId, r.medianDays]));

  const stuck: StuckStudent[] = [];
  for (const a of actives) {
    const typical = medianOf.get(a.rankId);
    if (typical === undefined) continue;
    const history = byStudent.get(a.id) ?? [];
    const reached = [...history].reverse().find((p) => p.toRankId === a.rankId) ?? history[history.length - 1];
    const since = reached ? reached.date : a.isEntryRank ? a.joinDate : null;
    if (since === null) continue; // no way to tell how long they've been at this rank
    const daysInRank = daysBetweenIso(since, asOf);
    if (daysInRank > factor * typical) {
      stuck.push({
        studentId: a.id,
        name: a.name,
        rankId: a.rankId,
        daysInRank,
        medianDays: typical,
        ratio: daysInRank / typical,
        daysSinceSeen: a.lastSeen ? daysBetweenIso(a.lastSeen, asOf) : null,
      });
    }
  }
  stuck.sort((x, y) => y.ratio - x.ratio);
  return { perRank, stuck };
}

// ---------------------------------------------------------------------------
// 8. Demographics
// ---------------------------------------------------------------------------

export const AGE_BANDS = [
  { key: "under4", label: "Under 4", min: 0, max: 3 },
  { key: "4-5", label: "4–5", min: 4, max: 5 },
  { key: "6-7", label: "6–7", min: 6, max: 7 },
  { key: "8-12", label: "8–12", min: 8, max: 12 },
  { key: "13-17", label: "13–17", min: 13, max: 17 },
  { key: "18+", label: "18 and over", min: 18, max: 100 },
] as const;

export function ageBandKey(age: number | null): string | null {
  if (age === null) return null;
  return AGE_BANDS.find((b) => age >= b.min && age <= b.max)?.key ?? null;
}

export interface DemographicStudent {
  id: number;
  name: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  guardian1Phone: string | null;
  guardian1Email: string | null;
  guardian2Phone: string | null;
  guardian2Email: string | null;
}

export interface FamilyGroup {
  members: { id: number; name: string; age: number | null }[];
  minors: number;
  adults: number;
}

export interface Demographics {
  total: number;
  bands: { key: string; label: string; count: number; male: number; female: number; other: number; unrecorded: number }[];
  kids: number;
  adults: number;
  unknownAge: number;
  /** Kids (under 18) per adult; null when there are no adults. */
  kidsPerAdult: number | null;
  gender: { male: number; female: number; other: number; unrecorded: number };
  families: FamilyGroup[];
  familySummary: { familyCount: number; studentsInFamilies: number; siblingSets: number; parentChildSets: number };
}

function digits(v: string | null): string {
  return (v ?? "").replace(/\D/g, "").slice(-10);
}

/** Contact details that link students into a household; anything too short or too common is ignored. */
function contactKeys(s: DemographicStudent): string[] {
  const keys: string[] = [];
  for (const p of [s.phone, s.guardian1Phone, s.guardian2Phone]) {
    const d = digits(p);
    if (d.length >= 10 && !/^(\d)\1+$/.test(d)) keys.push(`p:${d}`);
  }
  for (const e of [s.email, s.guardian1Email, s.guardian2Email]) {
    const v = (e ?? "").trim().toLowerCase();
    if (v.includes("@")) keys.push(`e:${v}`);
  }
  return keys;
}

const MAX_HOUSEHOLD = 8;

export function computeDemographics(students: DemographicStudent[], asOf: string): Demographics {
  const ages = new Map(students.map((s) => [s.id, ageOn(s.dateOfBirth, asOf)]));

  const bands = AGE_BANDS.map((b) => ({ key: b.key as string, label: b.label as string, count: 0, male: 0, female: 0, other: 0, unrecorded: 0 }));
  const gender = { male: 0, female: 0, other: 0, unrecorded: 0 };
  let kids = 0;
  let adults = 0;
  let unknownAge = 0;
  for (const s of students) {
    const age = ages.get(s.id)!;
    const g = s.gender === "Male" ? "male" : s.gender === "Female" ? "female" : s.gender === "Other" ? "other" : "unrecorded";
    gender[g] += 1;
    const key = ageBandKey(age);
    if (key === null) { unknownAge += 1; continue; }
    const band = bands.find((b) => b.key === key)!;
    band.count += 1;
    band[g] += 1;
    if (age! < 18) kids += 1; else adults += 1;
  }

  // Households: link students who share a phone number or email address.
  const parent = new Map<number, number>(students.map((s) => [s.id, s.id]));
  const find = (x: number): number => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
    return x;
  };
  const byKey = new Map<string, number[]>();
  for (const s of students) for (const k of contactKeys(s)) {
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(s.id);
  }
  for (const ids of byKey.values()) {
    if (ids.length < 2 || ids.length > MAX_HOUSEHOLD) continue;
    for (const id of ids.slice(1)) parent.set(find(id), find(ids[0]));
  }
  const groups = new Map<number, DemographicStudent[]>();
  for (const s of students) {
    const root = find(s.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(s);
  }
  const families: FamilyGroup[] = [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => {
      const members = g
        .map((s) => ({ id: s.id, name: s.name, age: ages.get(s.id)! }))
        .sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
      return {
        members,
        minors: members.filter((m) => m.age !== null && m.age < 18).length,
        adults: members.filter((m) => m.age !== null && m.age >= 18).length,
      };
    })
    .sort((a, b) => b.members.length - a.members.length || a.members[0].name.localeCompare(b.members[0].name));

  return {
    total: students.length,
    bands,
    kids,
    adults,
    unknownAge,
    kidsPerAdult: adults ? kids / adults : null,
    gender,
    families,
    familySummary: {
      familyCount: families.length,
      studentsInFamilies: families.reduce((s, f) => s + f.members.length, 0),
      siblingSets: families.filter((f) => f.minors >= 2).length,
      parentChildSets: families.filter((f) => f.minors >= 1 && f.adults >= 1).length,
    },
  };
}

// ---------------------------------------------------------------------------
// 9. Enrollment flow
// ---------------------------------------------------------------------------

export interface FlowMonth {
  key: string;
  signups: number;
  lost: number;
  net: number;
  /** Students enrolled at the end of the month, reconstructed from join/leave dates. */
  enrolled: number;
}

export function computeEnrollmentFlow(students: LifecycleStudent[], asOf: string, months: number): FlowMonth[] {
  const valid = students.filter((s) => hasValidJoin(s, asOf));
  const currentKey = monthKeyOf(asOf);
  const startKey = monthKeyOf(addMonthsIso(`${currentKey}-01`, -(months - 1)));
  const withLeft = valid.map((s) => ({ s, left: leftDateOf(s) }));

  return monthKeysBetweenIso(`${startKey}-01`, `${currentKey}-01`).map((key) => {
    const end = endOfMonthKey(key);
    let signups = 0;
    let lost = 0;
    let enrolled = 0;
    for (const { s, left } of withLeft) {
      if (monthKeyOf(s.joinDate) === key) signups += 1;
      if (left !== null && monthKeyOf(left) === key) lost += 1;
      // A student we can't date a departure for (never attended, no leave date) is treated as never having enrolled.
      const stillHere = s.isActive || (left !== null && left > end);
      if (s.joinDate <= end && stillHere) enrolled += 1;
    }
    return { key, signups, lost, net: signups - lost, enrolled };
  });
}

// ---------------------------------------------------------------------------
// 5. Class slots
// ---------------------------------------------------------------------------

export interface SlotSession {
  date: string;
  classType: string;
  present: number;
}

export interface SlotConfig {
  classType: string;
  weekday: number;
  startTime: string | null;
  capacity: number | null;
}

export type SlotStatus = "full" | "healthy" | "light" | "unknown";

export interface SlotRow {
  classType: string;
  weekday: number;
  startTime: string | null;
  capacity: number | null;
  sessions: number;
  avgHeadcount: number;
  peak: number;
  utilization: number | null;
  status: SlotStatus;
}

export const FULL_AT = 0.85;
export const LIGHT_BELOW = 0.5;

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Headcount per class slot (class type x weekday) between `from` and `to`.
 * Sessions with nobody marked present are skipped -- they're almost always a
 * day someone opened the attendance page, not a class that actually ran empty.
 * Private lessons and imported history have no slot, so they're left out.
 */
export function computeSlots(sessions: SlotSession[], configs: SlotConfig[], from: string, to: string): SlotRow[] {
  const groups = new Map<string, number[]>();
  for (const s of sessions) {
    if (s.date < from || s.date > to || s.present <= 0) continue;
    if (s.classType === "private" || s.classType === "legacy") continue;
    const key = `${s.classType}|${weekdayOf(s.date)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s.present);
  }
  const cfg = new Map(configs.map((c) => [`${c.classType}|${c.weekday}`, c]));
  const keys = new Set([...groups.keys(), ...configs.filter((c) => c.classType !== "private").map((c) => `${c.classType}|${c.weekday}`)]);

  return [...keys].map((key) => {
    const [classType, wd] = key.split("|");
    const counts = groups.get(key) ?? [];
    const c = cfg.get(key);
    const avgHeadcount = mean(counts) ?? 0;
    const capacity = c?.capacity ?? null;
    const utilization = capacity ? avgHeadcount / capacity : null;
    const status: SlotStatus = utilization === null ? "unknown" : utilization >= FULL_AT ? "full" : utilization >= LIGHT_BELOW ? "healthy" : "light";
    return {
      classType,
      weekday: Number(wd),
      startTime: c?.startTime ?? null,
      capacity,
      sessions: counts.length,
      avgHeadcount,
      peak: counts.length ? Math.max(...counts) : 0,
      utilization,
      status,
    };
  }).sort((a, b) => (a.weekday || 7) - (b.weekday || 7) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.classType.localeCompare(b.classType));
}
