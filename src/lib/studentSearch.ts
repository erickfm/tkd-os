export interface Searchable {
  firstName: string;
  lastName: string;
  guardian1Name: string | null;
  guardian2Name: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Does a student match a search-box query? Matches the student's own name or either
 * guardian's name. `viaGuardian` is the matching guardian's name when (and only when)
 * the student's own name did not match, so the UI can show why the row appeared.
 */
export function searchStudent(
  s: Searchable,
  query: string,
): { matches: boolean; viaGuardian: string | null } {
  const q = norm(query);
  if (q === "") return { matches: true, viaGuardian: null };
  if (norm(`${s.firstName} ${s.lastName}`).includes(q)) return { matches: true, viaGuardian: null };
  for (const g of [s.guardian1Name, s.guardian2Name]) {
    if (g && norm(g).includes(q)) return { matches: true, viaGuardian: g.trim().replace(/\s+/g, " ") };
  }
  return { matches: false, viaGuardian: null };
}
