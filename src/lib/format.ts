// Small display + date helpers shared across pages.

export function fullName(s: { firstName: string; lastName: string }): string {
  return `${s.firstName} ${s.lastName}`;
}

export const today = (): string => new Date().toISOString().slice(0, 10);

/** Age in whole years from an ISO date string, or null. */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** "Jan 6, 2023" from an ISO date string. */
export function prettyDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const TRACK_LABEL: Record<string, string> = {
  tiger: "Tiger Cubs",
  regular: "Jr./Adult",
};

export const AGE_GROUP_LABEL: Record<string, string> = {
  jr: "Jr.",
  adult: "Adult",
};
