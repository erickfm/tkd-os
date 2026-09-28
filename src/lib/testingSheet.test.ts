import { describe, expect, it } from "vitest";

import type { BeltRank } from "@/db/schema";
import { buildTestingSheetPages, compareForTesting, EARLY_LATE_LABEL, groupFor, LINES_PER_PAGE, shortDate, shortRankName, type SheetLine, type TestingSheetStudent } from "./testingSheet";

let nextRankId = 1;
function rank(over: Partial<BeltRank> & { track: string; sortOrder: number; name: string }): BeltRank {
  return {
    id: nextRankId++,
    classGroup: null,
    degree: null,
    level: null,
    colorHex: "#ffffff",
    textHex: "#000000",
    borderHex: "#000000",
    isGraduationRank: false,
    nextRankId: null,
    ...over,
  };
}

const TIGER_YELLOW = rank({ track: "tiger", sortOrder: 1, name: "Tiger Cub Yellow Stripe" });
const WHITE = rank({ track: "regular", sortOrder: 0, name: "White Belt" });
const YELLOW = rank({ track: "regular", sortOrder: 1, name: "Yellow Belt" });
const GREEN = rank({ track: "regular", sortOrder: 2, name: "Green Belt" });
const SR_GREEN = rank({ track: "regular", sortOrder: 3, name: "Sr. Green Belt" });
const BLUE = rank({ track: "regular", sortOrder: 4, name: "Blue Belt" });
const PURPLE = rank({ track: "regular", sortOrder: 6, name: "Purple Belt" });
const BROWN_L1 = rank({ track: "regular", sortOrder: 8, name: "Brown Belt L1", level: "L1" });
const BROWN_L3 = rank({ track: "regular", sortOrder: 10, name: "Brown Belt L3", level: "L3" });
const RED_L1 = rank({ track: "regular", sortOrder: 11, name: "Red Belt L1", level: "L1" });
const BLACK_1ST = rank({ track: "regular", sortOrder: 14, name: "1st Degree Black L1", degree: "1st Degree", level: "L1" });
const BLACK_3RD = rank({ track: "regular", sortOrder: 22, name: "3rd Degree Black L1", degree: "3rd Degree", level: "L1" });

let nextId = 1;
function student(over: Partial<TestingSheetStudent> & { rank: BeltRank }): TestingSheetStudent & { id: number } {
  return {
    id: nextId++,
    firstName: `S${nextId}`,
    lastName: `L${nextId}`,
    dateOfBirth: null,
    ageGroup: "jr",
    ...over,
  };
}

describe("groupFor", () => {
  it("maps colors into the school's five testing groups", () => {
    expect(groupFor(student({ rank: TIGER_YELLOW }))).toBe("Tiger Cubs");
    expect(groupFor(student({ rank: WHITE }))).toBe("White & Yellow");
    expect(groupFor(student({ rank: YELLOW }))).toBe("White & Yellow");
    for (const r of [GREEN, SR_GREEN, BLUE, PURPLE]) expect(groupFor(student({ rank: r }))).toBe("Green / Blue / Purple");
    for (const r of [BROWN_L1, BROWN_L3, RED_L1, BLACK_1ST, BLACK_3RD]) expect(groupFor(student({ rank: r }))).toBe("Brown / Red / Black");
  });

  it("pulls adult-class testers into their own group regardless of belt", () => {
    expect(groupFor(student({ rank: BROWN_L1, ageGroup: "adult" }))).toBe("Adults");
    expect(groupFor(student({ rank: TIGER_YELLOW, ageGroup: "adult" }))).toBe("Adults");
  });
});

describe("compareForTesting", () => {
  it("sorts ascending rank first", () => {
    const a = student({ rank: WHITE, dateOfBirth: "2015-01-01" });
    const b = student({ rank: GREEN, dateOfBirth: "2020-01-01" });
    expect(compareForTesting(a, b)).toBeLessThan(0);
  });

  it("within the same rank, sorts oldest (age descending) first", () => {
    const older = student({ rank: GREEN, dateOfBirth: "2010-01-01" });
    const younger = student({ rank: GREEN, dateOfBirth: "2018-01-01" });
    expect(compareForTesting(older, younger)).toBeLessThan(0);
    expect(compareForTesting(younger, older)).toBeGreaterThan(0);
  });

  it("falls back to last/first name when rank and age tie", () => {
    const a = student({ rank: GREEN, firstName: "Amy", lastName: "Adams", dateOfBirth: "2015-01-01" });
    const b = student({ rank: GREEN, firstName: "Zoe", lastName: "Zephyr", dateOfBirth: "2015-01-01" });
    expect(compareForTesting(a, b)).toBeLessThan(0);
  });
});

const labels = (lines: SheetLine[]) => lines.filter((l) => l.kind === "label").map((l) => (l as { label: string }).label);
const many = (n: number, rank: BeltRank) => Array.from({ length: n }, () => student({ rank }));

