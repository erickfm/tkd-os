import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { BeltBadge } from "@/components/BeltBadge";
import { Drawer } from "@/components/Drawer";
import { Button, EmptyState } from "@/components/ui";
import { StudentSearchAdd } from "@/components/StudentSearchAdd";
import { EventForm } from "./EventForm";
import {
  addToRoster,
  buildEventRosterCsv,
  getEventRoster,
  listEvents,
  listStudents,
  removeFromRoster,
  type StudentRow,
} from "@/db/repos";
import type { EventRow } from "@/db/schema";
import { saveTextFile } from "@/lib/download";
import { prettyDate } from "@/lib/format";

export function EventsPage() {
  const [evts, setEvts] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [detail, setDetail] = useState<EventRow | null>(null);

  async function load() {
    try { setEvts(await listEvents()); }
    catch (e) { setError(String(e)); }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Seminars, tournaments, demos, and camps."
        actions={<Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} />Add event</Button>}
      />

      {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">{error}</div>}

      {!error && evts && evts.length === 0 && (
        <EmptyState title="No events yet">Create a tournament, seminar, or demo to get started.</EmptyState>
      )}

      {!error && evts && evts.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr><Th>Event</Th><Th>Date</Th><Th>Type</Th><Th>Location</Th></tr>
            </thead>
            <tbody>
              {evts.map((e) => (
                <tr key={e.id} onClick={() => setDetail(e)} className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                  <Td>{e.name}</Td>
                  <Td>{prettyDate(e.eventDate)}{e.eventTime ? ` · ${e.eventTime}` : ""}</Td>
                  <Td><span className="rounded-full bg-[var(--color-surface-3)] px-2 py-0.5 text-xs">{e.eventType}</span></Td>
                  <Td>{e.location ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EventForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} editing={editing} />

      {detail && (
        <EventDetail
          event={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); setFormOpen(true); }}
        />
      )}
    </>
  );
}

function EventDetail({ event, onClose, onEdit }: { event: EventRow; onClose: () => void; onEdit: () => void }) {
  const [roster, setRoster] = useState<StudentRow[]>([]);
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  async function load() {
    const [r, all] = await Promise.all([getEventRoster(event.id), listStudents()]);
    setRoster(r);
    setAllStudents(all);
  }
  useEffect(() => { load(); }, [event.id]);

  const addable = useMemo(() => {
    const on = new Set(roster.map((r) => r.id));
    return allStudents.filter((s) => s.isActive && !on.has(s.id));
  }, [roster, allStudents]);

  async function add(studentId: number) {
    await addToRoster(event.id, studentId);
    await load();
  }
  async function remove(studentId: number) {
    await removeFromRoster(event.id, studentId);
    await load();
  }
  async function exportTsv() {
    const csv = await buildEventRosterCsv(event.id);
    const safe = event.name.replace(/[^a-z0-9]+/gi, "_");
    const saved = await saveTextFile(`${safe}_roster.csv`, csv);
    setExportMsg(saved ? "Roster saved." : "Export canceled.");
  }

  return (
    <Drawer open onClose={onClose} title={event.name} width="max-w-2xl"
      footer={
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onEdit}>Edit details</Button>
          <Button variant="secondary" onClick={exportTsv} disabled={roster.length === 0}><Download size={16} />Export roster</Button>
        </div>
      }>
      <div className="mb-4 text-sm text-[var(--color-fg-muted)]">
        {prettyDate(event.eventDate)}{event.eventTime ? ` · ${event.eventTime}` : ""} · {event.eventType}
        {event.location ? ` · ${event.location}` : ""}
      </div>
      {event.notes && <p className="mb-4 whitespace-pre-wrap text-sm">{event.notes}</p>}
      {exportMsg && <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-sm">{exportMsg}</div>}

      <StudentSearchAdd students={addable} onAdd={add} placeholder="Type a name to add to the roster…" />

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
            <tr><th className="px-3 py-2 font-medium">Student</th><th className="px-3 py-2 font-medium">Belt</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {roster.map((s) => (
              <tr key={s.id} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2">{s.firstName} {s.lastName}</td>
                <td className="px-3 py-2"><BeltBadge rank={s.rank} size="sm" /></td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => remove(s.id)} className="text-[var(--color-fg-muted)] hover:text-red-600" aria-label="Remove"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {roster.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-sm text-[var(--color-fg-muted)]">No students on the roster yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-4 py-2.5 font-medium">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-4 py-2.5">{children}</td>; }
