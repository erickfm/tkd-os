import { useState } from "react";

import { Card, EmptyNote, Note, ReportShell, Segmented, Stat, StatGrid, useReport, pct } from "@/components/reportUi";
import { getBeltPyramidReport, type PyramidFilter } from "@/db/repos";
import type { Pyramid } from "@/lib/reports";

const FILTERS: { value: PyramidFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "tiger", label: "Tiger Cubs" },
  { value: "jr", label: "Jr." },
  { value: "adult", label: "Adult" },
];

export function PyramidReportPage() {
  const [filter, setFilter] = useState<PyramidFilter>("all");
  const { data, error } = useReport(() => getBeltPyramidReport(filter), [filter]);

  return (
    <ReportShell
      title="Belt pyramid"
      subtitle="How many active students are at each rank. A healthy school is wide at the bottom and narrows toward black belt."
      error={error}
      controls={<Segmented options={FILTERS} value={filter} onChange={setFilter} />}
    >
      {data && <Body p={data} />}
    </ReportShell>
  );
}

function Body({ p }: { p: Pyramid }) {
  if (p.total === 0) return <EmptyNote>No active students in this group.</EmptyNote>;
  const max = Math.max(1, ...p.rows.map((r) => r.count));
  const top = [...p.rows].reverse(); // highest rank first, so it reads like a pyramid

  return (
    <>
      <StatGrid cols={5}>
        {p.groups.filter((g) => g.levels > 0).map((g) => (
          <Stat key={g.group} label={g.group} value={g.count} sub={`${pct(g.share)} of students · ${g.perLevel.toFixed(1)} per belt`} />
        ))}
      </StatGrid>

      {p.bulges.length === 0 ? (
        <Note>
          The shape looks healthy: each group of belts has fewer students per belt level than the group below it, so students are moving up rather than piling up in the middle.
          (Tiger Cubs are their own program, so they aren't part of this comparison.)
        </Note>
      ) : (
        <Note tone="warn">
          Where the pyramid bulges: {p.bulges.join(" ")} A bulge can mean students are stalling at that stage, or that it's been a strong recruiting year.
        </Note>
      )}

      <Card title={`${p.total} active students by rank`} hint="Highest rank at the top. Each bar uses the belt's own color.">
        <div className="space-y-px">
          {top.map((r, i) => (
            <div key={r.rankId}>
              {(i === 0 || top[i - 1].group !== r.group) && (
                <div className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)] first:mt-0">{r.group}</div>
              )}
              <div className="flex items-center gap-2 text-xs">
                <div className="w-44 shrink-0 truncate text-right" title={r.name}>{r.name}</div>
                <div className="flex h-4 flex-1 justify-center">
                  <div
                    className="h-full rounded-sm border border-black/15"
                    style={{ width: `${(r.count / max) * 100}%`, minWidth: r.count > 0 ? 4 : 0, background: r.colorHex }}
                  />
                </div>
                <div className="w-8 shrink-0 tabular-nums">{r.count}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

export { Body as PyramidBody };
