// Pure logic behind the printed testing-day sheet (see testingSheetExport.ts for
// the .xlsx writer). Split out so the grouping/ordering/pagination — the part that
// used to be done by hand, inconsistently, each cycle — is unit-testable on its own.
import type { BeltRank } from "@/db/schema";
import { ageFromDob, beltRankOrder } from "./format";

export interface TestingSheetStudent {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  ageGroup: string;
  rank: BeltRank;
}

// The testing groups the school runs together, in testing-day order. Adult-class
// testers (whatever their belt) test as their own last group.
export const TESTING_SHEET_GROUPS = [
  "Tiger Cubs", "White & Yellow", "Green / Blue / Purple", "Brown / Red / Black", "Adults",
] as const;
export type TestingSheetGroup = (typeof TESTING_SHEET_GROUPS)[number];

type Color = "Cubs" | "White" | "Yellow" | "Green" | "Blue" | "Purple" | "Brown" | "Red" | "Black";

function colorOf(rank: BeltRank): Color {
  if (rank.track === "tiger") return "Cubs";
  if (rank.degree) return "Black"; // 1st–9th Degree, any level
  if (rank.name.startsWith("Brown")) return "Brown";
  if (rank.name.startsWith("Red")) return "Red";
  if (rank.name.includes("Purple")) return "Purple";
  if (rank.name.includes("Blue")) return "Blue";
  if (rank.name.includes("Green")) return "Green";
  if (rank.name.startsWith("Yellow")) return "Yellow";
  return "White";
}

const GROUP_OF_COLOR: Record<Color, Exclude<TestingSheetGroup, "Adults">> = {
  Cubs: "Tiger Cubs",
  White: "White & Yellow", Yellow: "White & Yellow",
  Green: "Green / Blue / Purple", Blue: "Green / Blue / Purple", Purple: "Green / Blue / Purple",
  Brown: "Brown / Red / Black", Red: "Brown / Red / Black", Black: "Brown / Red / Black",
};

/** Which testing group a student belongs to. */
export function groupFor(s: TestingSheetStudent): TestingSheetGroup {
  return s.ageGroup === "adult" ? "Adults" : GROUP_OF_COLOR[colorOf(s.rank)];
}

/** Ascending rank; within the same rank, oldest first. */
export function compareForTesting<T extends TestingSheetStudent>(a: T, b: T): number {
  const rank = beltRankOrder(a.rank) - beltRankOrder(b.rank);
  if (rank !== 0) return rank;
  const age = (ageFromDob(b.dateOfBirth) ?? -1) - (ageFromDob(a.dateOfBirth) ?? -1);
  if (age !== 0) return age;
  return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
}

/** Label for the trailing group of early/late testers (students testing outside the main day). */
export const EARLY_LATE_LABEL = "Early / Late Testers";

// Layout, matched to the school's paper sheets: a page holds this many lines under
// its column header (group labels + numbered lines), a couple of blank lines
// separate groups sharing a page, one blank line separates belt colors within a
// group, and every page is filled out with blank lines for write-ins.
export const LINES_PER_PAGE = 24;
const GROUP_GAP = 2;

/** Rank as printed on the sheet: the words "Belt" and "Stripe" dropped ("Sr. Green Belt" -> "Sr. Green", "Tiger Cub Green Stripe" -> "Tiger Cub Green"). */
export function shortRankName(name: string): string {
  return name.replace(/\s*\b(Belt|Stripe)\b/, "");
}

/** "2026-09-19" -> "9/19", for the Form box of an early/late tester. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

export type SheetLine =
  | { kind: "label"; label: string }
  | { kind: "member"; student: TestingSheetStudent; tag: string | null }
  | { kind: "blank" };

export interface TestingSheetPage {
  lines: SheetLine[];
}

type Member = { student: TestingSheetStudent; tag: string | null };

interface Section {
  label: string;
  /** Members in order; null is a blank line between belt colors. */
  members: (Member | null)[];
  /** Must start at the top of a page (a group too long for one page is split across several). */
  freshPage: boolean;
}

