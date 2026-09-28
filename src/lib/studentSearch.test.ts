import { describe, expect, it } from "vitest";

import { searchStudent, type Searchable } from "./studentSearch";

const kid: Searchable = {
  firstName: "Maddy",
  lastName: "Ames",
  guardian1Name: "Jane Smith-Ames",
  guardian2Name: "  Robert   Ames ",
};

describe("searchStudent", () => {
  it("matches everyone on an empty query", () => {
    expect(searchStudent(kid, "  ")).toEqual({ matches: true, viaGuardian: null });
  });

  it("matches the student's own name without flagging a guardian", () => {
    expect(searchStudent(kid, "maddy a")).toEqual({ matches: true, viaGuardian: null });
    // "ames" is also in a guardian's name, but the student's own name wins.
    expect(searchStudent(kid, "AMES")).toEqual({ matches: true, viaGuardian: null });
  });

  it("finds a student by either guardian's name", () => {
    expect(searchStudent(kid, "jane smith")).toEqual({ matches: true, viaGuardian: "Jane Smith-Ames" });
    expect(searchStudent(kid, "robert ames")).toEqual({ matches: true, viaGuardian: "Robert Ames" });
    expect(searchStudent(kid, "rob")).toEqual({ matches: true, viaGuardian: "Robert Ames" });
  });

  it("ignores blank guardian fields and rejects non-matches", () => {
    const noParents = { ...kid, guardian1Name: null, guardian2Name: "" };
    expect(searchStudent(noParents, "jane").matches).toBe(false);
    expect(searchStudent(kid, "zzz").matches).toBe(false);
  });
});
