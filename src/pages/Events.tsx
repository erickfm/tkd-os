import { PageHeader } from "@/components/PageHeader";

export function EventsPage() {
  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Belt testings, seminars, tournaments, demos, and camps."
      />
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
        Events & rosters coming in Phase 4.
      </div>
    </>
  );
}
