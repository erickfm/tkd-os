import { useState } from "react";

import { Card, Note, ReportShell, Segmented, Stat, StatGrid, Table, Td, Toggle, useReport, pct } from "@/components/reportUi";
import { getRetentionReport, type ReportWindow, type RetentionReport } from "@/db/repos";
import type { RetentionMark } from "@/lib/reports";

const WINDOWS: { value: ReportWindow; label: string }[] = [
  { value: "3y", label: "Joined in last 3 years" },
  { value: "5y", label: "Last 5 years" },
  { value: "all", label: "All time" },
];

export function RetentionReportPage() {
  const [window, setWindow] = useState<ReportWindow>("3y");
  const [countNever, setCountNever] = useState(false);
  const { data, error } = useReport(() => getRetentionReport({ window, countNeverAttended: countNever }), [window, countNever]);

  return (
    <ReportShell
      title="Retention"
      subtitle="Of the students who started, how many were still with us after 3, 6 and 12 months?"
      error={error}
      controls={
        <>
          <Segmented options={WINDOWS} value={window} onChange={setWindow} />
          <Toggle label="Count sign-ups who never attended a class" checked={countNever} onChange={setCountNever} />
        </>
      }
    >
      {data && <RetentionBody data={data} />}
    </ReportShell>
  );
}

export function RetentionBody({ data }: { data: RetentionReport }) {
  const countNever = data.countNeverAttended;
  return (
    <>
      <StatGrid cols={3}>
        {data.marks.map((m) => (
          <Stat
            key={m.months}
            label={`Still active after ${m.months} months`}
            value={pct(m.rate)}
            sub={m.eligible ? `${m.retained} of ${m.eligible} students` : "not enough history yet"}
          />
        ))}
      </StatGrid>

      <Card title="By the year students joined" hint="Newer years can't show the longer marks yet, since those students haven't been enrolled that long.">
        <Table head={["Joined in", { label: "Students", right: true }, { label: "3 months", right: true }, { label: "6 months", right: true }, { label: "12 months", right: true }]}>
          {[...data.byYear].reverse().map((y) => (
            <tr key={y.year}>
              <Td className="font-medium">{y.year}</Td>
              <Td right muted>{y.signups}</Td>
              {y.marks.map((m) => <Td key={m.months} right><Rate mark={m} /></Td>)}
            </tr>
          ))}
        </Table>
      </Card>

      <Note>
        “Still active” means not yet left: a student counts as retained until they're deactivated or stop attending. Someone who stopped coming but is still marked active counts as
        retained, so keep the roster tidy for the most honest numbers. The date someone left is the earlier of their last class and the day they were deactivated.
      </Note>
      {data.neverAttended > 0 && (
        <Note>
          {data.neverAttended} sign-up{data.neverAttended === 1 ? "" : "s"} in this period never attended a class{countNever ? " (counted here as lost immediately)" : " (left out of these numbers, since they may have been inquiries or trial no-shows)"}.
          Use the checkbox above to include them.
        </Note>
      )}
    </>
  );
}

function Rate({ mark }: { mark: RetentionMark }) {
  if (mark.rate === null) return <span className="text-[var(--color-fg-muted)]">—</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2" title={`${mark.retained} of ${mark.eligible}`}>
      <span className="h-2 w-16 overflow-hidden rounded bg-[var(--color-surface-3)]">
        <span className="block h-full rounded bg-[var(--color-brand)]" style={{ width: `${mark.rate * 100}%` }} />
      </span>
      <span className="w-10">{pct(mark.rate)}</span>
    </span>
  );
}
