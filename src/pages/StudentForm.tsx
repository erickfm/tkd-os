import { useEffect, useMemo, useState } from "react";

import { Drawer } from "@/components/Drawer";
import { BeltBadge } from "@/components/BeltBadge";
import { Button, Field, Select, TextInput, Textarea } from "@/components/ui";
import { BELT_SIZES, CLASS_TYPE_LABELS } from "@/db/enums";
import type { BeltRank } from "@/db/schema";
import {
  createStudent,
  getProgress,
  getStudentAttendance,
  listRankHistory,
  setStudentActive,
  updateProgress,
  updateStudent,
  type StudentAttendanceSummary,
  type StudentInput,
  type StudentRow,
} from "@/db/repos";
import { ageFromDob, prettyDate, today } from "@/lib/format";

type RankHistoryEntry = Awaited<ReturnType<typeof listRankHistory>>[number];

type ProgressState = {
  greenStripe: boolean;
  blueStripe: boolean;
  orangeStripe: boolean;
  redStripe: boolean;
  permissionToTest: boolean;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  ranks: BeltRank[];
  editing: StudentRow | null;
}

function blank(): StudentInput {
  return {
    firstName: "", lastName: "", dateOfBirth: null, phone: null, email: null,
    guardian1Name: null, guardian1Phone: null, guardian1Email: null,
    guardian2Name: null, guardian2Phone: null, guardian2Email: null,
    emergencyContact: null, track: "regular", ageGroup: "jr",
    beltRankId: 0, beltSize: null, joinDate: today(), trialStartDate: null, notes: null,
  };
}

