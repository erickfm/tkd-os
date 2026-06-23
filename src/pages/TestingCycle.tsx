import { useEffect, useMemo, useState } from "react";
import { Award, Download, Trash2, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { BeltBadge } from "@/components/BeltBadge";
import { Button, EmptyState, TextInput } from "@/components/ui";
import {
  buildTestingCycleTsv,
  getCurrentCycle,
  getCycleCandidates,
  getCycleRegistrations,
  promoteCycle,
  registerToTest,
  unregisterFromTest,
  updateCycleDates,
  type CandidateRow,
  type PromotionResult,
  type TestingRow,
} from "@/db/repos";
import type { TestingCycle } from "@/db/schema";
import { saveTextFile } from "@/lib/download";
import { ageFromDob, prettyDate } from "@/lib/format";

export function TestingCyclePage() {
  const [cycle, setCycle] = useState<TestingCycle | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [roster, setRoster] = useState<TestingRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [filter, setFilter] = useState("");
  const [results, setResults] = useState<PromotionResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  async function loadLists(cycleId: number) {
    const [r, c] = await Promise.all([getCycleRegistrations(cycleId), getCycleCandidates(cycleId)]);
    setRoster(r);
    setCandidates(c);
  }

  useEffect(() => {
    (async () => {
      try {
        const c = await getCurrentCycle();
        setCycle(c);
        setStart(c.startDate);
        setEnd(c.endDate);
        await loadLists(c.id);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  async function saveDates() {
    if (!cycle) return;
    if (end < start) { setError("End date can't be before start date."); return; }
    setError(null);
    await updateCycleDates(cycle.id, start, end);
    setCycle({ ...cycle, startDate: start, endDate: end });
    await loadLists(cycle.id); // attendance counts depend on the date range
  }

  async function register(studentId: number) {
    if (!cycle) return;
    await registerToTest(cycle.id, studentId);
    await loadLists(cycle.id);
  }
  async function unregister(studentId: number) {
    if (!cycle) return;
    await unregisterFromTest(cycle.id, studentId);
    await loadLists(cycle.id);
  }

  async function promote() {
    if (!cycle) return;
    if (!confirm(`Promote all ${roster.length} registered students to their next belt? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await promoteCycle(cycle.id);
      setResults(res);
      await loadLists(cycle.id);
    } finally {
      setBusy(false);
    }
  }

  async function exportTsv() {
    if (!cycle) return;
    const tsv = await buildTestingCycleTsv(cycle.id);
    const saved = await saveTextFile(`testing_cycle_${cycle.startDate}_to_${cycle.endDate}.tsv`, tsv);
    setExportMsg(saved ? "Testing list saved." : "Export canceled.");
  }

  const visibleCandidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q === "") return candidates;
    return candidates.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
  }, [candidates, filter]);

  return (
    <>
      <PageHeader
        title="Testing Cycle"
        subtitle={cycle ? `${prettyDate(cycle.startDate)} – ${prettyDate(cycle.endDate)} · ${roster.length} registered to test` : "Loading…"}
        actions={
          <>
            <Button variant="secondary" onClick={exportTsv} disabled={roster.length === 0}><Download size={16} />Export</Button>
            <Button variant="primary" onClick={promote} disabled={busy || roster.length === 0}><Award size={16} />{busy ? "Promoting…" : "Promote all"}</Button>
          </>
        }
      />

      {error && <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>}
      {exportMsg && <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">{exportMsg}</div>}

      <div className="mb-5 flex flex-wrap items-end gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Cycle start</span>
          <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} onBlur={saveDates} className="w-44" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Cycle end</span>
          <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} onBlur={saveDates} className="w-44" />
        </label>
        <p className="mb-2 text-xs text-[var(--color-fg-muted)]">Attendance counts classes attended between these dates.</p>
      </div>

      {results && (
        <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
          <div className="mb-2 font-medium">Promotion results</div>
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.studentId}>
                {r.skipped
                  ? <span className="text-[var(--color-fg-muted)]">{r.name} — skipped ({r.skipped})</span>
                  : <span>{r.name}: {r.previousBelt} → <strong>{r.newBelt}</strong>{r.graduated ? " 🎓 graduated" : ""}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Registered-to-test list */}
      <h2 className="mb-2 text-sm font-semibold">Registered to test ({roster.length})</h2>
      {roster.length === 0 ? (
        <EmptyState title="No students registered yet">Register students from the list below — check their attendance first.</EmptyState>
      ) : (
        <div className="mb-6 overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Belt</th>
                <th className="px-3 py-2 font-medium">Testing for</th>
                <th className="px-3 py-2 font-medium text-right">Attendance</th>
                <th className="px-3 py-2 font-medium">Progress</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const age = ageFromDob(s.dateOfBirth);
                return (
                  <tr key={s.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">{s.firstName} {s.lastName}</td>
                    <td className="px-3 py-2">{age ?? "—"}</td>
                    <td className="px-3 py-2"><BeltBadge rank={s.rank} size="sm" /></td>
                    <td className="px-3 py-2 text-[var(--color-fg-muted)]">{s.testingFor ?? "(top rank)"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.attendanceThisCycle}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {s.greenStripe && <Tag color="#16a34a">Green</Tag>}
                        {s.blueStripe && <Tag color="#2563eb">Blue</Tag>}
                        {s.orangeStripe && <Tag color="#ea580c">Orange</Tag>}
                        {s.redStripe && <Tag color="#dc2626">Red</Tag>}
                        {s.permissionToTest && <Tag color="var(--color-brand)">PTT</Tag>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => unregister(s.id)} className="text-[var(--color-fg-muted)] hover:text-red-600" aria-label="Remove"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* All active students with attendance — register from here */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">All students — attendance this cycle</h2>
        <TextInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name…" className="w-56" />
      </div>
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Student</th>
              <th className="px-3 py-2 font-medium">Age</th>
              <th className="px-3 py-2 font-medium">Belt</th>
              <th className="px-3 py-2 font-medium text-right">Attendance</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {visibleCandidates.map((s) => {
              const age = ageFromDob(s.dateOfBirth);
              return (
                <tr key={s.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2">{s.firstName} {s.lastName}</td>
                  <td className="px-3 py-2">{age ?? "—"}</td>
                  <td className="px-3 py-2"><BeltBadge rank={s.rank} size="sm" /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.attendanceThisCycle}</td>
                  <td className="px-3 py-2 text-right">
                    {s.registered ? (
                      <span className="text-xs text-[var(--color-fg-muted)]">Registered ✓</span>
                    ) : (
                      <Button variant="secondary" onClick={() => register(s.id)} className="px-2 py-1 text-xs"><UserPlus size={14} />Register</Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleCandidates.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-sm text-[var(--color-fg-muted)]">No students match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  );
}
