import { useState } from "react";

import { Badge, Card, ColumnChart, EmptyNote, Note, ReportShell, Segmented, Sparkbars, Stat, StatGrid, Table, Td, useReport, num1, type Tone } from "@/components/reportUi";
import { getAttendanceTrendReport, type AttendanceTrendReport } from "@/db/repos";
import { prettyDate } from "@/lib/format";
import type { TrendRow, TrendStatus } from "@/lib/reports";

const STATUS: Record<TrendStatus, { label: (r: TrendRow) => string; tone: Tone }> = {
  lapsed: { label: (r) => `Not seen in ${r.daysSince} days`, tone: "bad" },
  never: { label: () => "Never attended", tone: "bad" },
  dropping: { label: () => "Attendance dropping", tone: "warn" },
  new: { label: () => "New", tone: "neutral" },
  ok: { label: () => "On track", tone: "good" },
};

type View = "attention" | "all";

export function AttendanceReportPage() {
  const { data, error } = useReport(() => getAttendanceTrendReport(), []);
  const [view, setView] = useState<View>("attention");

  return (
    <ReportShell
      title="Attendance trends"
      subtitle="Who's coming regularly, who's slipping, and who has stopped."
      error={error}
      controls={
        <Segmented<View>
          options={[{ value: "attention", label: "Needs attention" }, { value: "all", label: "Everyone" }]}
          value={view}
          onChange={setView}
        />
      }
    >
      {data && <Body data={data} view={view} />}
    </ReportShell>
  );
}

function Body({ data, view }: { data: AttendanceTrendReport; view: View }) {
  const { summary, rows, school } = data;
  const rowsShown = view === "all" ? rows : rows.filter((r) => r.status === "lapsed" || r.status === "never" || r.status === "dropping");
  const longGone = rows.filter((r) => r.status === "lapsed" && (r.daysSince ?? 0) >= 60).length;

  return (
    <>
      <StatGrid>
        <Stat label="Active students" value={summary.total} />
        <Stat label="Not seen in 14+ days" value={summary.lapsed + summary.never} tone={summary.lapsed + summary.never ? "bad" : "good"} sub={summary.never ? `${summary.never} never attended` : undefined} />
        <Stat label="Attendance dropping" value={summary.dropping} tone={summary.dropping ? "warn" : "good"} sub="under half their usual pace" />
        <Stat label="On track" value={summary.healthy} tone="good" />
      </StatGrid>

      {longGone > 0 && (
        <Note tone="warn">
          {longGone} student{longGone === 1 ? " hasn't" : "s haven't"} been to a class in 60+ days but {longGone === 1 ? "is" : "are"} still marked active. If they've left, deactivating them keeps
          every report accurate (and records the date they left).
        </Note>
      )}

      <Card
        title={view === "all" ? "Every active student" : "Students who need a look"}
        hint="The bars show visits in each of the last 12 weeks, oldest on the left. “Dropping” means the last 4 weeks are under half the pace of the 8 weeks before."
      >
        {rowsShown.length === 0 ? (
          <EmptyNote>Nobody needs attention right now.</EmptyNote>
        ) : (
          <Table head={["Student", "Status", "Last seen", "Last 12 weeks", { label: "Visits / week (recent vs before)", right: true }]}>
            {rowsShown.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.name}</Td>
                <Td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label(r)}</Badge></Td>
                <Td muted>{r.lastSeen ? prettyDate(r.lastSeen) : "—"}</Td>
                <Td><Sparkbars values={r.weeks} color={r.status === "lapsed" || r.status === "never" ? "#dc2626" : r.status === "dropping" ? "#d97706" : undefined} /></Td>
                <Td right muted>{num1(r.recentAvg)} vs {num1(r.baselineAvg)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Total attendance per week, all classes" hint="Student visits summed across every class, for the last 26 weeks.">
        <ColumnChart
          items={school.weeks.map((w) => {
            const d = new Date(`${w.weekStart}T00:00:00`);
            return {
              key: w.weekStart,
              label: `${d.getMonth() + 1}/${d.getDate()}`,
              value: w.present,
              faded: w.noData,
              title: w.noData ? `Week of ${prettyDate(w.weekStart)}: no classes recorded` : `Week of ${prettyDate(w.weekStart)}: ${w.present} visits in ${w.sessions} classes`,
            };
          })}
          labelEvery={3}
        />
        {school.gaps.length > 0 && (
          <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
            Striped weeks have no data: no classes were recorded {school.gaps.map((g) => `${prettyDate(g.from)} – ${prettyDate(g.to)}`).join("; ")}. That's a gap in the records, not a
            drop in attendance.
          </p>
        )}
      </Card>
    </>
  );
}

export { Body as AttendanceBody };
