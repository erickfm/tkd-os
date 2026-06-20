import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, UserCog, X } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { BeltBadge } from "@/components/BeltBadge";
import { Button, EmptyState } from "@/components/ui";
import { StudentForm } from "./StudentForm";
import {
  autoFlagAdultsByDob,
  listBeltRanks,
  listStudents,
  type StudentRow,
} from "@/db/repos";
import type { BeltRank } from "@/db/schema";
import { AGE_GROUP_LABEL, prettyDate, TRACK_LABEL } from "@/lib/format";

type TrackFilter = "all" | "regular" | "tiger";
type Special = "all" | "black" | "ptt";

const SPECIAL_LABEL: Record<Exclude<Special, "all">, string> = {
  black: "Black belts",
  ptt: "Ready to test",
};

export function StudentsPage() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [ranks, setRanks] = useState<BeltRank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [track, setTrack] = useState<TrackFilter>("all");
  const [special, setSpecial] = useState<Special>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);

  // Apply incoming filters from dashboard drill-downs (once per param change).
  useEffect(() => {
    const t = params.get("track");
    if (t === "tiger" || t === "regular") setTrack(t);
    const f = params.get("filter");
    if (f === "black" || f === "ptt") setSpecial(f);
  }, [params]);

  async function load() {
    try {
      const [s, r] = await Promise.all([listStudents(), listBeltRanks()]);
      setRows(s);
      setRanks(r);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (showInactive ? true : r.isActive))
      .filter((r) => (track === "all" ? true : r.track === track))
      .filter((r) =>
        special === "all" ? true
          : special === "black" ? r.rank.degree != null
          : r.permissionToTest)
      .filter((r) => q === "" ? true : `${r.firstName} ${r.lastName}`.toLowerCase().includes(q));
  }, [rows, search, track, special, showInactive]);

  function openNew() { setEditing(null); setDrawerOpen(true); }
  function openEdit(r: StudentRow) { setEditing(r); setDrawerOpen(true); }

  function clearSpecial() {
    setSpecial("all");
    params.delete("filter");
    setParams(params, { replace: true });
  }

  async function flagAdults() {
    const n = await autoFlagAdultsByDob(18);
    await load();
    alert(`Flagged ${n} student${n === 1 ? "" : "s"} as Adult (18+ by birthdate).`);
  }

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={rows ? `${filtered.length} shown of ${rows.length} total` : "Loading…"}
        actions={
          <>
            <Button variant="secondary" onClick={flagAdults}><UserCog size={16} />Flag adults</Button>
            <Button variant="primary" onClick={openNew}><Plus size={16} />Add student</Button>
          </>
        }
      />

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">
          Failed to load students: {error}
        </div>
      )}

      {!error && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
            />
            <Segmented value={track} onChange={setTrack} options={[
              { value: "all", label: "All" },
              { value: "regular", label: "Jr./Adult" },
              { value: "tiger", label: "Tiger Cubs" },
            ]} />
            {special !== "all" && (
              <button onClick={clearSpecial}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)]/10 px-3 py-1 text-sm text-[var(--color-brand)]">
                {SPECIAL_LABEL[special]} <X size={14} />
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-[var(--color-brand)]" />
              Show inactive
            </label>
          </div>

          {rows && rows.length === 0 ? (
            <EmptyState title="No students yet">
              <Button variant="primary" onClick={openNew} className="mt-3"><Plus size={16} />Add your first student</Button>
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                  <tr><Th>Name</Th><Th>Belt</Th><Th>Track</Th><Th>Age Group</Th><Th>Belt Size</Th><Th>Joined</Th></tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} onClick={() => openEdit(r)} className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                      <Td>
                        <span className={r.isActive ? "" : "opacity-50 line-through"}>{r.firstName} {r.lastName}</span>
                        {r.permissionToTest && <span className="ml-2 rounded-full bg-[var(--color-brand)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-brand)]">PTT</span>}
                      </Td>
                      <Td><BeltBadge rank={r.rank} size="sm" /></Td>
                      <Td>{TRACK_LABEL[r.track]}</Td>
                      <Td>{r.track === "tiger" ? "—" : AGE_GROUP_LABEL[r.ageGroup]}</Td>
                      <Td>{r.beltSize ?? "—"}</Td>
                      <Td>{prettyDate(r.joinDate)}</Td>
                    </tr>
                  ))}
                  {filtered.length === 0 && rows && (
                    <tr><td colSpan={6} className="p-10 text-center text-sm text-[var(--color-fg-muted)]">No students match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <StudentForm
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={load}
        ranks={ranks}
        editing={editing}
      />
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2.5">{children}</td>;
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-[var(--color-border)] p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`rounded px-3 py-1.5 text-sm ${value === o.value ? "bg-[var(--color-brand)] text-white" : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
