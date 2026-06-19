import { useEffect, useState } from "react";
import { asc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/PageHeader";
import { BeltBadge } from "@/components/BeltBadge";
import { getDb } from "@/db/client";
import { beltRanks, type BeltRank } from "@/db/schema";

export function SettingsPage() {
  const [tiger, setTiger] = useState<BeltRank[]>([]);
  const [regular, setRegular] = useState<BeltRank[]>([]);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const tigerRanks = await db
        .select()
        .from(beltRanks)
        .where(eq(beltRanks.track, "tiger"))
        .orderBy(asc(beltRanks.sortOrder));
      const regularRanks = await db
        .select()
        .from(beltRanks)
        .where(eq(beltRanks.track, "regular"))
        .orderBy(asc(beltRanks.sortOrder));
      setTiger(tigerRanks);
      setRegular(regularRanks);
    })();
  }, []);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Seeded belt ranks. Color tweaks come later."
      />
      <section className="space-y-8">
        <RankList title="Tiger Cubs Track" ranks={tiger} />
        <RankList title="Jr. & Adult Track" ranks={regular} />
      </section>
    </>
  );
}

function RankList({ title, ranks }: { title: string; ranks: BeltRank[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
        {title}
      </h2>
      <div className="flex flex-wrap gap-2">
        {ranks.map((rank) => (
          <BeltBadge key={rank.id} rank={rank} />
        ))}
      </div>
    </div>
  );
}
