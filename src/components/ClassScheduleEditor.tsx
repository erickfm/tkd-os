import { useEffect, useState } from "react";

import { TextInput } from "@/components/ui";
import { WEEKDAYS } from "@/components/reportUi";
import { CLASS_TYPE_LABELS, type ClassType } from "@/db/enums";
import { getClassSlotReport, saveClassSlot } from "@/db/repos";
import type { SlotRow } from "@/lib/reports";

/**
 * Optional start time and capacity for each class (a class type on a weekday).
 * Rows come from classes actually held in the last 6 months, so there's
 * nothing to add by hand. Changes save as soon as a field loses focus.
 */
export function ClassScheduleEditor() {
  const [rows, setRows] = useState<SlotRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getClassSlotReport(180).then((r) => setRows(r.rows)).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>;
  if (!rows) return <p className="text-sm text-[var(--color-fg-muted)]">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-[var(--color-fg-muted)]">No classes recorded in the last 6 months yet.</p>;

  const ordered = [...rows].sort(
    (a, b) => (a.weekday || 7) - (b.weekday || 7) || a.classType.localeCompare(b.classType),
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Day</th>
            <th className="px-3 py-2 font-medium">Class</th>
            <th className="px-3 py-2 text-right font-medium">Held (6 mo)</th>
            <th className="px-3 py-2 font-medium">Start time</th>
            <th className="px-3 py-2 font-medium">Capacity</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((r) => <SlotRowEditor key={`${r.classType}-${r.weekday}`} row={r} />)}
        </tbody>
      </table>
    </div>
  );
}

function SlotRowEditor({ row }: { row: SlotRow }) {
  const [time, setTime] = useState(row.startTime ?? "");
  const [cap, setCap] = useState(row.capacity ? String(row.capacity) : "");
  const [saved, setSaved] = useState(false);

  async function save() {
    const capacity = Number.parseInt(cap, 10);
    const next = { startTime: time || null, capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null };
    if (next.startTime === row.startTime && next.capacity === row.capacity) return;
    await saveClassSlot({ classType: row.classType, weekday: row.weekday, ...next });
    row.startTime = next.startTime;
    row.capacity = next.capacity;
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <tr className={row.sessions < 3 ? "opacity-60" : ""}>
      <td className="border-t border-[var(--color-border)] px-3 py-1.5 font-medium">{WEEKDAYS[row.weekday]}</td>
      <td className="border-t border-[var(--color-border)] px-3 py-1.5">{CLASS_TYPE_LABELS[row.classType as ClassType] ?? row.classType}</td>
      <td className="border-t border-[var(--color-border)] px-3 py-1.5 text-right tabular-nums text-[var(--color-fg-muted)]">{row.sessions}</td>
      <td className="border-t border-[var(--color-border)] px-3 py-1.5">
        <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} onBlur={save} className="w-32" />
      </td>
      <td className="border-t border-[var(--color-border)] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <TextInput type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} onBlur={save} placeholder="—" className="w-20" />
          {saved && <span className="text-xs text-green-700">Saved</span>}
        </div>
      </td>
    </tr>
  );
}
