import { PageHeader } from "@/components/PageHeader";

export function StudentsPage() {
  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Manage student profiles, belts, and contact info."
      />
      <Placeholder note="Students CRUD coming in Phase 2." />
    </>
  );
}

function Placeholder({ note }: { note: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
      {note}
    </div>
  );
}
