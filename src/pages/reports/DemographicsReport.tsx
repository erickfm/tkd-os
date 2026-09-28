import { useState } from "react";

import { BarRow, Card, EmptyNote, Note, ReportShell, Stat, StatGrid, Table, Td, useReport, num1, pct } from "@/components/reportUi";
import { getDemographicsReport, setStudentGender, type DemographicsReport } from "@/db/repos";
import { GENDERS } from "@/db/enums";
import type { FamilyGroup } from "@/lib/reports";

export function DemographicsReportPage() {
  const [refresh, setRefresh] = useState(0);
  const { data, error } = useReport(() => getDemographicsReport(), [refresh]);

  return (
    <ReportShell
      title="Demographics"
      subtitle="Who trains here: age groups, kids and adults, gender, and families."
      error={error}
    >
      {data && <Body d={data} onChanged={() => setRefresh((n) => n + 1)} />}
    </ReportShell>
  );
}

function familyKind(f: FamilyGroup): string {
  if (f.minors >= 2 && f.adults >= 1) return "Parent + siblings";
  if (f.minors >= 2) return "Siblings";
  if (f.minors === 1 && f.adults >= 1) return "Parent + child";
  if (f.adults >= 2 && f.minors === 0) return "Adults";
  return "Household";
}

function Body({ d, onChanged }: { d: DemographicsReport; onChanged: () => void }) {
  const bands = d.bands.filter((b) => b.count > 0 || b.key !== "under4");
  const maxBand = Math.max(1, ...bands.map((b) => b.count));
  const g = d.gender;
  const recorded = g.male + g.female + g.other;
  const genderRows = [
    { label: "Male", n: g.male, color: "#2563eb" },
    { label: "Female", n: g.female, color: "#c96442" },
    { label: "Other", n: g.other, color: "#7c3aed" },
    { label: "Not recorded yet", n: g.unrecorded, color: "#a8a29e" },
  ];

  return (
    <>
      <StatGrid>
        <Stat label="Active students" value={d.total} />
        <Stat label="Kids (under 18)" value={d.kids} sub={d.total ? `${pct(d.kids / d.total)} of students` : undefined} />
        <Stat label="Adults (18+)" value={d.adults} sub={d.total ? `${pct(d.adults / d.total)} of students` : undefined} />
        <Stat label="Kids per adult" value={d.kidsPerAdult === null ? "—" : num1(d.kidsPerAdult)} />
      </StatGrid>

      <Card title="Age groups" hint="Tiger Cub age (4–5) is separated from the young Jr. group (6–7).">
        <div className="space-y-1">
          {bands.map((b) => (
            <BarRow
              key={b.key}
              label={b.label}
              value={b.count}
              max={maxBand}
              right={String(b.count)}
              sublabel={b.count ? `${b.male} M · ${b.female} F${b.other ? ` · ${b.other} other` : ""}${b.unrecorded ? ` · ${b.unrecorded} ?` : ""}` : undefined}
              labelWidth="w-28"
            />
          ))}
        </div>
        {d.unknownAge > 0 && <p className="mt-3 text-xs text-[var(--color-fg-muted)]">{d.unknownAge} student{d.unknownAge === 1 ? " has" : "s have"} no valid date of birth and aren't in these groups.</p>}
      </Card>

      <Card title="Gender">
        <div className="mb-3 flex h-6 overflow-hidden rounded">
          {genderRows.filter((r) => r.n > 0).map((r) => (
            <div key={r.label} title={`${r.label}: ${r.n}`} style={{ width: `${(r.n / Math.max(1, d.total)) * 100}%`, background: r.color }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {genderRows.map((r) => (
            <span key={r.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
              {r.label}: <strong>{r.n}</strong>
              {recorded > 0 && r.label !== "Not recorded yet" && <span className="text-xs text-[var(--color-fg-muted)]">({pct(r.n / recorded)})</span>}
            </span>
          ))}
        </div>

        {d.missingGender.length > 0 && (
          <details className="mt-4 rounded-md border border-[var(--color-border)]" open={recorded === 0}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              Fill in gender for {d.missingGender.length} student{d.missingGender.length === 1 ? "" : "s"}
            </summary>
            <div className="max-h-96 overflow-y-auto border-t border-[var(--color-border)]">
              {d.missingGender.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-3 py-1.5 text-sm first:border-t-0">
                  <span>{s.name}{s.age !== null && <span className="ml-2 text-xs text-[var(--color-fg-muted)]">age {s.age}</span>}</span>
                  <span className="flex gap-1">
                    {GENDERS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={async () => { await setStudentGender(s.id, opt); onChanged(); }}
                        className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-surface-2)]"
                      >
                        {opt}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </Card>

      <Card
        title="Families"
        hint="Students who share a phone number or email address are grouped as a household. This is a best guess from contact details, not something recorded directly."
      >
        {d.families.length === 0 ? (
          <EmptyNote>No shared contact details found, so no family groups to show.</EmptyNote>
        ) : (
          <>
            <StatGrid cols={4}>
              <Stat label="Family groups" value={d.familySummary.familyCount} />
              <Stat label="Students in a family" value={d.familySummary.studentsInFamilies} sub={d.total ? `${pct(d.familySummary.studentsInFamilies / d.total)} of students` : undefined} />
              <Stat label="Sibling groups" value={d.familySummary.siblingSets} sub="two or more kids" />
              <Stat label="Parent + child" value={d.familySummary.parentChildSets} sub="an adult and a kid" />
            </StatGrid>
            <Table head={["Family", "Members"]}>
              {d.families.map((f) => (
                <tr key={f.members[0].id}>
                  <Td muted className="w-40">{familyKind(f)}</Td>
                  <Td>{f.members.map((m) => `${m.name}${m.age !== null ? ` (${m.age})` : ""}`).join(", ")}</Td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Card>

      <Note>
        Ages are worked out from each student's date of birth as of today. Families are only found where contact details match, so siblings with different phone numbers on file won't show up.
      </Note>
    </>
  );
}

export { Body as DemographicsBody };
