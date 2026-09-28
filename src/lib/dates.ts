// Timezone-proof ISO (YYYY-MM-DD) date math. Everything is done in UTC so DST
// and the machine's timezone can never shift a date by a day.

const MS_PER_DAY = 86_400_000;

function toMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d); // setUTCFullYear so years < 100 aren't mapped to 19xx
  dt.setUTCHours(0, 0, 0, 0);
  return dt.getTime();
}

function fromMs(ms: number): string {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function addDaysIso(iso: string, days: number): string {
  return fromMs(toMs(iso) + days * MS_PER_DAY);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetweenIso(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / MS_PER_DAY);
}

/** Add calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/** The Monday on or before `iso`. */
export function mondayOfIso(iso: string): string {
  const dow = new Date(toMs(iso)).getUTCDay(); // 0 = Sunday
  return addDaysIso(iso, dow === 0 ? -6 : 1 - dow);
}

/** "YYYY-MM" */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Every "YYYY-MM" from `from`'s month through `to`'s month, inclusive. */
export function monthKeysBetweenIso(from: string, to: string): string[] {
  const keys: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    keys.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys;
}

/** Last calendar day of a "YYYY-MM" month key. */
export function endOfMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return fromMs(Date.UTC(y, m, 0));
}

/** Whole years of age on `asOf`, or null if the DOB is missing/implausible. */
export function ageOn(dob: string | null | undefined, asOf: string): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [dy, dm, dd] = dob.split("-").map(Number);
  const [ay, am, ad] = asOf.split("-").map(Number);
  let age = ay - dy;
  if (am < dm || (am === dm && ad < dd)) age -= 1;
  return age >= 0 && age <= 100 ? age : null;
}
