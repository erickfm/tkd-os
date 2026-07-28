import { useEffect, useMemo, useState } from "react";
import { Award, Ban, Download, FileSpreadsheet, ListOrdered, ListX, Printer, SkipForward, Trash2, UserMinus, UserPlus } from "lucide-react";

import { Drawer } from "@/components/Drawer";
import { PageHeader } from "@/components/PageHeader";
import { BeltBadge } from "@/components/BeltBadge";
import { Button, EmptyState, Field, Select, Textarea, TextInput } from "@/components/ui";
import { StudentSearchAdd } from "@/components/StudentSearchAdd";
import {
  addSpecialTester,
  buildBeltLabelsHtml,
  buildCertificateRows,
  buildNonTestersCsv,
  buildTestingCycleCsv,
  clearSpecialTesters,
  getBeltOrderBreakdown,
  getBeltOrderRoster,
  getCurrentCycle,
  getCycleCandidates,
  getCycleRegistrations,
  listBeltRanks,
  listSpecialTesters,
  listStudents,
  markNoChange,
  promoteCycle,
  registerToTest,
  removeSpecialTester,
  setRegistrationTarget,
  setSpecialTesterDate,
  setSpecialTesterTested,
  unregisterFromTest,
  updateCycle,
  type CandidateRow,
  type PromotionResult,
  type SpecialTestRow,
  type StudentRow,
  type TestingRow,
} from "@/db/repos";
import type { BeltRank, TestingCycle } from "@/db/schema";
import { NC_REASONS, NC_REASON_LABELS, type NcReason } from "@/db/enums";
import { saveTextFile } from "@/lib/download";
import { exportBeltOrderXlsx } from "@/lib/beltOrderExport";
import { exportCertificateData } from "@/lib/certificateExport";
import { exportSpecialTestersXlsx } from "@/lib/specialTestersExport";
import { ageFromDob, beltRankOrder, prettyDate, today } from "@/lib/format";

type CandSort = "first" | "last" | "age" | "belt" | "attendance";

/** Shared sort for any student-like row with an attendance-this-cycle count. */
function sortByField<T extends StudentRow & { attendanceThisCycle: number }>(
  list: T[],
  sortBy: CandSort,
  dir: "asc" | "desc",
): T[] {
  const mult = dir === "asc" ? 1 : -1;
  const key = (s: T): number | string => {
    switch (sortBy) {
      case "first": return s.firstName.toLowerCase();
      case "last": return s.lastName.toLowerCase();
      case "age": return ageFromDob(s.dateOfBirth) ?? -1;
      case "belt": return beltRankOrder(s.rank);
      case "attendance": return s.attendanceThisCycle;
    }
  };
  return list.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    const c = ka < kb ? -1 : ka > kb ? 1 : 0;
    return mult * c || a.lastName.localeCompare(b.lastName);
  });
}

