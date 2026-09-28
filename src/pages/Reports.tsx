import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { fmtMonths, num1, pct, useReport, WEEKDAYS, type Tone } from "@/components/reportUi";
import { CLASS_TYPE_LABELS, type ClassType } from "@/db/enums";
import { getReportsScorecard, type Scorecard } from "@/db/repos";
import { prettyDate } from "@/lib/format";
import type { SlotRow } from "@/lib/reports";

const TONE: Record<Tone, string> = { good: "text-green-700", warn: "text-amber-600", bad: "text-red-600", neutral: "text-[var(--color-fg)]" };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function ReportsPage() {
  const { data, error } = useReport(() => getReportsScorecard(), []);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="How the school is doing, and where to look first. Click any card for the full report."
        actions={
          <Link to="/statistics" className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-2)]">
            Explore &amp; compare<ArrowRight size={14} />
          </Link>
        }
      />
      {error && <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>}
      {!data && !error && <p className="text-sm text-[var(--color-fg-muted)]">Crunching the numbers…</p>}
      {data && <Body c={data} />}
    </>
  );
}

function Body({ c }: { c: Scorecard }) {
  const needAttention = c.attendance.lapsed + c.attendance.never;
  const finished = c.trials.converted + c.trials.dropped;
  const inProgress = c.trials.inTrial + c.trials.deciding;

  return (
    <>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">Watch these first</h2>
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <BigCard to="/reports/attendance" title="Attendance">
          <div className={`text-3xl font-semibold tracking-tight ${TONE[needAttention ? "bad" : "good"]}`}>{needAttention}</div>
          <div className="text-sm text-[var(--color-fg-muted)]">students not seen in 14+ days</div>
          <div className="mt-3 flex h-3 overflow-hidden rounded">
            <Seg n={needAttention} total={c.attendance.total} color="#dc2626" />
            <Seg n={c.attendance.dropping} total={c.attendance.total} color="#d97706" />
            <Seg n={c.attendance.healthy} total={c.attendance.total} color="#16a34a" />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-[var(--color-fg-muted)]">
            <span><b className="text-amber-600">{c.attendance.dropping}</b> dropping sharply</span>
            <span><b className="text-green-700">{c.attendance.healthy}</b> on track</span>
            <span>of {c.attendance.total} active</span>
          </div>
        </BigCard>

        <BigCard to="/reports/retention" title="Retention" hint="of students who joined in the last 3 years">
          <div className="grid grid-cols-3 gap-3">
            {c.retention.map((m) => (
              <div key={m.months}>
                <div className="text-3xl font-semibold tracking-tight">{pct(m.rate)}</div>
                <div className="text-sm text-[var(--color-fg-muted)]">after {m.months} months</div>
                <div className="text-xs text-[var(--color-fg-muted)]">{m.retained} of {m.eligible}</div>
              </div>
            ))}
          </div>
        </BigCard>

        <BigCard to="/reports/trials" title="Trial conversion">
          {c.trials.rate === null ? (
            <>
              <div className="text-3xl font-semibold tracking-tight text-[var(--color-fg-muted)]">Too early</div>
              <div className="text-sm text-[var(--color-fg-muted)]">no trial has finished yet</div>
            </>
          ) : (
            <>
              <div className="text-3xl font-semibold tracking-tight">{pct(c.trials.rate)}</div>
              <div className="text-sm text-[var(--color-fg-muted)]">of trials became members ({c.trials.converted} of {finished})</div>
            </>
          )}
          <div className="mt-3 text-xs text-[var(--color-fg-muted)]">
            {inProgress} trial{inProgress === 1 ? "" : "s"} in progress{c.trials.trackingSince ? ` · tracked since ${prettyDate(c.trials.trackingSince)}` : ""}
          </div>
        </BigCard>

        <BigCard to="/reports/pyramid" title="Belt pyramid" hint={`${c.pyramid.total} active students`}>
          <div className="space-y-1">
            {[...c.pyramid.groups].reverse().filter((g) => g.levels > 0).map((g) => (
              <div key={g.group} className="flex items-center gap-2 text-xs">
                <div className="w-28 shrink-0 text-right text-[var(--color-fg-muted)]">{g.group}</div>
                <div className="flex h-3 flex-1 justify-center">
                  <div className="h-full rounded-sm bg-[var(--color-brand)]" style={{ width: `${(g.perLevel / Math.max(1, ...c.pyramid.groups.map((x) => x.perLevel))) * 100}%`, minWidth: g.count ? 3 : 0 }} />
                </div>
                <div className="w-6 shrink-0 tabular-nums">{g.count}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-[var(--color-fg-muted)]">
            {c.pyramid.bulges.length === 0 ? "Healthy taper: fewer students at each step up." : `Bulge: ${c.pyramid.bulges[0].replace(/ has more.*/, "")} is heavier than the belts below it.`}
          </div>
        </BigCard>
      </div>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">More detail</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <MiniCard to="/reports/membership" title="Membership length" value={fmtMonths(c.membership.activeAvgMonths)} sub={c.membership.peak ? `average stay so far · most leave in: ${c.membership.peak}` : "average stay so far"} />
        <MiniCard
          to="/reports/time-in-rank"
          title="Time in rank"
          value={`${c.timeInRank.stuck} past 1.5× typical`}
          sub={`stuck at a belt · pass rate ${c.timeInRank.testings ? pct(c.timeInRank.passRate) : "not tracked yet"}`}
          tone={c.timeInRank.stuck ? "warn" : "good"}
        />
        <MiniCard
          to="/reports/demographics"
          title="Demographics"
          value={c.demographics.kidsPerAdult === null ? "—" : `${num1(c.demographics.kidsPerAdult)} kids per adult`}
          sub={`${c.demographics.kids} kids · ${c.demographics.adults} adults${c.demographics.missingGender ? ` · gender missing for ${c.demographics.missingGender}` : ""}`}
        />
        <MiniCard
          to="/reports/enrollment"
          title="Enrollment flow"
          value={`${signed(c.enrollment.net)} net`}
          sub={`last 12 months: ${c.enrollment.signups} joined, ${c.enrollment.lost} left`}
          tone={c.enrollment.net < 0 ? "bad" : c.enrollment.net > 0 ? "good" : "neutral"}
        />
        <MiniCard
          to="/reports/class-slots"
          title="Class slots"
          value={c.slots.anyCapacity && c.slots.fullest ? `${pct(c.slots.fullest.utilization)} full` : "Headcount by class"}
          sub={c.slots.anyCapacity && c.slots.fullest ? `fullest: ${slotLabel(c.slots.fullest)}` : "set class sizes to see how full each one is"}
        />
      </div>

      <p className="mt-6 text-xs text-[var(--color-fg-muted)]">Numbers as of {prettyDate(c.asOf)}.</p>
    </>
  );
}

function slotLabel(r: SlotRow): string {
  return `${CLASS_TYPE_LABELS[r.classType as ClassType] ?? r.classType}, ${WEEKDAYS[r.weekday]}`;
}

function Seg({ n, total, color }: { n: number; total: number; color: string }) {
  return n > 0 ? <div style={{ width: `${(n / Math.max(1, total)) * 100}%`, background: color }} /> : null;
}

function BigCard({ to, title, hint, children }: { to: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <Link to={to} className="group block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 transition hover:border-[var(--color-brand)] hover:shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="flex items-center gap-1 text-xs text-[var(--color-fg-muted)] group-hover:text-[var(--color-brand)]">
          {hint ?? "Full report"}<ArrowRight size={12} />
        </span>
      </div>
      {children}
    </Link>
  );
}

function MiniCard({ to, title, value, sub, tone = "neutral" }: { to: string; title: string; value: string; sub: string; tone?: Tone }) {
  return (
    <Link to={to} className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition hover:border-[var(--color-brand)] hover:shadow-sm">
      <div className="text-xs text-[var(--color-fg-muted)]">{title}</div>
      <div className={`mt-1 text-lg font-semibold tracking-tight ${TONE[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{sub}</div>
    </Link>
  );
}

export { Body as ScorecardBody };
