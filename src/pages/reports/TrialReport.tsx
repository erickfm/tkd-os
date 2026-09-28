import { Badge, Card, EmptyNote, Note, ReportShell, Stat, StatGrid, Table, Td, useReport, pct, type Tone } from "@/components/reportUi";
import { getTrialReport, type TrialReport } from "@/db/repos";
import { prettyDate } from "@/lib/format";
import { TRIAL_DAYS, TRIAL_GRACE_DAYS, type TrialOutcome } from "@/lib/reports";

const OUTCOME: Record<TrialOutcome, { label: string; tone: Tone }> = {
  converted: { label: "Became a member", tone: "good" },
  inTrial: { label: "In trial", tone: "neutral" },
  deciding: { label: "Deciding", tone: "warn" },
  dropped: { label: "Didn't continue", tone: "bad" },
};

export function TrialReportPage() {
  const { data, error } = useReport(() => getTrialReport(), []);

  return (
    <ReportShell title="Trial conversion" subtitle="Of the students who try a class, how many stay?" error={error}>
      {data && <TrialBody data={data} />}
    </ReportShell>
  );
}

export function TrialBody({ data }: { data: TrialReport }) {
  return (
    <>
      <StatGrid cols={4}>
        <Stat
          label="Conversion rate"
          value={pct(data.rate)}
          sub={data.converted + data.dropped ? `${data.converted} of ${data.converted + data.dropped} finished trials` : "no finished trials yet"}
          tone={data.rate === null ? "neutral" : data.rate >= 0.5 ? "good" : "warn"}
        />
        <Stat label="Became members" value={data.converted} tone="good" />
        <Stat label="Didn't continue" value={data.dropped} tone={data.dropped ? "bad" : "neutral"} />
        <Stat label="In trial or deciding" value={data.inTrial + data.deciding} sub={data.deciding ? `${data.deciding} just finished, deciding` : undefined} />
      </StatGrid>

      <Card title="Every trial on record">
        {data.rows.length === 0 ? (
          <EmptyNote>No trials recorded yet. Start one from the Trials page.</EmptyNote>
        ) : (
          <Table head={["Student", "Started", "Trial ended", "Last class", "Result"]}>
            {data.rows.map((r, i) => (
              <tr key={`${r.studentId}-${r.startDate}-${i}`}>
                <Td className="font-medium">{r.name}</Td>
                <Td muted>{prettyDate(r.startDate)}</Td>
                <Td muted>{prettyDate(r.endDate)}</Td>
                <Td muted>{prettyDate(r.lastSeen)}</Td>
                <Td><Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Note>
        Payment isn't tracked in this app, so “became a member” means the student kept coming after the {TRIAL_DAYS / 7}-week trial ended: at least one class on or after its last
        day. A finished trial with no class since (after a {TRIAL_GRACE_DAYS}-day grace period) counts as not continuing, as does anyone deactivated during the trial.
      </Note>
      <Note tone="warn">
        {data.trackingSince
          ? `Trials have only been recorded since ${prettyDate(data.trackingSince)}, so this can't say anything about earlier ones. `
          : "No trials have been recorded yet. "}
        Clicking “End trial” on the Trials page no longer erases the record: it now keeps the trial, so this report fills in on its own over time.
      </Note>
    </>
  );
}
