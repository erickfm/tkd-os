import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge, Card, EmptyNote, Note, ReportShell, Segmented, Stat, StatGrid, Table, Td, Toggle, useReport, WEEKDAYS, num1, pct, type Tone } from "@/components/reportUi";
import { CLASS_TYPE_LABELS, type ClassType } from "@/db/enums";
import { getClassSlotReport, type ClassSlotReport } from "@/db/repos";
import type { SlotRow, SlotStatus } from "@/lib/reports";

const RANGES = [
  { value: 30, label: "Last 30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "6 months" },
];

const STATUS: Record<SlotStatus, { label: string; tone: Tone }> = {
  full: { label: "Nearly full", tone: "warn" },
  healthy: { label: "Healthy", tone: "good" },
  light: { label: "Room for more", tone: "neutral" },
  unknown: { label: "", tone: "neutral" },
};

/** "18:30" -> "6:30 PM" */
export function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Mon..Sun sort key (Sunday last). */
const dayOrder = (wd: number) => (wd === 0 ? 7 : wd);

function label(r: SlotRow): string {
  return `${CLASS_TYPE_LABELS[r.classType as ClassType] ?? r.classType} · ${WEEKDAYS[r.weekday]}${r.startTime ? ` ${fmtTime(r.startTime)}` : ""}`;
}

export function ClassSlotsReportPage() {
  const [days, setDays] = useState(90);
  const [showOccasional, setShowOccasional] = useState(false);
  const { data, error } = useReport(() => getClassSlotReport(days), [days]);

  return (
    <ReportShell
      title="Class slots"
      subtitle="How many students attend each class, and how full it is."
      error={error}
      controls={
        <>
          <Segmented options={RANGES} value={days} onChange={setDays} />
          <Toggle label="Show occasional classes" checked={showOccasional} onChange={setShowOccasional} />
        </>
      }
    >
      {data && <ClassSlotsBody data={data} showOccasional={showOccasional} />}
    </ReportShell>
  );
}

export function ClassSlotsBody({ data, showOccasional }: { data: ClassSlotReport; showOccasional: boolean }) {
  const rows = data.rows
    .filter((r) => showOccasional || r.sessions >= 3 || r.capacity !== null)
    .sort((a, b) => dayOrder(a.weekday) - dayOrder(b.weekday) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.classType.localeCompare(b.classType));
  const hiddenCount = data.rows.length - rows.length;
  const anyCapacity = data.rows.some((r) => r.capacity !== null);
  const graded = rows.filter((r) => r.utilization !== null && r.sessions > 0);
  const maxAvg = Math.max(1, ...rows.map((r) => Math.max(r.avgHeadcount, r.capacity ?? 0)));
  const busiest = [...rows].sort((a, b) => b.avgHeadcount - a.avgHeadcount)[0];
  const quietest = [...rows].filter((r) => r.sessions > 0).sort((a, b) => a.avgHeadcount - b.avgHeadcount)[0];

  return (
    <>
      <StatGrid cols={3}>
        <Stat label="Busiest class" value={busiest ? `${num1(busiest.avgHeadcount)} avg` : "—"} sub={busiest ? label(busiest) : undefined} tone="good" />
        <Stat label="Quietest class" value={quietest ? `${num1(quietest.avgHeadcount)} avg` : "—"} sub={quietest ? label(quietest) : undefined} />
        <Stat
          label="Classes at 85%+ capacity"
          value={anyCapacity ? graded.filter((r) => r.status === "full").length : "—"}
          sub={anyCapacity ? `of ${graded.length} with a capacity set` : "set class sizes in Settings"}
          tone={graded.some((r) => r.status === "full") ? "warn" : "neutral"}
        />
      </StatGrid>

      {!anyCapacity && (
        <Note tone="warn">
          Set each class's size on the <Link to="/settings" className="font-medium text-[var(--color-brand)] underline">Settings page</Link> (Class schedule) and this report will show how full each
          class runs. Until then it shows headcount only.
        </Note>
      )}

      <Card title="Every class, by day" hint="Average number of students marked present, across the classes held in this period.">
        {rows.length === 0 ? (
          <EmptyNote>No classes recorded in this period.</EmptyNote>
        ) : (
          <Table head={["Day", "Time", "Class", { label: "Held", right: true }, { label: "Average", right: true }, { label: "Most", right: true }, "Fill", ""]}>
            {rows.map((r) => (
              <tr key={`${r.classType}-${r.weekday}`} className={r.sessions < 3 ? "opacity-60" : ""}>
                <Td className="font-medium">{WEEKDAYS[r.weekday]}</Td>
                <Td muted>{fmtTime(r.startTime) || "—"}</Td>
                <Td>{CLASS_TYPE_LABELS[r.classType as ClassType] ?? r.classType}</Td>
                <Td right muted>{r.sessions}</Td>
                <Td right className="font-medium">{num1(r.avgHeadcount)}</Td>
                <Td right muted>{r.peak || "—"}</Td>
                <Td className="w-56">
                  <div className="relative h-3 overflow-hidden rounded bg-[var(--color-surface-2)]" title={r.capacity ? `${pct(r.utilization)} of ${r.capacity}` : "No capacity set"}>
                    <div className="h-full rounded" style={{ width: `${(r.avgHeadcount / maxAvg) * 100}%`, background: r.status === "full" ? "#d97706" : "var(--color-brand)" }} />
                    {r.capacity && <div className="absolute inset-y-0 w-0.5 bg-[var(--color-fg)]" style={{ left: `${(r.capacity / maxAvg) * 100}%` }} title={`Capacity ${r.capacity}`} />}
                  </div>
                </Td>
                <Td>{r.status !== "unknown" && <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label} · {pct(r.utilization)}</Badge>}</Td>
              </tr>
            ))}
          </Table>
        )}
        {hiddenCount > 0 && <p className="mt-3 text-xs text-[var(--color-fg-muted)]">{hiddenCount} occasional class{hiddenCount === 1 ? "" : "es"} (held fewer than 3 times) hidden.</p>}
      </Card>

      <Note>
        Classes where nobody was marked present are skipped: they're nearly always a day someone opened the attendance page, not a class that ran empty. Private lessons and imported history
        aren't part of a class slot. The dark tick on each bar is the class's capacity.
      </Note>
      <Note>Only classes recorded in this app are included, so there's no per-class detail from before it was in use.</Note>
    </>
  );
}