export function TestingCyclePage() {
  const [cycle, setCycle] = useState<TestingCycle | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [testingDate, setTestingDate] = useState("");
  const [roster, setRoster] = useState<TestingRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [special, setSpecial] = useState<SpecialTestRow[]>([]);
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [filter, setFilter] = useState("");
  const [candSort, setCandSort] = useState<CandSort>("last");
  const [candDir, setCandDir] = useState<"asc" | "desc">("asc");
  const [rosterSort, setRosterSort] = useState<CandSort>("belt");
  const [rosterDir, setRosterDir] = useState<"asc" | "desc">("asc");
  const [results, setResults] = useState<PromotionResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [ncTarget, setNcTarget] = useState<TestingRow | null>(null);
  const [ncReason, setNcReason] = useState<NcReason>("F");
  const [ncNote, setNcNote] = useState("");
  const [ncSaving, setNcSaving] = useState(false);
  const [ncError, setNcError] = useState<string | null>(null);
  const [allRanks, setAllRanks] = useState<BeltRank[]>([]);
  const [skipTarget, setSkipTarget] = useState<TestingRow | null>(null);
  const [skipRankId, setSkipRankId] = useState<number | "">("");
  const [skipSaving, setSkipSaving] = useState(false);

  async function loadLists(cycleId: number) {
    const [r, c, sp, all] = await Promise.all([
      getCycleRegistrations(cycleId),
      getCycleCandidates(cycleId),
      listSpecialTesters(),
      listStudents(),
    ]);
    setRoster(r);
    setCandidates(c);
    setSpecial(sp);
    setAllStudents(all);
  }

  useEffect(() => {
    (async () => {
      try {
        const [c] = await Promise.all([getCurrentCycle(), listBeltRanks().then(setAllRanks)]);
        setCycle(c);
        setStart(c.startDate);
        setEnd(c.endDate);
        setTestingDate(c.testingDate ?? "");
        await loadLists(c.id);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  const addableSpecial = useMemo(() => {
    const on = new Set(special.map((s) => s.id));
    return allStudents.filter((s) => s.isActive && !on.has(s.id));
  }, [special, allStudents]);

  async function addSpecial(studentId: number) {
    if (!cycle) return;
    const defaultDate = cycle.testingDate || cycle.endDate || today();
    await addSpecialTester(studentId, defaultDate);
    await loadLists(cycle.id);
  }
  async function removeSpecial(id: number) {
    if (!cycle) return;
    await removeSpecialTester(id);
    await loadLists(cycle.id);
  }
  async function changeSpecialDate(id: number, date: string) {
    if (!cycle || !date) return;
    await setSpecialTesterDate(id, date);
    await loadLists(cycle.id);
  }
  async function toggleTested(id: number, tested: boolean) {
    if (!cycle) return;
    await setSpecialTesterTested(id, tested);
    await loadLists(cycle.id);
  }
  async function clearSpecial() {
    if (!cycle) return;
    const untested = special.filter((s) => !s.tested).length;
    const msg = untested > 0
      ? `${untested} of ${special.length} early/late testers aren't marked tested yet. Clear the whole list anyway?`
      : `Clear all ${special.length} early/late testers?`;
    if (!confirm(msg)) return;
    await clearSpecialTesters();
    await loadLists(cycle.id);
  }
  async function exportSpecialSheet() {
    const saved = await exportSpecialTestersXlsx(special);
    setExportMsg(saved ? "Early/late testers spreadsheet saved." : "Export canceled.");
  }

  async function saveDates() {
    if (!cycle) return;
    if (end < start) { setError("End date can't be before start date."); return; }
    setError(null);
    const td = testingDate || null;
    await updateCycle(cycle.id, start, end, td);
    setCycle({ ...cycle, startDate: start, endDate: end, testingDate: td });
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

  function openNoChange(s: TestingRow) {
    setNcTarget(s);
    setNcReason("F");
    setNcNote("");
    setNcError(null);
  }
  async function submitNoChange() {
    if (!cycle || !ncTarget) return;
    setNcSaving(true);
    setNcError(null);
    try {
      await markNoChange(cycle.id, ncTarget.id, ncReason, ncNote.trim() || null);
      setNcTarget(null);
      await loadLists(cycle.id);
    } catch (e) {
      setNcError(String(e));
    } finally {
      setNcSaving(false);
    }
  }

  // Ranks a "Rank Skip" can target: same track as the student, strictly
  // higher sortOrder than their current belt (includes Black Stripe, for a
  // Tiger Cub testing directly for it).
  const skipOptions = useMemo(() => {
    if (!skipTarget) return [];
    return allRanks
      .filter((r) => r.track === skipTarget.rank.track && r.sortOrder > skipTarget.rank.sortOrder)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [allRanks, skipTarget]);

  function openSkip(s: TestingRow) {
    setSkipTarget(s);
    setSkipRankId(s.targetRankId ?? "");
  }
  async function submitSkip() {
    if (!cycle || !skipTarget) return;
    setSkipSaving(true);
    try {
      await setRegistrationTarget(cycle.id, skipTarget.id, skipRankId === "" ? null : skipRankId);
      setSkipTarget(null);
      await loadLists(cycle.id);
    } finally {
      setSkipSaving(false);
    }
  }

  async function promote() {
    if (!cycle) return;
    const msg = roster.length > 0
      ? `Process testing — promote all ${roster.length} registered students to their next belt, and roll the cycle's dates forward for the next round? This cannot be undone.`
      : `Roll the cycle's dates forward for the next round? No one is left to promote. This cannot be undone.`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const res = await promoteCycle(cycle.id);
      setResults(res);
      // promoteCycle rolls the cycle's dates forward — refetch so the date
      // fields and attendance-window-dependent lists reflect the new window.
      const fresh = await getCurrentCycle();
      setCycle(fresh);
      setStart(fresh.startDate);
      setEnd(fresh.endDate);
      setTestingDate(fresh.testingDate ?? "");
      await loadLists(fresh.id);
    } finally {
      setBusy(false);
    }
  }

  async function exportTsv() {
    if (!cycle) return;
    const csv = await buildTestingCycleCsv(cycle.id);
    const saved = await saveTextFile(`testing_cycle_${cycle.startDate}_to_${cycle.endDate}.csv`, csv);
    setExportMsg(saved ? "Testing list saved." : "Export canceled.");
  }

  async function exportNonTesters() {
    if (!cycle) return;
    const csv = await buildNonTestersCsv(cycle.id);
    const saved = await saveTextFile(`not_testing_${cycle.startDate}_to_${cycle.endDate}.csv`, csv);
    setExportMsg(saved ? "Non-testers list saved." : "Export canceled.");
  }

  async function exportCertificates() {
    if (!cycle) return;
    const rows = await buildCertificateRows(cycle.id);
    if (rows.length === 0) { setExportMsg("No students with a next rank to certify."); return; }
    const saved = await exportCertificateData(rows, cycle.startDate);
    setExportMsg(saved ? `Certificate data created for ${rows.length} student${rows.length === 1 ? "" : "s"}.` : "Export canceled.");
  }

  async function exportBeltOrder() {
    if (!cycle) return;
    const [roster, breakdown] = await Promise.all([
      getBeltOrderRoster(cycle.id),
      getBeltOrderBreakdown(cycle.id),
    ]);
    const saved = await exportBeltOrderXlsx(roster, breakdown, cycle.startDate);
    setExportMsg(saved ? "Belt order spreadsheet saved." : "Export canceled.");
  }

  async function printLabels() {
    if (!cycle) return;
    const html = await buildBeltLabelsHtml(cycle.id);
    const saved = await saveTextFile(`belt_labels_${cycle.startDate}.html`, html, "html");
    setExportMsg(saved ? "Belt labels saved — open the file and print on Avery 5160 at 100% (no scaling)." : "Print canceled.");
  }

  const visibleCandidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q === ""
      ? candidates
      : candidates.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
    return sortByField(list, candSort, candDir);
  }, [candidates, filter, candSort, candDir]);

  const visibleRoster = useMemo(
    () => sortByField(roster, rosterSort, rosterDir),
    [roster, rosterSort, rosterDir],
  );

  return (
    <>
      <PageHeader
        title="Testing Cycle"
        subtitle={cycle ? `${prettyDate(cycle.startDate)} – ${prettyDate(cycle.endDate)} · ${roster.length} registered to test` : "Loading…"}
        actions={
          <>
            <Button variant="secondary" onClick={exportCertificates} disabled={roster.length === 0}><FileSpreadsheet size={16} />Certificate data</Button>
            <Button variant="secondary" onClick={printLabels} disabled={roster.length === 0}><Printer size={16} />Belt labels</Button>
            <Button variant="secondary" onClick={exportBeltOrder} disabled={roster.length === 0}><ListOrdered size={16} />Belt order</Button>
            <Button variant="secondary" onClick={exportTsv} disabled={roster.length === 0}><Download size={16} />Export</Button>
            <Button variant="secondary" onClick={exportNonTesters}><UserMinus size={16} />Not testing</Button>
            <Button
              variant="primary"
              onClick={promote}
              disabled={busy || !cycle || (roster.length === 0 && !cycle.testingDate)}
            >
              <Award size={16} />{busy ? "Processing…" : "Process Testing"}
            </Button>
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
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Testing date</span>
          <TextInput type="date" value={testingDate} onChange={(e) => setTestingDate(e.target.value)} onBlur={saveDates} className="w-44" />
        </label>
        <p className="mb-2 text-xs text-[var(--color-fg-muted)]">Attendance counts classes between the start and the testing date (or end).</p>
      </div>

      {/* Students testing outside the main testing day */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Early / late testers ({special.length})</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportSpecialSheet} disabled={special.length === 0} className="px-2 py-1 text-xs">
            <FileSpreadsheet size={14} />Export
          </Button>
          <Button variant="secondary" onClick={clearSpecial} disabled={special.length === 0} className="px-2 py-1 text-xs">
            <ListX size={14} />Clear
          </Button>
        </div>
      </div>
      <StudentSearchAdd students={addableSpecial} onAdd={addSpecial} placeholder="Type a name to add an early/late tester…" />
      {special.length === 0 ? (
        <EmptyState title="No early or late testers">Add a student above and set their testing date.</EmptyState>
      ) : (
        <div className="mb-6 overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Belt</th>
                <th className="px-3 py-2 font-medium">Testing for</th>
                <th className="px-3 py-2 font-medium text-right">Classes</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Timing</th>
                <th className="px-3 py-2 font-medium text-center">Tested</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {special.map((s) => {
                const age = ageFromDob(s.dateOfBirth);
                return (
                  <tr key={s.specialTesterId} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">{s.firstName} {s.lastName}</td>
                    <td className="px-3 py-2">{age ?? "—"}</td>
                    <td className="px-3 py-2"><BeltBadge rank={s.rank} size="sm" /></td>
                    <td className="px-3 py-2 text-[var(--color-fg-muted)]">{s.testingFor ?? "(top rank)"}</td>
                    <td className="px-3 py-2 text-right tabular-nums"><ClassesCell att={s.attendance} min={s.minClasses} met={s.meetsMinimum} /></td>
                    <td className="px-3 py-2">
                      <TextInput
                        type="date"
                        defaultValue={s.testDate}
                        onBlur={(e) => e.target.value && e.target.value !== s.testDate && changeSpecialDate(s.specialTesterId, e.target.value)}
                        className="w-36"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Tag color={s.timing === "Early" ? "#2563eb" : s.timing === "Late" ? "#ea580c" : "var(--color-fg-muted)"}>{s.timing}</Tag>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={s.tested}
                        onChange={(e) => toggleTested(s.specialTesterId, e.target.checked)}
                        className="h-4 w-4"
                        aria-label={`Mark ${s.firstName} ${s.lastName} tested`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeSpecial(s.specialTesterId)} className="text-[var(--color-fg-muted)] hover:text-red-600" aria-label="Remove"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {results && (
        <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
          <div className="mb-2 font-medium">Promotion results</div>
          {results.length === 0 ? (
            <p className="mb-2 text-[var(--color-fg-muted)]">No one was promoted (handled individually via No Change, or nothing was registered).</p>
          ) : (
            <ul className="mb-2 space-y-1">
              {results.map((r) => (
                <li key={r.studentId}>
                  {r.skipped
                    ? <span className="text-[var(--color-fg-muted)]">{r.name} — skipped ({r.skipped})</span>
                    : <span>{r.name}: {r.previousBelt} → <strong>{r.newBelt}</strong>{r.graduated ? " 🎓 graduated" : ""}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-[var(--color-fg-muted)]">
            The cycle's dates rolled forward to {prettyDate(start)} – {prettyDate(end)} with no testing date set yet — update the Cycle end and Testing date fields above once you've scheduled the next testing.
          </p>
        </div>
      )}

      {/* Registered-to-test list */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Registered to test ({roster.length})</h2>
        {roster.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-fg-muted)]">Sort by</span>
            <Select value={rosterSort} onChange={(e) => setRosterSort(e.target.value as CandSort)} className="w-36">
              <option value="first">Name</option>
              <option value="last">Last name</option>
              <option value="age">Age</option>
              <option value="belt">Belt</option>
              <option value="attendance">Attendance</option>
            </Select>
            <Button variant="secondary" onClick={() => setRosterDir((d) => (d === "asc" ? "desc" : "asc"))} className="px-2 py-1.5" aria-label="Toggle sort direction">
              {rosterDir === "asc" ? "▲" : "▼"}
            </Button>
          </div>
        )}
      </div>
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
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Testing for</th>
                <th className="px-3 py-2 font-medium text-right">Classes</th>
                <th className="px-3 py-2 font-medium">Progress</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRoster.map((s) => {
                const age = ageFromDob(s.dateOfBirth);
                return (
                  <tr key={s.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">{s.firstName} {s.lastName}</td>
                    <td className="px-3 py-2">{age ?? "—"}</td>
                    <td className="px-3 py-2"><BeltBadge rank={s.rank} size="sm" /></td>
                    <td className="px-3 py-2">{s.beltSize ?? "—"}</td>
                    <td className="px-3 py-2 text-[var(--color-fg-muted)]">
                      {s.testingFor ?? "(top rank)"}
                      {s.targetRankId != null && <span className="ml-1 text-[10px] uppercase tracking-wide text-[var(--color-brand)]">skip</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums"><ClassesCell att={s.attendanceThisCycle} min={s.minClasses} met={s.meetsMinimum} /></td>
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
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" onClick={() => openSkip(s)} className="px-2 py-1 text-xs"><SkipForward size={13} />Skip</Button>
                        <Button variant="secondary" onClick={() => openNoChange(s)} className="px-2 py-1 text-xs"><Ban size={13} />NC</Button>
                        <button onClick={() => unregister(s.id)} className="text-[var(--color-fg-muted)] hover:text-red-600" aria-label="Remove"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* All active students with attendance — register from here */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">All students — attendance this cycle</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-fg-muted)]">Sort by</span>
          <Select value={candSort} onChange={(e) => setCandSort(e.target.value as CandSort)} className="w-36">
            <option value="first">Name</option>
            <option value="last">Last name</option>
            <option value="age">Age</option>
            <option value="belt">Belt</option>
            <option value="attendance">Attendance</option>
          </Select>
          <Button variant="secondary" onClick={() => setCandDir((d) => (d === "asc" ? "desc" : "asc"))} className="px-2 py-1.5" aria-label="Toggle sort direction">
            {candDir === "asc" ? "▲" : "▼"}
          </Button>
          <TextInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name…" className="w-48" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Student</th>
              <th className="px-3 py-2 font-medium">Age</th>
              <th className="px-3 py-2 font-medium">Belt</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium text-right">Classes</th>
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
                  <td className="px-3 py-2">{s.beltSize ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><ClassesCell att={s.attendanceThisCycle} min={s.minClasses} met={s.meetsMinimum} /></td>
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
              <tr><td colSpan={6} className="p-6 text-center text-sm text-[var(--color-fg-muted)]">No students match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        open={ncTarget != null}
        onClose={() => setNcTarget(null)}
        title={ncTarget ? `No Change — ${ncTarget.firstName} ${ncTarget.lastName}` : "No Change"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNcTarget(null)} disabled={ncSaving}>Cancel</Button>
            <Button variant="primary" onClick={submitNoChange} disabled={ncSaving}>{ncSaving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        {ncError && <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{ncError}</div>}
        <p className="mb-3 text-sm text-[var(--color-fg-muted)]">
          Records that {ncTarget?.firstName} tested but wasn't promoted, and removes them from the registered-to-test list. Their belt and progress stripes aren't affected.
        </p>
        <Field label="Reason">
          <Select value={ncReason} onChange={(e) => setNcReason(e.target.value as NcReason)}>
            {NC_REASONS.map((r) => <option key={r} value={r}>{NC_REASON_LABELS[r]} ({r})</option>)}
          </Select>
        </Field>
        <Field label="Note" hint="Optional — what to remember for next time.">
          <Textarea rows={3} value={ncNote} onChange={(e) => setNcNote(e.target.value)} />
        </Field>
      </Drawer>

      <Drawer
        open={skipTarget != null}
        onClose={() => setSkipTarget(null)}
        title={skipTarget ? `Rank Skip — ${skipTarget.firstName} ${skipTarget.lastName}` : "Rank Skip"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSkipTarget(null)} disabled={skipSaving}>Cancel</Button>
            <Button variant="primary" onClick={submitSkip} disabled={skipSaving}>{skipSaving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-[var(--color-fg-muted)]">
          Promote {skipTarget?.firstName} straight to a chosen belt instead of the next one up — for testing directly for Black Stripe, or skipping ahead several belts. Leave on Default for the normal one-belt promotion.
        </p>
        <Field label="Testing for">
          <Select value={skipRankId} onChange={(e) => setSkipRankId(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">Default — {skipOptions[0]?.name ?? "top rank"}</option>
            {skipOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      </Drawer>
    </>
  );
}

function ClassesCell({ att, min, met }: { att: number; min: number; met: boolean }) {
  return (
    <span className={met ? "font-medium text-green-700" : "text-amber-600"} title={met ? "Meets the minimum to test" : `Needs ${min} classes to test`}>
      {att} / {min}
    </span>
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
