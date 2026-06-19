import { PageHeader } from "@/components/PageHeader";

export function AttendancePage() {
  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Record who showed up to which class."
      />
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
        Attendance sessions & records coming in Phase 3.
      </div>
    </>
  );
}
