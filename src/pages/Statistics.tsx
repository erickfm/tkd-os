import { useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Select, TextInput } from "@/components/ui";
import { CLASS_TYPES, CLASS_TYPE_LABELS } from "@/db/enums";
import {
  getAttendanceStats,
  getCurrentCycle,
  getEarliestActivityDate,
  getEventStats,
  MIN_TESTING_SIZE,
  getPreviousCycle,
  getRosterStats,
  type AgeGroupFilter,
  type AttendanceStats,
  type ClassDayRow,
  type EventStats,
  type RateRow,
  type RosterStats,
  type StatsFilter,
  type TrackFilter,
} from "@/db/repos";
import { prettyDate, today } from "@/lib/format";

function fmt1(n: number | null): string {
  return n == null ? "—" : n.toFixed(1);
}
function fmtPct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function monthsAgoIso(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultFilter(): StatsFilter {
  return { start: monthsAgoIso(12), end: today(), classTypes: [], track: "all", ageGroup: "all" };
}

function describeFilter(f: StatsFilter): string {
  const parts = [`${prettyDate(f.start)} – ${prettyDate(f.end)}`];
  if (f.track !== "all") parts.push(f.track === "tiger" ? "Tiger Cubs" : "Jr./Adult");
  if (f.ageGroup !== "all") parts.push(f.ageGroup === "jr" ? "Jr." : "Adult");
  if (f.classTypes.length) parts.push(`${f.classTypes.length} class type${f.classTypes.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

interface PeriodData {
  roster: RosterStats;
  attendance: AttendanceStats;
  events: EventStats;
}

async function loadPeriod(filter: StatsFilter): Promise<PeriodData> {
  const [roster, attendance, events] = await Promise.all([
    getRosterStats(filter),
    getAttendanceStats(filter),
    getEventStats(filter),
  ]);
  return { roster, attendance, events };
}

export function StatisticsPage() {
  const [filterA, setFilterA] = useState<StatsFilter>(defaultFilter());
  const [filterB, setFilterB] = useState<StatsFilter>(defaultFilter());
  const [compare, setCompare] = useState(false);
  const [dataA, setDataA] = useState<PeriodData | null>(null);
  const [dataB, setDataB] = useState<PeriodData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPeriod(filterA).then(setDataA).catch((e) => setError(String(e)));
  }, [filterA]);

  useEffect(() => {
    if (!compare) { setDataB(null); return; }
    loadPeriod(filterB).then(setDataB).catch((e) => setError(String(e)));
  }, [filterB, compare]);

  return (
    <>
      <PageHeader
        title="Statistics"
        subtitle="Roster demographics, attendance patterns, and testing/event sizes."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-4 w-4" />
            Compare to another period
          </label>
        }
      />

      {error && <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>}

      <div className={`mb-8 grid gap-4 ${compare ? "md:grid-cols-2" : ""}`}>
        <FilterPanel label={compare ? "Period A" : "Filters"} filter={filterA} onChange={setFilterA} />
        {compare && <FilterPanel label="Period B" filter={filterB} onChange={setFilterB} />}
      </div>

      {dataA && (
        <Section title="Roster">
          <Compare
            compare={compare && !!dataB}
            filterA={filterA}
            filterB={filterB}
            a={<RosterContent stats={dataA.roster} />}
            b={dataB && <RosterContent stats={dataB.roster} />}
          />
        </Section>
      )}

      {dataA && (
        <Section title="Attendance">
          <Compare
            compare={compare && !!dataB}
            filterA={filterA}
            filterB={filterB}
            a={<AttendanceContent stats={dataA.attendance} />}
            b={dataB && <AttendanceContent stats={dataB.attendance} />}
          />
        </Section>
      )}

      {dataA && (
        <Section title="Testing &amp; events">
          <Compare
            compare={compare && !!dataB}
            filterA={filterA}
            filterB={filterB}
            a={<EventsContent stats={dataA.events} />}
            b={dataB && <EventsContent stats={dataB.events} />}
          />
          <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
            Testing size is inferred by grouping the promotions and No Changes that share a date — there's no separate
            "testing roster" record. Only dates with {MIN_TESTING_SIZE}+ students count as a testing; smaller dates
            (make-ups, late tests, individual promotions) are listed separately so they don't drag the average down.
            Board-breaking isn't tracked as its own activity anywhere in the app (only as a No Change reason), so
            there's no board-breaking size to show here.
          </p>
        </Section>
      )}
    </>
  );
}

function Compare({ compare, filterA, filterB, a, b }: {
  compare: boolean;
  filterA: StatsFilter;
  filterB: StatsFilter;
  a: React.ReactNode;
  b: React.ReactNode;
}) {
  if (!compare) return <>{a}</>;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <PeriodBadge filter={filterA} />
        {a}
      </div>
      <div>
        <PeriodBadge filter={filterB} />
        {b}
      </div>
    </div>
  );
}

function PeriodBadge({ filter }: { filter: StatsFilter }) {
  return <div className="mb-3 text-xs font-medium text-[var(--color-brand)]">{describeFilter(filter)}</div>;
}

function FilterPanel({ label, filter, onChange }: { label: string; filter: StatsFilter; onChange: (f: StatsFilter) => void }) {
  const [cycle, setCycle] = useState<{ start: string; end: string } | null>(null);
  const [prevCycle, setPrevCycle] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    (async () => {
      const c = await getCurrentCycle();
      setCycle({ start: c.startDate, end: c.testingDate ?? c.endDate });
      const p = await getPreviousCycle();
      setPrevCycle(p ? { start: p.startDate, end: p.testingDate ?? p.endDate } : null);
    })();
  }, []);

  async function applyPreset(preset: string) {
    const end = today();
    if (preset === "last12m") onChange({ ...filter, start: monthsAgoIso(12), end });
    else if (preset === "thisYear") onChange({ ...filter, start: `${new Date().getFullYear()}-01-01`, end });
    else if (preset === "lastYear") {
      const y = new Date().getFullYear() - 1;
      onChange({ ...filter, start: `${y}-01-01`, end: `${y}-12-31` });
    } else if (preset === "thisCycle" && cycle) onChange({ ...filter, start: cycle.start, end: cycle.end });
    else if (preset === "lastCycle" && prevCycle) onChange({ ...filter, start: prevCycle.start, end: prevCycle.end });
    else if (preset === "allTime") onChange({ ...filter, start: await getEarliestActivityDate(), end });
  }

  function toggleClassType(ct: string, checked: boolean) {
    onChange({ ...filter, classTypes: checked ? [...filter.classTypes, ct] : filter.classTypes.filter((c) => c !== ct) });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-fg-muted)]">Start</span>
          <TextInput type="date" value={filter.start} onChange={(e) => onChange({ ...filter, start: e.target.value })} className="w-36" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-fg-muted)]">End</span>
          <TextInput type="date" value={filter.end} onChange={(e) => onChange({ ...filter, end: e.target.value })} className="w-36" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-fg-muted)]">Preset</span>
          <Select defaultValue="" onChange={(e) => { const v = e.target.value; if (v) applyPreset(v); e.target.value = ""; }} className="w-40">
            <option value="" disabled>Choose…</option>
            <option value="last12m">Last 12 months</option>
            <option value="thisYear">This year</option>
            <option value="lastYear">Last year</option>
            <option value="thisCycle" disabled={!cycle}>This testing cycle</option>
            <option value="lastCycle" disabled={!prevCycle}>Last testing cycle</option>
            <option value="allTime">All time</option>
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-fg-muted)]">Track (roster)</span>
          <Select value={filter.track} onChange={(e) => onChange({ ...filter, track: e.target.value as TrackFilter })} className="w-32">
            <option value="all">All</option>
            <option value="tiger">Tiger Cubs</option>
            <option value="regular">Jr./Adult</option>
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--color-fg-muted)]">Age group (roster)</span>
          <Select value={filter.ageGroup} onChange={(e) => onChange({ ...filter, ageGroup: e.target.value as AgeGroupFilter })} className="w-28">
            <option value="all">All</option>
            <option value="jr">Jr.</option>
            <option value="adult">Adult</option>
          </Select>
        </label>
      </div>
      <div className="mt-3">
        <span className="mb-1 block text-xs text-[var(--color-fg-muted)]">Classes (attendance only — none checked = all)</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {CLASS_TYPES.map((ct) => (
            <label key={ct} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={filter.classTypes.includes(ct)} onChange={(e) => toggleClassType(ct, e.target.checked)} className="h-3.5 w-3.5" />
              {CLASS_TYPE_LABELS[ct]}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">{children}</div>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <div className="text-xs text-[var(--color-fg-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, sublabel }: { label: string; value: number; max: number; sublabel: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="w-40 shrink-0 truncate" title={label}>{label}</div>
      <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--color-surface)]">
        <div className="h-full rounded bg-[var(--color-brand)]" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-14 shrink-0 text-right text-xs tabular-nums text-[var(--color-fg-muted)]">{sublabel}</div>
    </div>
  );
}

/** Bar list for a RateRow[] breakdown, sizing bars off either avgPerSession or present. */
function RateBarList({ rows, valueField, showCounts }: { rows: RateRow[]; valueField: "avgPerSession" | "present"; showCounts?: boolean }) {
  if (rows.length === 0 || rows.every((r) => r.sessions === 0 && r.present === 0)) {
    return <p className="mb-4 text-sm text-[var(--color-fg-muted)]">No data in this range.</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r[valueField]));
  return (
    <div className="mb-4 max-h-72 space-y-1 overflow-y-auto pr-1">
      {rows.map((r) => (
        <BarRow
          key={r.key}
          label={r.label}
          value={r[valueField]}
          max={max}
          sublabel={showCounts ? `${fmt1(r.avgPerSession)} (${r.sessions})` : String(r.present)}
        />
      ))}
    </div>
  );
}

function RosterContent({ stats: roster }: { stats: RosterStats }) {
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Active students" value={String(roster.activeTotal)} sub={`${roster.totalEverEnrolled} ever enrolled`} />
        <StatCard label="Avg age" value={fmt1(roster.ageOverall.avg)} sub={`median ${fmt1(roster.ageOverall.median)}`} />
        <StatCard label="Avg membership" value={`${fmt1(roster.membershipYearsOverall.avg)} yrs`} sub={`median ${fmt1(roster.membershipYearsOverall.median)} yrs`} />
        <StatCard label="Trial retention" value={fmtPct(roster.trialRetention.rate)} sub={`${roster.trialRetention.stillActive} of ${roster.trialRetention.everTrial} still active`} />
      </div>

      <SubHeading>Age &amp; membership by group</SubHeading>
      <div className="mb-5 overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Group</th>
              <th className="px-3 py-2 font-medium text-right">Students</th>
              <th className="px-3 py-2 font-medium text-right">Avg age</th>
              <th className="px-3 py-2 font-medium text-right">Median age</th>
              <th className="px-3 py-2 font-medium text-right">Avg membership (yrs)</th>
              <th className="px-3 py-2 font-medium text-right">Median membership (yrs)</th>
            </tr>
          </thead>
          <tbody>
            {roster.ageByGroup.map((g) => {
              const t = roster.membershipYearsByGroup.find((m) => m.group === g.group);
              return (
                <tr key={g.group} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 font-medium">{g.group}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt1(g.avg)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt1(g.median)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt1(t?.avg ?? null)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt1(t?.median ?? null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SubHeading>Belt distribution</SubHeading>
      <div className="mb-5 grid gap-4">
        {roster.beltDistribution.map((d) => {
          const rankStat = roster.avgRankPosition.find((r) => r.track === d.track);
          const max = Math.max(1, ...d.rows.map((r) => r.count));
          return (
            <div key={d.track} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium">{d.label}</span>
                {rankStat && <span className="text-xs text-[var(--color-fg-muted)]">avg rank ≈ {rankStat.nearestRankName}</span>}
              </div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                {d.rows.map((r) => (
                  <BarRow key={r.rankId} label={r.name} value={r.count} max={max} sublabel={String(r.count)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <SubHeading>New enrollments by month</SubHeading>
      <RateBarList
        rows={roster.enrollmentByMonth.map((m) => ({ key: m.key, label: m.label, sessions: 0, present: m.count, avgPerSession: m.count }))}
        valueField="present"
      />
    </>
  );
}

function AttendanceContent({ stats: attendance }: { stats: AttendanceStats }) {
  return (
    <>
      <SubHeading>By month — avg students per class held</SubHeading>
      <RateBarList rows={attendance.byMonth} valueField="avgPerSession" showCounts />

      <SubHeading>By week</SubHeading>
      <RateBarList rows={attendance.byWeek} valueField="avgPerSession" showCounts />

      <SubHeading>By class</SubHeading>
      <RateBarList rows={attendance.byClassType} valueField="avgPerSession" showCounts />

      <SubHeading>By day of week</SubHeading>
      <RateBarList rows={attendance.byDayOfWeek} valueField="avgPerSession" showCounts />

      <SubHeading>Class × day of week — avg students per class held</SubHeading>
      <ClassDayHeatmap rows={attendance.classByDay} />
    </>
  );
}

function EventsContent({ stats: events }: { stats: EventStats }) {
  const tournament = events.eventSizeByType.find((e) => e.eventType === "Tournament");
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard label="Avg testing size" value={fmt1(events.testingSize.avg)} sub={`median ${fmt1(events.testingSize.median)} · ${events.testingSize.count} testings`} />
        {events.smallerPromotionDates.dates > 0 && (
          <StatCard
            label="Smaller promotion dates"
            value={String(events.smallerPromotionDates.dates)}
            sub={`${events.smallerPromotionDates.students} students · make-ups, late tests, individual promotions`}
          />
        )}
        <StatCard label="Promotion rate" value={fmtPct(events.promotionRate.rate)} sub={`${events.promotionRate.promoted} promoted, ${events.promotionRate.noChange} no-change`} />
        {tournament && (
          <StatCard label="Avg tournament size" value={fmt1(tournament.stat.avg)} sub={`median ${fmt1(tournament.stat.median)} · ${tournament.stat.count} tournaments`} />
        )}
      </div>

      <SubHeading>Event size by type (posted events)</SubHeading>
      {events.eventSizeByType.length === 0 ? (
        <p className="text-sm text-[var(--color-fg-muted)]">No posted events in this range.</p>
      ) : (
        <div className="mb-3 overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Events</th>
                <th className="px-3 py-2 font-medium text-right">Avg size</th>
                <th className="px-3 py-2 font-medium text-right">Median size</th>
              </tr>
            </thead>
            <tbody>
              {events.eventSizeByType.map((e) => (
                <tr key={e.eventType} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 font-medium">{e.eventType}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.stat.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt1(e.stat.avg)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt1(e.stat.median)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ClassDayHeatmap({ rows }: { rows: ClassDayRow[] }) {
  if (rows.length === 0) return <p className="mb-4 text-sm text-[var(--color-fg-muted)]">No data in this range.</p>;
  const classTypes = [...new Set(rows.map((r) => r.classType))];
  const days = [...new Set(rows.map((r) => r.day))];
  const byKey = new Map(rows.map((r) => [`${r.classType}|${r.day}`, r]));
  const max = Math.max(1, ...rows.map((r) => r.avgPerSession));

  const shade = (v: number) => {
    const ratio = v / max;
    if (v === 0) return "";
    if (ratio > 0.75) return "bg-[var(--color-brand)]/60 font-medium";
    if (ratio > 0.5) return "bg-[var(--color-brand)]/35";
    if (ratio > 0.25) return "bg-[var(--color-brand)]/20";
    return "bg-[var(--color-brand)]/10";
  };

  return (
    <div className="mb-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Class</th>
            {days.map((d) => <th key={d} className="px-3 py-2 text-right font-medium">{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {classTypes.map((ct) => {
            const label = byKey.get(`${ct}|${days[0]}`)?.classLabel ?? ct;
            return (
              <tr key={ct} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2 font-medium">{label}</td>
                {days.map((d) => {
                  const cell = byKey.get(`${ct}|${d}`);
                  const v = cell?.avgPerSession ?? 0;
                  return (
                    <td key={d} className={`px-3 py-2 text-right tabular-nums ${shade(v)}`} title={cell ? `${cell.sessions} classes held` : ""}>
                      {v > 0 ? v.toFixed(1) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
