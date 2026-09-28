import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { BeltBadge } from "@/components/BeltBadge";
import { EmptyState } from "@/components/ui";
import { StudentSearchAdd } from "@/components/StudentSearchAdd";
import {
  listStudents,
  listTrialStudents,
  setTrial,
  type StudentRow,
  type TrialRow,
} from "@/db/repos";
import { prettyDate, today } from "@/lib/format";

export function TrialsPage() {
  const [trials, setTrials] = useState<TrialRow[]>([]);
  const [all, setAll] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [tr, students] = await Promise.all([listTrialStudents(), listStudents()]);
      setTrials(tr);
      setAll(students);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => { load(); }, []);

  const onTrial = new Set(trials.map((t) => t.id));
  const addable = all.filter((s) => s.isActive && !onTrial.has(s.id));

  async function startTrial(id: number) { await setTrial(id, today()); await load(); }
  async function endTrial(id: number) { await setTrial(id, null); await load(); }

  return (
    <>
      <PageHeader title="Trials" subtitle={`${trials.length} on a 6-week trial`} />

      {error && <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">{error}</div>}

      <StudentSearchAdd students={addable} onAdd={startTrial} placeholder="Search a student to start a 6-week trial…" />

      {trials.length === 0 ? (
        <EmptyState title="No students on trial">Search above to start a student's 6-week trial.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Belt</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Trial ends</th>
                <th className="px-3 py-2 font-medium text-right">Days left</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {trials.map((s) => (
                <tr key={s.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{s.firstName} {s.lastName}</td>
                  <td className="px-3 py-2"><BeltBadge rank={s.rank} size="sm" /></td>
                  <td className="px-3 py-2">{prettyDate(s.trialStart)}</td>
                  <td className="px-3 py-2">{prettyDate(s.trialEnd)}</td>
                  <td className="px-3 py-2 text-right"><DaysLeft days={s.daysLeft} /></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => endTrial(s.id)} className="text-[var(--color-fg-muted)] hover:text-red-600" aria-label="End trial"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DaysLeft({ days }: { days: number }) {
  if (days < 0) return <span className="text-[var(--color-fg-muted)]">Ended</span>;
  const soon = days <= 7;
  return <span className={soon ? "font-medium text-amber-600" : ""}>{days} day{days === 1 ? "" : "s"}{soon ? " — ending soon" : ""}</span>;
}
