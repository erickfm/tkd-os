import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { BeltBadge } from "@/components/BeltBadge";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState, Field, Select, TextInput, Textarea } from "@/components/ui";
import {
  createStarterCourse,
  enrollInCourse,
  getCourseEnrollment,
  listStarterCourses,
  listStudents,
  unenrollFromCourse,
  type StarterCourseInput,
  type StudentRow,
} from "@/db/repos";
import type { StarterCourse } from "@/db/schema";
import { prettyDate, today } from "@/lib/format";

export function StarterCoursesPage() {
  const [courses, setCourses] = useState<StarterCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<StarterCourse | null>(null);

  async function load() {
    try { setCourses(await listStarterCourses()); }
    catch (e) { setError(String(e)); }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        title="Starter Courses"
        subtitle="Short-term introductory courses for new students."
        actions={<Button variant="primary" onClick={() => setFormOpen(true)}><Plus size={16} />Add course</Button>}
      />

      {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">{error}</div>}

      {!error && courses && courses.length === 0 && (
        <EmptyState title="No starter courses yet">Create an intro course and enroll new students.</EmptyState>
      )}

      {!error && courses && courses.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr><Th>Course</Th><Th>Dates</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {courses.map((c) => {
                const active = c.endDate >= today();
                return (
                  <tr key={c.id} onClick={() => setDetail(c)} className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <Td>{c.name}</Td>
                    <Td>{prettyDate(c.startDate)} – {prettyDate(c.endDate)}</Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-green-100 text-green-800" : "bg-[var(--color-surface-3)] text-[var(--color-fg-muted)]"}`}>
                        {active ? "Active" : "Completed"}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CourseForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
      {detail && <CourseDetail course={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function CourseForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<StarterCourseInput>({ name: "", startDate: today(), endDate: today(), notes: null });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof StarterCourseInput>(k: K, v: StarterCourseInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function save() {
    if (!form.name.trim()) { setError("Course name is required."); return; }
    if (form.endDate < form.startDate) { setError("End date must be on or after the start date."); return; }
    setSaving(true);
    try { await createStarterCourse(form); onSaved(); onClose(); setForm({ name: "", startDate: today(), endDate: today(), notes: null }); }
    catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add starter course"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>}>
      {error && <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}
      <Field label="Name"><TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Spring 2026 Starter" /></Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Start date"><TextInput type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
        <Field label="End date"><TextInput type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
      </div>
      <Field label="Notes"><Textarea rows={4} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} /></Field>
    </Drawer>
  );
}

function CourseDetail({ course, onClose }: { course: StarterCourse; onClose: () => void }) {
  const [enrolled, setEnrolled] = useState<StudentRow[]>([]);
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [toAdd, setToAdd] = useState<number | "">("");

  async function load() {
    const [e, all] = await Promise.all([getCourseEnrollment(course.id), listStudents()]);
    setEnrolled(e);
    setAllStudents(all);
  }
  useEffect(() => { load(); }, [course.id]);

  const addable = useMemo(() => {
    const on = new Set(enrolled.map((r) => r.id));
    return allStudents.filter((s) => s.isActive && !on.has(s.id));
  }, [enrolled, allStudents]);

  async function add() { if (toAdd === "") return; await enrollInCourse(course.id, Number(toAdd)); setToAdd(""); await load(); }
  async function remove(id: number) { await unenrollFromCourse(course.id, id); await load(); }

  return (
    <Drawer open onClose={onClose} title={course.name} width="max-w-2xl">
      <div className="mb-4 text-sm text-[var(--color-fg-muted)]">{prettyDate(course.startDate)} – {prettyDate(course.endDate)}</div>
      {course.notes && <p className="mb-4 whitespace-pre-wrap text-sm">{course.notes}</p>}

      <div className="mb-3 flex items-center gap-2">
        <Select value={toAdd} onChange={(e) => setToAdd(e.target.value === "" ? "" : Number(e.target.value))} className="flex-1">
          <option value="">Enroll a student…</option>
          {addable.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.rank.name}</option>)}
        </Select>
        <Button variant="secondary" onClick={add} disabled={toAdd === ""}><UserPlus size={16} />Enroll</Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
            <tr><th className="px-3 py-2 font-medium">Student</th><th className="px-3 py-2 font-medium">Belt</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {enrolled.map((s) => (
              <tr key={s.id} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2">{s.firstName} {s.lastName}</td>
                <td className="px-3 py-2"><BeltBadge rank={s.rank} size="sm" /></td>
                <td className="px-3 py-2 text-right"><button onClick={() => remove(s.id)} className="text-[var(--color-fg-muted)] hover:text-red-600" aria-label="Remove"><Trash2 size={15} /></button></td>
              </tr>
            ))}
            {enrolled.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-sm text-[var(--color-fg-muted)]">No students enrolled yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-4 py-2.5 font-medium">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-4 py-2.5">{children}</td>; }
