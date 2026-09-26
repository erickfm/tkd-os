import { useState } from "react";

import { Card, ColumnChart, Note, ReportShell, Segmented, Stat, StatGrid, Table, Td, useReport } from "@/components/reportUi";
import { getEnrollmentFlowReport, type EnrollmentFlowReport } from "@/db/repos";
import type { FlowMonth } from "@/lib/reports";

const RANGES = [
  { value: 12, label: "Last 12 months" },
  { value: 24, label: "24 months" },
  { value: 36, label: "36 months" },
];

const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function EnrollmentReportPage() {
  const [months, setMonths] = useState(12);
  const { data, error } = useReport(() => getEnrollmentFlowReport(months), [months]);

  return (
    <ReportShell
      title="Enrollment flow"
      subtitle="New sign-ups, students lost, and the net change, month by month."
      error={error}
      controls={<Segmented options={RANGES} value={months} onChange={setMonths} />}
    >
      {data && <EnrollmentBody data={data} />}
    </ReportShell>
  );
}

export function EnrollmentBody({ data }: { data: EnrollmentFlowReport }) {
  return (
    <>
      <Totals flow={data.flow} />

      <Card title="Joined and left each month" hint="Green = new students, red = students who left.">
        <FlowChart flow={data.flow} />
      </Card>

      <Card title="Students enrolled at the end of each month" hint="Rebuilt from join and leave dates, so it shows how the roster has grown or shrunk over time.">
        <ColumnChart
          items={data.flow.map((f) => ({ key: f.key, label: monthLabel(f.key), value: f.enrolled }))}
          labelEvery={data.flow.length > 14 ? 3 : 1}
          height={160}
        />
      </Card>

      <Card title="Month by month">
        <Table head={["Month", { label: "Joined", right: true }, { label: "Left", right: true }, { label: "Net change", right: true }, { label: "Enrolled at month end", right: true }]}>
          {[...data.flow].reverse().map((f) => (
            <tr key={f.key}>
              <Td className="font-medium">{monthLabel(f.key)}</Td>
              <Td right>{f.signups}</Td>
              <Td right>{f.lost}</Td>
              <Td right className={f.net < 0 ? "text-red-600" : f.net > 0 ? "text-green-700" : ""}>{signed(f.net)}</Td>
              <Td right muted>{f.enrolled}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Note>
        A student counts as having left in the month of their last class or the day they were deactivated, whichever came first. The current month is still in progress, and people who
        stopped coming recently but are still marked active aren't counted as lost until they're deactivated.
      </Note>
      {data.undatedDepartures > 0 && (
        <Note>
          {data.undatedDepartures} former student{data.undatedDepartures === 1 ? "" : "s"} never attended a class and have no leave date, so they're treated as never having enrolled and don't appear here.
        </Note>
      )}
      <Note>Where students first heard about the school isn't tracked, so there's no referral breakdown.</Note>
    </>
  );
}

function Totals({ flow }: { flow: FlowMonth[] }) {
  const joined = flow.reduce((s, m) => s + m.signups, 0);
  const left = flow.reduce((s, m) => s + m.lost, 0);
  const net = joined - left;
  return (
    <StatGrid>
      <Stat label="Joined" value={joined} tone="good" sub={`${(joined / Math.max(1, flow.length)).toFixed(1)} per month`} />
      <Stat label="Left" value={left} tone={left > joined ? "bad" : "neutral"} sub={`${(left / Math.max(1, flow.length)).toFixed(1)} per month`} />
      <Stat label="Net change" value={signed(net)} tone={net < 0 ? "bad" : net > 0 ? "good" : "neutral"} />
      <Stat label="Enrolled now" value={flow[flow.length - 1]?.enrolled ?? 0} sub={`${flow[0]?.enrolled ?? 0} at the end of ${flow[0] ? monthLabel(flow[0].key) : "—"}`} />
    </StatGrid>
  );
}

function FlowChart({ flow }: { flow: FlowMonth[] }) {
  const max = Math.max(1, ...flow.flatMap((f) => [f.signups, f.lost]));
  const height = 150;
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }}>
        {flow.map((f) => (
          <div key={f.key} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px" title={`${monthLabel(f.key)}: ${f.signups} joined, ${f.lost} left (net ${signed(f.net)})`}>
            <div className="w-full max-w-3 rounded-t bg-green-600" style={{ height: `${(f.signups / max) * height}px`, minHeight: f.signups ? 2 : 0 }} />
            <div className="w-full max-w-3 rounded-t bg-red-500" style={{ height: `${(f.lost / max) * height}px`, minHeight: f.lost ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {flow.map((f, i) => (
          <div key={f.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-[var(--color-fg-muted)]">
            {i % (flow.length > 14 ? 3 : 1) === 0 ? monthLabel(f.key) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