/** Runs of members sharing a belt color (Tiger Cubs count as one color). */
function colorBlocks(members: Member[]): Member[][] {
  const blocks: Member[][] = [];
  for (const m of members) {
    const last = blocks[blocks.length - 1];
    if (last && colorOf(last[0].student.rank) === colorOf(m.student.rank)) last.push(m);
    else blocks.push([m]);
  }
  return blocks;
}

/**
 * Split a group too long for one page into page-sized pieces, breaking only
 * between belt colors (a color is never split unless it alone overflows a page).
 */
function splitAcrossPages(label: string, blocks: Member[][]): Section[] {
  const room = LINES_PER_PAGE - 1; // one line goes to the label
  const pieces: (Member | null)[][] = [];
  let cur: (Member | null)[] = [];
  for (let rest of blocks) {
    while (rest.length > 0) {
      const gap = cur.length > 0 ? 1 : 0;
      const free = room - cur.length - gap;
      if (free <= 0 || (cur.length > 0 && rest.length > free && rest.length <= room)) { pieces.push(cur); cur = []; continue; }
      const take = Math.min(free, rest.length);
      if (gap) cur.push(null);
      cur = cur.concat(rest.slice(0, take));
      rest = rest.slice(take);
      if (rest.length > 0) { pieces.push(cur); cur = []; }
    }
  }
  if (cur.length > 0) pieces.push(cur);
  return pieces.map((p, i) => ({ label: i === 0 ? label : `${label} (cont.)`, members: p, freshPage: true }));
}

function sectionsFor(label: string, members: Member[], colorGaps = true): Section[] {
  if (members.length === 0) return [];
  const blocks = colorGaps ? colorBlocks(members) : [members];
  const flat = blocks.flatMap((b, i) => (i === 0 ? b : [null, ...b]));
  if (1 + flat.length <= LINES_PER_PAGE) return [{ label, members: flat, freshPage: false }];
  return splitAcrossPages(label, blocks);
}

/**
 * Lay out the printed sheet. Students are grouped into the school's testing groups
 * (empty groups skipped), each sorted ascending rank / oldest first; early/late
 * testers are taken off their regular group and listed together in a final group
 * (no color gaps) with their own test date in the Form box. Groups are packed onto as few pages
 * as possible with only a couple of blank lines between them (one between belt
 * colors within a group), but a group is never left dangling at the bottom of a
 * page: if it doesn't fit whole it starts at the top of the next page, and a group
 * longer than a page is split only between belt colors. Every page is padded to
 * full length with blank write-in lines.
 */
export function buildTestingSheetPages(
  students: TestingSheetStudent[],
  earlyLate: (TestingSheetStudent & { testDate: string })[] = [],
): TestingSheetPage[] {
  const sections: Section[] = [];
  const earlyLateIds = new Set(earlyLate.map((s) => s.id));
  for (const group of TESTING_SHEET_GROUPS) {
    const members = students
      .filter((s) => !earlyLateIds.has(s.id) && groupFor(s) === group)
      .sort(compareForTesting)
      .map((student): Member => ({ student, tag: null }));
    sections.push(...sectionsFor(group, members));
  }
  const specials = earlyLate.slice().sort(compareForTesting).map((student): Member => ({ student, tag: shortDate(student.testDate) }));
  sections.push(...sectionsFor(EARLY_LATE_LABEL, specials, false));

  const pages: TestingSheetPage[] = [];
  let cur: SheetLine[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    while (cur.length < LINES_PER_PAGE) cur.push({ kind: "blank" });
    pages.push({ lines: cur });
    cur = [];
  };
  for (const sec of sections) {
    const need = 1 + sec.members.length;
    if (cur.length > 0 && (sec.freshPage || cur.length + GROUP_GAP + need > LINES_PER_PAGE)) flush();
    if (cur.length > 0) for (let i = 0; i < GROUP_GAP; i++) cur.push({ kind: "blank" });
    cur.push({ kind: "label", label: sec.label });
    for (const m of sec.members) cur.push(m ? { kind: "member", student: m.student, tag: m.tag } : { kind: "blank" });
  }
  flush();
  return pages;
}
