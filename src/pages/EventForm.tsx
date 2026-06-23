import { useState } from "react";

import { Drawer } from "@/components/Drawer";
import { Button, Field, Select, TextInput, Textarea } from "@/components/ui";
import { EVENT_TYPES } from "@/db/enums";
import { createEvent, updateEvent, type EventInput } from "@/db/repos";
import type { EventRow } from "@/db/schema";
import { today } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: EventRow | null;
}

function blank(): EventInput {
  return { name: "", eventDate: today(), eventTime: null, eventType: "Seminar", location: null, notes: null };
}

export function EventForm({ open, onClose, onSaved, editing }: Props) {
  const [form, setForm] = useState<EventInput>(blank());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<number | "new" | null>(null);
  const key = editing ? editing.id : "new";
  if (open && seededFor !== key) {
    setSeededFor(key);
    setForm(editing
      ? { name: editing.name, eventDate: editing.eventDate, eventTime: editing.eventTime, eventType: editing.eventType, location: editing.location, notes: editing.notes }
      : blank());
    setError(null);
  }

  function set<K extends keyof EventInput>(k: K, v: EventInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name.trim()) { setError("Event name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      if (editing) await updateEvent(editing.id, form);
      else await createEvent(form);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={editing ? "Edit event" : "Add event"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      }>
      {error && <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>}
      <Field label="Name"><TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Summer Tournament 2026" /></Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Date"><TextInput type="date" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} /></Field>
        <Field label="Time"><TextInput type="time" value={form.eventTime ?? ""} onChange={(e) => set("eventTime", e.target.value || null)} /></Field>
      </div>
      <Field label="Type">
        <Select value={form.eventType} onChange={(e) => set("eventType", e.target.value)}>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Location"><TextInput value={form.location ?? ""} onChange={(e) => set("location", e.target.value || null)} /></Field>
      <Field label="Notes"><Textarea rows={4} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} /></Field>
    </Drawer>
  );
}
