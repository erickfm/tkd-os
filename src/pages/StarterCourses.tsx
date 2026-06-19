import { PageHeader } from "@/components/PageHeader";

export function StarterCoursesPage() {
  return (
    <>
      <PageHeader
        title="Starter Courses"
        subtitle="Short-term introductory courses for new students."
      />
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
        Starter courses coming in Phase 5.
      </div>
    </>
  );
}
