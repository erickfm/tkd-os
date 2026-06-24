import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { BeltBadge } from "@/components/BeltBadge";
import { Select, TextInput } from "@/components/ui";
import { CLASS_TYPE_LABELS, CLASS_TYPES } from "@/db/enums";
import {
  getOrCreateSession,
  getSessionStatuses,
  setAttendance,
  studentsForClass,
  type ClassType,
  type StudentRow,
} from "@/db/repos";
import { today } from "@/lib/format";

export function AttendancePage() {
  const [date, setDate] = useState(today());
  const [classType, setClassType] = useState<ClassType>("tiger");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [roster, setRoster] = useState<StudentRow[]>([]);
  const [statuses, setStatuses] = useState<Map<number, string>>(new Map());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sid = await getOrCreateSession(date, classType);
        const [students, st] = await Promise.all([
          studentsForClass(classType),
          getSessionStatuses(sid),
        ]);
        setSessionId(sid);
        setRoster(students);
        setStatuses(st);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [date, classType]);

  async function toggle(studentId: number) {
    if (sessionId == null) return;
    const next = statuses.get(studentId) === "present" ? "unmarked" : "present";
    setStatuses((m) => new Map(m).set(studentId, next));
    await setAttendance(sessionId, studentId, next);
  }

  const presentCount = roster.filter((r) => statuses.get(r.id) === "present").length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(q));
  }, [roster, search]);

  return (
    <>
      <PageHeader title="Attendance" subtitle={`${presentCount} present · ${roster.length} in this class`} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <Select value={classType} onChange={(e) => setClassType(e.target.value as ClassType)} className="w-64">
          {CLASS_TYPES.map((ct) => (
            <option key={ct} value={ct}>{CLASS_TYPE_LABELS[ct]}</option>
          ))}
        </Select>
        <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="w-56" />
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">{error}</div>
      )}

      {!error && (
        <>
          <p className="mb-2 text-xs text-[var(--color-fg-muted)]">Tap a student to mark them present. Tap again to undo.</p>
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <ul>
              {visible.map((r) => {
                const present = statuses.get(r.id) === "present";
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => toggle(r.id)}
                      className={`flex w-full items-center gap-3 border-t border-[var(--color-border)] px-4 py-2.5 text-left text-sm first:border-t-0 ${present ? "bg-green-50" : "hover:bg-[var(--color-surface-2)]"}`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${present ? "border-green-600 bg-green-600 text-white" : "border-[var(--color-border)]"}`}>
                        {present && <Check size={13} />}
                      </span>
                      <span className={`flex-1 ${present ? "font-medium" : ""}`}>{r.firstName} {r.lastName}</span>
                      <BeltBadge rank={r.rank} size="sm" />
                    </button>
                  </li>
                );
              })}
              {visible.length === 0 && !loading && (
                <li className="p-10 text-center text-sm text-[var(--color-fg-muted)]">
                  {roster.length === 0 ? "No eligible students for this class." : "No students match your search."}
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
