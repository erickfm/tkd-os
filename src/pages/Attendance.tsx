import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

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

  async function mark(studentId: number, status: "present" | "absent") {
    if (sessionId == null) return;
    const current = statuses.get(studentId);
    const next = current === status ? "unmarked" : status;
    setStatuses((m) => new Map(m).set(studentId, next));
    await setAttendance(sessionId, studentId, next);
  }

  const presentCount = roster.filter((r) => statuses.get(r.id) === "present").length;

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={`${presentCount} present of ${roster.length} in class`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <Select value={classType} onChange={(e) => setClassType(e.target.value as ClassType)} className="w-64">
          {CLASS_TYPES.map((ct) => (
            <option key={ct} value={ct}>{CLASS_TYPE_LABELS[ct]}</option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">{error}</div>
      )}

      {!error && (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                <th className="px-4 py-2.5 font-medium">Belt</th>
                <th className="px-4 py-2.5 font-medium text-right">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => {
                const st = statuses.get(r.id) ?? "unmarked";
                return (
                  <tr key={r.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-2.5">{r.firstName} {r.lastName}</td>
                    <td className="px-4 py-2.5"><BeltBadge rank={r.rank} size="sm" /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <MarkButton active={st === "present"} tone="present" onClick={() => mark(r.id, "present")}><Check size={15} />Present</MarkButton>
                        <MarkButton active={st === "absent"} tone="absent" onClick={() => mark(r.id, "absent")}><X size={15} />Absent</MarkButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {roster.length === 0 && !loading && (
                <tr><td colSpan={3} className="p-10 text-center text-sm text-[var(--color-fg-muted)]">No eligible students for this class.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function MarkButton({ active, tone, onClick, children }: {
  active: boolean; tone: "present" | "absent"; onClick: () => void; children: React.ReactNode;
}) {
  const activeCls = tone === "present"
    ? "bg-green-600 text-white border-green-600"
    : "bg-red-500 text-white border-red-500";
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${active ? activeCls : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"}`}>
      {children}
    </button>
  );
}