describe("buildTestingSheetPages", () => {
  it("packs small groups onto one page with a two-line gap and write-in lines at the end", () => {
    const pages = buildTestingSheetPages([...many(2, TIGER_YELLOW), ...many(1, WHITE), ...many(3, GREEN)]);
    expect(pages).toHaveLength(1);
    expect(labels(pages[0].lines)).toEqual(["Tiger Cubs", "White & Yellow", "Green / Blue / Purple"]);
    const kinds = pages[0].lines.map((l) => l.kind);
    // label, 2 members, 2 gap, label, 1 member, 2 gap, label, 3 members, then write-ins
    expect(kinds.slice(0, 5)).toEqual(["label", "member", "member", "blank", "blank"]);
    // ...and the page is filled out with blank write-in lines to full length.
    expect(pages[0].lines).toHaveLength(LINES_PER_PAGE);
    expect(kinds.slice(-3)).toEqual(["blank", "blank", "blank"]);
  });

  it("leaves one blank line between belt colors, but none between a belt and its senior belt", () => {
    const pages = buildTestingSheetPages([student({ rank: GREEN }), student({ rank: SR_GREEN }), student({ rank: BLUE }), student({ rank: PURPLE })]);
    const kinds = pages[0].lines.slice(0, 6).map((l) => l.kind);
    // label, Green, Sr. Green (same color, no gap), gap, Blue, gap, Purple
    expect(pages[0].lines.slice(0, 7).map((l) => l.kind)).toEqual(["label", "member", "member", "blank", "member", "blank", "member"]);
    expect(kinds).toHaveLength(6);
  });

  it("sorts within a group by ascending rank then oldest first, and skips empty groups", () => {
    const roster = [
      student({ rank: SR_GREEN, dateOfBirth: "2010-01-01", firstName: "Sr" }),
      student({ rank: GREEN, dateOfBirth: "2016-01-01", firstName: "Young" }),
      student({ rank: GREEN, dateOfBirth: "2012-01-01", firstName: "Old" }),
    ];
    const pages = buildTestingSheetPages(roster);
    expect(labels(pages[0].lines)).toEqual(["Green / Blue / Purple"]);
    const names = pages[0].lines.flatMap((l) => (l.kind === "member" ? [l.student.firstName] : []));
    expect(names).toEqual(["Old", "Young", "Sr"]);
  });

  it("starts a group at the top of the next page rather than leaving it dangling at the bottom", () => {
    // 15 cubs (16 lines) + 10 white/yellow (11 lines) can't share a 24-line page.
    const pages = buildTestingSheetPages([...many(15, TIGER_YELLOW), ...many(10, WHITE)]);
    expect(pages).toHaveLength(2);
    expect(labels(pages[0].lines)).toEqual(["Tiger Cubs"]);
    expect(pages[1].lines[0]).toEqual({ kind: "label", label: "White & Yellow" });
  });

  it("splits a group longer than a page only between belt colors, repeating the label", () => {
    // 15 green + 12 blue = 29 lines > a page: green fills page 1, blue starts page 2.
    const pages = buildTestingSheetPages([...many(15, GREEN), ...many(12, BLUE)]);
    expect(pages).toHaveLength(2);
    expect(labels(pages[0].lines)).toEqual(["Green / Blue / Purple"]);
    expect(labels(pages[1].lines)).toEqual(["Green / Blue / Purple (cont.)"]);
    const members = (i: number) => pages[i].lines.filter((l) => l.kind === "member").length;
    expect(members(0)).toBe(15);
    expect(members(1)).toBe(12);
  });

  it("never exceeds LINES_PER_PAGE on any page", () => {
    const pages = buildTestingSheetPages([
      ...many(40, TIGER_YELLOW), ...many(12, WHITE), ...many(9, YELLOW), ...many(30, BLACK_1ST),
    ]);
    for (const p of pages) expect(p.lines.length).toBeLessThanOrEqual(LINES_PER_PAGE);
  });

  describe("early/late testers", () => {
    it("come off their regular group into one final group, tagged with their own test date", () => {
      const green = student({ rank: GREEN });
      const black = student({ rank: BLACK_1ST });
      const stay = student({ rank: TIGER_YELLOW });
      const pages = buildTestingSheetPages(
        [stay, green, black],
        [{ ...black, testDate: "2026-09-19" }, { ...green, testDate: "2026-10-03" }],
      );
      // Green / Brown-Red-Black no longer have anyone on the regular sheet.
      expect(labels(pages[0].lines)).toEqual(["Tiger Cubs", EARLY_LATE_LABEL]);
      const members = pages[0].lines.filter((l) => l.kind === "member") as { student: { id: number }; tag: string | null }[];
      expect(members.map((m) => m.student.id)).toEqual([stay.id, green.id, black.id]);
      // ascending rank (green before black), each carrying their own date
      expect(members.slice(1).map((m) => m.tag)).toEqual(["10/3", "9/19"]);
      expect(members[0].tag).toBeNull();
    });

    it("are listed in a lump with no gaps between belt colors", () => {
      const testers = [student({ rank: GREEN }), student({ rank: BLUE }), student({ rank: BLACK_1ST })].map((s) => ({ ...s, testDate: "2026-09-19" }));
      const pages = buildTestingSheetPages([], testers);
      expect(pages[0].lines.slice(0, 4).map((l) => l.kind)).toEqual(["label", "member", "member", "member"]);
    });
  });

  it("returns nothing for an empty roster", () => {
    expect(buildTestingSheetPages([])).toEqual([]);
  });
});

describe("shortRankName", () => {
  it("drops the words Belt and Stripe but leaves other rank names alone", () => {
    expect(shortRankName("Green Belt")).toBe("Green");
    expect(shortRankName("Sr. Green Belt")).toBe("Sr. Green");
    expect(shortRankName("Brown Belt L1")).toBe("Brown L1");
    expect(shortRankName("Tiger Cub White Belt")).toBe("Tiger Cub White");
    expect(shortRankName("Tiger Cub Yellow Stripe")).toBe("Tiger Cub Yellow");
    expect(shortRankName("Tiger Cub Black Stripe")).toBe("Tiger Cub Black");
    expect(shortRankName("1st Degree Black L1")).toBe("1st Degree Black L1");
  });
});

describe("shortDate", () => {
  it("formats an ISO date as month/day", () => {
    expect(shortDate("2026-09-19")).toBe("9/19");
    expect(shortDate("2026-12-03")).toBe("12/3");
  });
});
