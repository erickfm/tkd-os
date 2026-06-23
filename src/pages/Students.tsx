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
import { BELT_SIZES } from "@/db/enums";
import { AGE_GROUP_LABEL, prettyDate, TRACK_LABEL } from "@/lib/format";

type TrackFilter = "all" | "regular" | "tiger";
type Special = "all" | "black" | "ptt";
type SortKey = "name" | "belt" | "track" | "ageGroup" | "beltSize" | "joined";
type SortDir = "asc" | "desc";

const ageGroupSort = (r: StudentRow) => (r.track === "tiger" ? "" : AGE_GROUP_LABEL[r.ageGroup]);
const beltSizeSort = (r: StudentRow) => {
  if (r.beltSize == null) return BELT_SIZES.length + 1;
  const i = BELT_SIZES.indexOf(r.beltSize as (typeof BELT_SIZES)[number]);
  return i === -1 ? BELT_SIZES.length : i;
};

// Ascending comparator per column; direction is applied by the caller.
const COMPARATORS: Record<SortKey, (a: StudentRow, b: StudentRow) => number> = {
  name: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
  belt: (a, b) => a.rank.track.localeCompare(b.rank.track) || a.rank.sortOrder - b.rank.sortOrder,
  track: (a, b) => TRACK_LABEL[a.track].localeCompare(TRACK_LABEL[b.track]),
  ageGroup: (a, b) => ageGroupSort(a).localeCompare(ageGroupSort(b)),
  beltSize: (a, b) => beltSizeSort(a) - beltSizeSort(b),
  joined: (a, b) => a.joinDate.localeCompare(b.joinDate),
};

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
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
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
    const out = rows
      .filter((r) => (showInactive ? true : r.isActive))
      .filter((r) => (track === "all" ? true : r.track === track))
      .filter((r) =>
        special === "all" ? true
          : special === "black" ? r.rank.degree != null
          : r.permissionToTest)
      .filter((r) => q === "" ? true : `${r.firstName} ${r.lastName}`.toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const v = COMPARATORS[sortKey](a, b);
      if (v !== 0) return dir * v;
      // Stable tie-break by name, always ascending.
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });
    return out;
  }, [rows, search, sortKey, sortDir, track, special, showInactive]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

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
                  <tr>
                    <SortTh label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Belt" col="belt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Track" col="track" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Age Group" col="ageGroup" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Belt Size" col="beltSize" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Joined" col="joined" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </tr>
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

function SortTh({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="px-4 py-2.5 font-medium">
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide ${active ? "text-[var(--color-fg)]" : "hover:text-[var(--color-fg)]"}`}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        {active && <span className="text-[9px] leading-none">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
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
