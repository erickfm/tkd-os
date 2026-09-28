import { useState } from "react";

import { Badge, BarRow, Card, EmptyNote, Note, ReportShell, Segmented, Stat, StatGrid, Table, Td, useReport, pct, type Tone } from "@/components/reportUi";
import { getTimeInRankReport, type ReportWindow, type TimeInRankReport } from "@/db/repos";
import { prettyDate } from "@/lib/format";

const WINDOWS: { value: ReportWindow; label: string }[] = [
  { value: "3y", label: "Last 3 years" },
  { value: "5y", label: "Last 5 years" },
  { value: "all", label: "All time" },
];
const FACTORS = [
  { value: 1.5, label: "1.5× typical" },
  { value: 2, label: "2×" },
  { value: 3, label: "3×" },
];

const days = (d: number) => `${Math.round(d)} days (${Math.round(d / 7)} wks)`;

export function TimeInRankReportPage() {
  const [window, setWindow] = useState<ReportWindow>("5y");
  const [factor, setFactor] = useState(1.5);
  const { data, error } = useReport(() => getTimeInRankReport(window, undefined, { stuckFactor: factor }), [window, factor]);

  return (
    <ReportShell
      title="Time in rank"
      subtitle="How long students typically spend at each belt, who's been at theirs unusually long, and how testings go."
      error={error}
      controls={
        <>
          <Segmented label="Based on stays that began:" options={WINDOWS} value={window} onChange={setWindow} />
          <Segmented label="Flag when past:" options={FACTORS} value={factor} onChange={setFactor} />
        </>
      }
    >
      {data && <Body r={data} />}
    </ReportShell>
  );
}

function Body({ r }: { r: TimeInRankReport }) {
  const shown = r.perRank.filter((x) => x.n >= 3);
  const maxDays = Math.max(1, ...shown.map((x) => x.medianDays));
  const pass = r.passRate;
  const stopped = r.stuck.filter((s) => s.daysSinceSeen === null || s.daysSinceSeen >= 30).length;

  return (
    <>
      <StatGrid cols={3}>
        <Stat label="Students past the flag" value={r.stuck.length} tone={r.stuck.length ? "warn" : "good"} sub={`${r.stuckFactor}× the typical time at their belt`} />
        <Stat label="…of them not attending lately" value={stopped} sub="30+ days since a class" tone={stopped ? "bad" : "neutral"} />
        <Stat
          label="Testing pass rate"
          value={pct(pass.rate)}
          sub={pass.byDate.length ? `${pass.promoted} promoted, ${pass.noChange} no change · ${pass.byDate.length} testing${pass.byDate.length === 1 ? "" : "s"}` : "no testings recorded yet"}
        />
      </StatGrid>

      <Card title="Students who've been at their belt unusually long" hint="Sorted by how far past typical they are. “Not attending” tells someone who's stuck apart from someone who's stopped coming.">
        {r.stuck.length === 0 ? (
          <EmptyNote>Nobody is past the flag right now.</EmptyNote>
        ) : (
          <Table head={["Student", "Belt", { label: "Time at this belt", right: true }, { label: "Typical", right: true }, "Attendance"]}>
            {r.stuck.map((s) => {
              const away = s.daysSinceSeen === null ? "Never attended" : s.daysSinceSeen >= 30 ? `Not attending (${s.daysSinceSeen} days)` : "Still attending";
              const tone: Tone = s.daysSinceSeen === null || s.daysSinceSeen >= 30 ? "bad" : "good";
              return (
                <tr key={s.studentId}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td muted>{s.rankName}</Td>
                  <Td right>{days(s.daysInRank)} <span className="text-xs text-[var(--color-fg-muted)]">· {s.ratio.toFixed(1)}×</span></Td>
                  <Td right muted>{days(s.medianDays)}</Td>
                  <Td><Badge tone={tone}>{away}</Badge></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="Typical time at each belt" hint="The median: half of students take less, half take more. Belts with fewer than 3 examples are left out.">
        {shown.length === 0 ? (
          <EmptyNote>Not enough promotion history to show.</EmptyNote>
        ) : (
          <div className="space-y-1">
            {shown.map((x) => (
              <BarRow key={x.rankId} label={x.name} value={x.medianDays} max={maxDays} color={x.colorHex} right={days(x.medianDays)} sublabel={`${x.n} examples`} dim={x.n < 5} />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
          Most belts land near 10 weeks: that's one testing cycle, so “typical” really means “one testing later.” A student flagged at 1.5× has usually skipped a testing.
        </p>
      </Card>

      <Card title="Testing pass rate">
        {pass.byDate.length === 0 ? (
          <EmptyNote>No testings recorded since the app began tracking them.</EmptyNote>
        ) : (
          <Table head={["Testing day", { label: "Promoted", right: true }, { label: "No change", right: true }, { label: "Pass rate", right: true }]}>
            {pass.byDate.map((d) => (
              <tr key={d.date}>
                <Td>{prettyDate(d.date)}</Td>
                <Td right>{d.promoted}</Td>
                <Td right>{d.noChange}</Td>
                <Td right>{pct(d.promoted / (d.promoted + d.noChange))}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Note>
        Time at a belt is the days between reaching it and reaching the next one (same-day promotions, like a Tiger Cub graduating, don't count as time spent).
      </Note>
      <Note tone="warn">
        The pass rate only covers testings since {pass.since ? prettyDate(pass.since) : "the app started"}. Older history recorded only promotions, never students who tested and didn't pass,
        so it would always read 100%. Record misses with “No Change” on the Testing Cycle page and this fills in.
        {pass.byDate.length <= 2 && " With so few testings so far, treat the percentage as a placeholder."}
      </Note>
    </>
  );
}

export { Body as TimeInRankBody };
