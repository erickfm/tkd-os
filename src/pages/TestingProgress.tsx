import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { BeltBadge } from "@/components/BeltBadge";
import {
  listStudentsWithProgress,
  updateProgress,
  type ProgressRow,
} from "@/db/repos";
import { beltRankOrder, TRACK_LABEL } from "@/lib/format";

type TrackFilter = "all" | "regular" | "tiger";
type SortKey = "name" | "belt";
type SortDir = "asc" | "desc";

// Stripe columns, in the order the instructors award them. Stripes are for the
// regular (Jr./Adult) track only — Tiger Cubs earn Permission to Test only.
const STRIPES = [
  { field: "blueStripe", label: "Blue", color: "#2563eb" },
  { field: "orangeStripe", label: "Orange", color: "#ea580c" },
  { field: "redStripe", label: "Red", color: "#dc2626" },
  { field: "greenStripe", label: "Green", color: "#16a34a" },
] as const;

type ProgressField = (typeof STRIPES)[number]["field"] | "permissionToTest";

const COMPARATORS: Record<SortKey, (a: ProgressRow, b: ProgressRow) => number> = {
  name: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
  belt: (a, b) => beltRankOrder(a.rank) - beltRankOrder(b.rank),
};

export function TestingProgressPage() {
  const [rows, setRows] = useState<ProgressRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [track, setTrack] = useState<TrackFilter>("all");
  const [showInactive, setShowInactive] = useState(false);

  async function load() {
    try {
      setRows(await listStudentsWithProgress());
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => { load(); }, []);

  async function toggle(row: ProgressRow, field: ProgressField) {
    const next = !row[field];
    // Optimistic: flip locally, then persist.
    setRows((rs) => rs?.map((r) => (r.id === row.id ? { ...r, [field]: next } : r)) ?? null);
    await updateProgress(row.id, { [field]: next });
  }

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const out = rows
      .filter((r) => (showInactive ? true : r.isActive))
      .filter((r) => (track === "all" ? true : r.track === track))
      .filter((r) => (q === "" ? true : `${r.firstName} ${r.lastName}`.toLowerCase().includes(q)));
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const v = COMPARATORS[sortKey](a, b);
      if (v !== 0) return dir * v;
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    });
    return out;
  }, [rows, search, sortKey, sortDir, track, showInactive]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  return (
    <>
      <PageHeader
        title="Testing Progress"
        subtitle={rows ? `${filtered.length} shown of ${rows.length} total` : "Loading…"}
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
            <label className="ml-auto flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-[var(--color-brand)]" />
              Show inactive
            </label>
          </div>

          <p className="mb-2 text-xs text-[var(--color-fg-muted)]">
            Tap a stripe or Permission to test to award it; tap again to remove. Tiger Cubs earn Permission to test only.
          </p>

          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                <tr>
                  <SortTh label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Belt" col="belt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  {STRIPES.map((s) => (
                    <th key={s.field} className="px-3 py-2.5 text-center font-medium">{s.label}</th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-medium">Permission<br />to test</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isTiger = r.track === "tiger";
                  return (
                    <tr key={r.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                      <td className="px-4 py-2.5">
                        <span className={r.isActive ? "" : "opacity-50 line-through"}>{r.firstName} {r.lastName}</span>
                        <span className="ml-2 text-xs text-[var(--color-fg-muted)]">{TRACK_LABEL[r.track]}</span>
                      </td>
                      <td className="px-4 py-2.5"><BeltBadge rank={r.rank} size="sm" /></td>
                      {STRIPES.map((s) => (
                        <td key={s.field} className="px-3 py-2.5 text-center">
                          {isTiger
                            ? <span className="text-[var(--color-fg-muted)]">—</span>
                            : <Toggle on={r[s.field]} color={s.color} label={s.label} onClick={() => toggle(r, s.field)} />}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center">
                        <Toggle on={r.permissionToTest} color="var(--color-brand)" label="Ready" onClick={() => toggle(r, "permissionToTest")} />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && rows && (
                  <tr><td colSpan={STRIPES.length + 3} className="p-10 text-center text-sm text-[var(--color-fg-muted)]">No students match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Toggle({ on, color, label, onClick }: {
  on: boolean; color: string; label: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `Remove ${label}` : `Award ${label}`}
      className="inline-flex min-w-[3.5rem] items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition"
      style={on
        ? { backgroundColor: color, borderColor: color, color: "white" }
        : { borderColor: "var(--color-border)", color: "var(--color-fg-muted)" }}
    >
      {on ? <Check size={12} /> : null}
      {label}
    </button>
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
