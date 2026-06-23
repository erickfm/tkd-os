import { useMemo, useState } from "react";

import type { StudentRow } from "@/db/repos";

// Type-to-filter box for adding a student to a list: narrows the options as you
// type a whole or partial name (mirrors the Students-tab search), click to add.
export function StudentSearchAdd({
  students,
  onAdd,
  placeholder = "Type a name to add…",
}: {
  students: StudentRow[];
  onAdd: (id: number) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return students;
    return students.filter((s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q),
    );
  }, [students, query]);

  function choose(id: number) {
    onAdd(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div
      className="relative mb-3"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches.length > 0) { e.preventDefault(); choose(matches[0].id); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--color-fg-muted)]">
              {students.length === 0 ? "Everyone is already on the list." : "No matching students."}
            </div>
          ) : (
            matches.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)]"
              >
                <span>{s.firstName} {s.lastName}</span>
                <span className="text-xs text-[var(--color-fg-muted)]">{s.rank.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