export function StudentForm({ open, onClose, onSaved, ranks, editing }: Props) {
  const [form, setForm] = useState<StudentInput>(blank());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-seed the form whenever which student we're editing changes.
  const [seededFor, setSeededFor] = useState<number | "new" | null>(null);
  const key = editing ? editing.id : "new";
  if (open && seededFor !== key) {
    setSeededFor(key);
    setForm(
      editing
        ? {
            firstName: editing.firstName, lastName: editing.lastName,
            dateOfBirth: editing.dateOfBirth, phone: editing.phone,
            email: editing.email,
            guardian1Name: editing.guardian1Name, guardian1Phone: editing.guardian1Phone,
            guardian1Email: editing.guardian1Email,
            guardian2Name: editing.guardian2Name, guardian2Phone: editing.guardian2Phone,
            guardian2Email: editing.guardian2Email,
            emergencyContact: editing.emergencyContact,
            track: editing.track, ageGroup: editing.ageGroup,
            beltRankId: editing.beltRankId, beltSize: editing.beltSize,
            joinDate: editing.joinDate, trialStartDate: editing.trialStartDate,
            notes: editing.notes,
          }
        : blank(),
    );
    setError(null);
  }

  const [progress, setProgress] = useState<ProgressState | null>(null);
  useEffect(() => {
    if (!open || !editing) { setProgress(null); return; }
    getProgress(editing.id).then((p) =>
      setProgress(p
        ? {
            greenStripe: p.greenStripe, blueStripe: p.blueStripe,
            orangeStripe: p.orangeStripe, redStripe: p.redStripe,
            permissionToTest: p.permissionToTest,
          }
        : null),
    );
  }, [open, editing]);

  async function toggleProgress(k: keyof ProgressState) {
    if (!editing || !progress) return;
    const next = { ...progress, [k]: !progress[k] };
    setProgress(next);
    await updateProgress(editing.id, { [k]: next[k] });
  }

  const [attendance, setAttendance] = useState<StudentAttendanceSummary | null>(null);
  useEffect(() => {
    if (!open || !editing) { setAttendance(null); return; }
    getStudentAttendance(editing.id).then(setAttendance);
  }, [open, editing]);

  const [history, setHistory] = useState<RankHistoryEntry[] | null>(null);
  useEffect(() => {
    if (!open || !editing) { setHistory(null); return; }
    listRankHistory(editing.id).then(setHistory);
  }, [open, editing]);

  const ranksForTrack = useMemo(
    () => ranks.filter((r) => r.track === form.track),
    [ranks, form.track],
  );

  function set<K extends keyof StudentInput>(k: K, v: StudentInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function changeTrack(track: string) {
    const first = ranks.find((r) => r.track === track);
    setForm((f) => ({ ...f, track, beltRankId: first?.id ?? 0 }));
  }

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    const beltRankId = form.beltRankId || ranksForTrack[0]?.id;
    if (!beltRankId) { setError("Pick a belt rank."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, beltRankId, joinDate: form.joinDate || today() };
      if (editing) await updateStudent(editing.id, payload);
      else await createStudent(payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!editing) return;
    setSaving(true);
    try {
      await setStudentActive(editing.id, !editing.isActive);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? "Edit student" : "Add student"}
      footer={
        <div className="flex items-center justify-between">
          {editing ? (
            <Button variant={editing.isActive ? "danger" : "secondary"} onClick={toggleActive} disabled={saving}>
              {editing.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      }
    >
      {error && (
        <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="First name"><TextInput value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
        <Field label="Last name"><TextInput value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
      </div>

      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Track">
          <Select value={form.track} onChange={(e) => changeTrack(e.target.value)}>
            <option value="regular">Jr./Adult</option>
            <option value="tiger">Tiger Cubs</option>
          </Select>
        </Field>
        {form.track === "regular" ? (
          <Field label="Age group">
            <Select value={form.ageGroup} onChange={(e) => set("ageGroup", e.target.value)}>
              <option value="jr">Jr.</option>
              <option value="adult">Adult</option>
            </Select>
          </Field>
        ) : <span />}
      </div>

      <Field label="Belt rank">
        <Select value={form.beltRankId} onChange={(e) => set("beltRankId", Number(e.target.value))}>
          {ranksForTrack.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Belt size">
          <Select value={form.beltSize ?? ""} onChange={(e) => set("beltSize", e.target.value || null)}>
            <option value="">—</option>
            {BELT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label={`Date of birth${ageFromDob(form.dateOfBirth) != null ? ` · age ${ageFromDob(form.dateOfBirth)}` : ""}`}>
          <TextInput type="date" value={form.dateOfBirth ?? ""} onChange={(e) => set("dateOfBirth", e.target.value || null)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Join date">
          <TextInput type="date" value={form.joinDate} onChange={(e) => set("joinDate", e.target.value)} />
        </Field>
        <Field label="Trial start date" hint="Leave blank if not on a trial (6 weeks).">
          <TextInput type="date" value={form.trialStartDate ?? ""} onChange={(e) => set("trialStartDate", e.target.value || null)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Phone"><TextInput value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} /></Field>
        <Field label="Email"><TextInput value={form.email ?? ""} onChange={(e) => set("email", e.target.value || null)} /></Field>
      </div>

      <div className="mb-3 rounded-md border border-[var(--color-border)] p-3">
        <div className="mb-2 text-sm font-medium">Guardian 1</div>
        <Field label="Name"><TextInput value={form.guardian1Name ?? ""} onChange={(e) => set("guardian1Name", e.target.value || null)} /></Field>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Phone"><TextInput value={form.guardian1Phone ?? ""} onChange={(e) => set("guardian1Phone", e.target.value || null)} /></Field>
          <Field label="Email"><TextInput value={form.guardian1Email ?? ""} onChange={(e) => set("guardian1Email", e.target.value || null)} /></Field>
        </div>
      </div>

      <div className="mb-3 rounded-md border border-[var(--color-border)] p-3">
        <div className="mb-2 text-sm font-medium">Guardian 2</div>
        <Field label="Name"><TextInput value={form.guardian2Name ?? ""} onChange={(e) => set("guardian2Name", e.target.value || null)} /></Field>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Phone"><TextInput value={form.guardian2Phone ?? ""} onChange={(e) => set("guardian2Phone", e.target.value || null)} /></Field>
          <Field label="Email"><TextInput value={form.guardian2Email ?? ""} onChange={(e) => set("guardian2Email", e.target.value || null)} /></Field>
        </div>
      </div>

      <Field label="Emergency contact">
        <TextInput value={form.emergencyContact ?? ""} onChange={(e) => set("emergencyContact", e.target.value || null)} />
      </Field>

      <Field label="Notes">
        <Textarea rows={4} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
      </Field>

      {editing && progress && (
        <div className="mt-2 rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 text-sm font-medium">Current belt progress</div>
          <div className="flex flex-wrap gap-2">
            {form.track === "regular" && (
              <>
                <Toggle on={progress.greenStripe} onClick={() => toggleProgress("greenStripe")}>Green stripe</Toggle>
                <Toggle on={progress.blueStripe} onClick={() => toggleProgress("blueStripe")}>Blue stripe</Toggle>
                <Toggle on={progress.orangeStripe} onClick={() => toggleProgress("orangeStripe")}>Orange stripe</Toggle>
                <Toggle on={progress.redStripe} onClick={() => toggleProgress("redStripe")}>Red stripe</Toggle>
              </>
            )}
            <Toggle on={progress.permissionToTest} onClick={() => toggleProgress("permissionToTest")}>Permission to test</Toggle>
          </div>
          <p className="mt-2 text-xs text-[var(--color-fg-muted)]">Resets automatically when the student is promoted.</p>
        </div>
      )}

      {editing && history && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 text-sm font-medium">Promotion history{history.length > 0 ? ` (${history.length})` : ""}</div>
          {history.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-muted)]">No promotions recorded yet.</p>
          ) : (
            <ul className="max-h-64 overflow-auto text-sm">
              {history.map((row) => (
                <li key={row.h.id} className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] py-1.5 first:border-t-0">
                  <span className="shrink-0 text-[var(--color-fg-muted)]">{prettyDate(row.h.promotionDate)}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <BeltBadge rank={row.to} size="sm" />
                    {row.h.note && <span className="truncate text-xs text-[var(--color-fg-muted)]" title={row.h.note}>{row.h.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && attendance && (
        <div className="mt-3 rounded-md border border-[var(--color-border)] p-3">
          <div className="mb-2 text-sm font-medium">Attendance history</div>
          <div className="mb-3 flex gap-6 text-sm">
            <div><span className="text-2xl font-semibold">{attendance.total}</span> <span className="text-[var(--color-fg-muted)]">classes total</span></div>
            <div><span className="text-2xl font-semibold">{attendance.sinceLastPromotion}</span> <span className="text-[var(--color-fg-muted)]">since last promotion</span></div>
          </div>
          {attendance.recent.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-muted)]">No classes recorded yet.</p>
          ) : (
            <ul className="max-h-64 overflow-auto text-sm">
              {attendance.recent.map((c, i) => (
                <li key={i} className="flex justify-between border-t border-[var(--color-border)] py-1 first:border-t-0">
                  <span>{prettyDate(c.date)}</span>
                  <span className="text-[var(--color-fg-muted)]">{c.classType === "legacy" ? "Class" : CLASS_TYPE_LABELS[c.classType as keyof typeof CLASS_TYPE_LABELS] ?? c.classType}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white" : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"}`}>
      {children}
    </button>
  );
}
