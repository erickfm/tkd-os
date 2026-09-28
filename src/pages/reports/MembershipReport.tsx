import { useState } from "react";

import { BarRow, Card, ColumnChart, Note, ReportShell, Segmented, Stat, StatGrid, useReport, fmtMonths, pct } from "@/components/reportUi";
import { getMembershipReport, type MembershipReport, type ReportWindow } from "@/db/repos";

const WINDOWS: { value: ReportWindow; label: string }[] = [
  { value: "1y", label: "Left in last year" },
  { value: "3y", label: "Last 3 years" },
  { value: "5y", label: "Last 5 years" },
  { value: "all", label: "All time" },
];

const SHORT_LABELS = ["<1 mo", "1–2 mo", "2–3 mo", "3–6 mo", "6–12 mo", "1–2 yr", "2–3 yr", "3–5 yr", "5+ yr"];

export function MembershipReportPage() {
  const [window, setWindow] = useState<ReportWindow>("5y");
  const { data, error } = useReport(() => getMembershipReport(window), [window]);

  return (
    <ReportShell
      title="Membership length"
      subtitle="How long students stay, and when they tend to leave."
      error={error}
      controls={<Segmented label="Students who left:" options={WINDOWS} value={window} onChange={setWindow} />}
    >
      {data && <Body m={data} />}
    </ReportShell>
  );
}

function Body({ m }: { m: MembershipReport }) {
  const peak = m.buckets.find((b) => b.label === m.peak);
  const tigerLeft = m.byRank.filter((r) => r.group === "Tiger Cubs").reduce((s, r) => s + r.left, 0);
  const ranked = m.byRank.filter((r) => r.rate !== null);
  const maxRate = Math.max(0.01, ...ranked.map((r) => r.rate!));
  const overall = m.departed.n && ranked.length ? m.departed.n : 0;

  return (
    <>
      <StatGrid>
        <Stat label="Current members: average stay so far" value={fmtMonths(m.active.avgMonths)} sub={`median ${fmtMonths(m.active.medianMonths)} · ${m.active.n} students`} />
        <Stat label="Former members: average stay" value={fmtMonths(m.departed.avgMonths)} sub={`median ${fmtMonths(m.departed.medianMonths)} · ${m.departed.n} students`} />
        <Stat label="Most common time to leave" value={m.peak ?? "—"} sub={peak && m.departed.n ? `${peak.count} of ${m.departed.n} (${pct(peak.share)})` : undefined} tone="warn" />
        <Stat label="Left while still a beginner" value={pct(m.departed.n ? (m.buckets[0].count + m.buckets[1].count + m.buckets[2].count) / m.departed.n : null)} sub="within their first 3 months" />
      </StatGrid>

      <Card
        title="When students leave"
        hint="Height = students who left per month of tenure, so a short window and a long one compare fairly. The first months are usually the steepest: that's the drop-off to watch."
      >
        <ColumnChart
          height={170}
          items={m.buckets.map((b, i) => ({
            key: b.label,
            label: SHORT_LABELS[i],
            value: b.perMonth,
            title: `${b.label}: ${b.count} students left (${pct(b.share)} of all who left), about ${b.perMonth.toFixed(1)} per month`,
            color: b.label === m.peak ? "#dc2626" : undefined,
          }))}
          format={(n) => (n >= 10 ? n.toFixed(0) : n.toFixed(1))}
        />
        <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
          {m.buckets.map((b, i) => `${SHORT_LABELS[i]}: ${b.count}`).join("  ·  ")}
        </p>
      </Card>

      <Card
        title="Where on the belt ladder students leave"
        hint="For each belt: of the students who got to it (or beyond), the share who left while there. A bar that stands out is a plateau where students give up."
      >
        {overall === 0 ? (
          <p className="text-sm text-[var(--color-fg-muted)]">Nobody left in this period.</p>
        ) : (
          <div className="space-y-1">
            {ranked.map((r) => (
              <BarRow
                key={r.rankId}
                label={r.name}
                value={r.rate!}
                max={maxRate}
                color={r.rate! >= 0.15 && (r.reached ?? 0) >= 30 ? "#dc2626" : r.colorHex}
                right={`${r.left} of ${r.reached} · ${pct(r.rate)}`}
                labelWidth="w-44"
              />
            ))}
          </div>
        )}
        {tigerLeft > 0 && (
          <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
            {tigerLeft} more left while still Tiger Cubs. They aren't shown as a rate, because once a Tiger Cub graduates the earlier stripes they passed through aren't recorded.
          </p>
        )}
      </Card>

      <Note>
        Time in the program runs from the date a student joined to the date they left: the earlier of their last class and the day they were deactivated. Red marks the tenure with the most
        departures per month, and belts where 15% or more of the students who reached them left there.
      </Note>
      {m.unknownTenure > 0 && (
        <Note>
          {m.unknownTenure} former student{m.unknownTenure === 1 ? "" : "s"} never attended a class and have no leave date recorded, so their length of stay can't be worked out and they're left out.
        </Note>
      )}
    </>
  );
}

export { Body as MembershipBody };
