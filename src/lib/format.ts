// Small display + date helpers shared across pages.

export function fullName(s: { firstName: string; lastName: string }): string {
  return `${s.firstName} ${s.lastName}`;
}

/** Local calendar date as ISO YYYY-MM-DD (not UTC — toISOString would roll to tomorrow in the evening Pacific time). */
export const today = (): string => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

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
  // Parse a date-only string (YYYY-MM-DD) as LOCAL midnight; otherwise `new Date`
  // treats it as UTC and renders the prior day in western time zones.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T00:00:00") : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Global belt ordering: Tiger Cubs rank before all regular-track belts (White up). */
export function beltRankOrder(rank: { track: string; sortOrder: number }): number {
  return (rank.track === "tiger" ? 0 : 1) * 1000 + rank.sortOrder;
}

export const TRACK_LABEL: Record<string, string> = {
  tiger: "Tiger Cubs",
  regular: "Jr./Adult",
};

export const AGE_GROUP_LABEL: Record<string, string> = {
  jr: "Jr.",
  adult: "Adult",
};
