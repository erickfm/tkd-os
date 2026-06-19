import { useEffect, useState } from "react";
import { sql } from "drizzle-orm";

import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/db/client";
import { beltRanks, students } from "@/db/schema";

interface Counts {
  students: number;
  beltRanks: number;
}

export function DashboardPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const [studentRow] = await db
          .select({ n: sql<number>`count(*)` })
          .from(students);
        const [beltRow] = await db
          .select({ n: sql<number>`count(*)` })
          .from(beltRanks);
        setCounts({
          students: Number(studentRow?.n ?? 0),
          beltRanks: Number(beltRow?.n ?? 0),
        });
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Quick view of your dojang at a glance."
      />
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">
          Failed to load database: {error}
        </div>
      )}
      {!error && (
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Active Students" value={counts?.students ?? "—"} />
          <StatCard label="Belt Ranks Seeded" value={counts?.beltRanks ?? "—"} />
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5">
      <div className="text-sm text-[var(--color-fg-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
