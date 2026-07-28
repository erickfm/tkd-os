export const TRACKS = ["tiger", "regular"] as const;
export type Track = (typeof TRACKS)[number];

export const AGE_GROUPS = ["jr", "adult"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const CLASS_TYPES = ["tiger", "jr-wy", "jr-gbp", "jr-brb", "adult", "private"] as const;
export type ClassType = (typeof CLASS_TYPES)[number];

// Class types that may be STORED in attendance_sessions.class_type but are not
// offered in the Attendance dropdown: "legacy" holds imported historical
// attendance (see scripts/import-legacy-history.mjs). The DB CHECK allows this
// full set; it's maintained by scripts/relax-class-type-check.mjs, not a migration.
export const STORED_CLASS_TYPES = [...CLASS_TYPES, "legacy"] as const;

export const CLASS_GROUPS = ["jr-wy", "jr-gbp", "jr-brb"] as const;
export type ClassGroup = (typeof CLASS_GROUPS)[number];

export const EVENT_TYPES = [
  "Seminar",
  "Tournament",
  "Demo",
  "Camp",
  "Other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ATTENDANCE_STATUSES = ["present", "absent", "unmarked"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const BELT_SIZES = [
  "00000",
  "0000",
  "000",
  "00",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;
export type BeltSize = (typeof BELT_SIZES)[number];

export const CLASS_TYPE_LABELS: Record<ClassType, string> = {
  tiger: "Tiger Cubs",
  "jr-wy": "Jr. White & Yellow",
  "jr-gbp": "Jr. Green, Blue & Purple",
  "jr-brb": "Jr. Brown, Red & Black",
  adult: "Adult",
  private: "Private Lessons",
};

// Reason a registered student tested but didn't earn a promotion ("No Change").
export const NC_REASONS = ["F", "S", "BB", "CS", "ACT", "Other"] as const;
export type NcReason = (typeof NC_REASONS)[number];

export const NC_REASON_LABELS: Record<NcReason, string> = {
  F: "Forms",
  S: "Sparring",
  BB: "Board Breaking",
  CS: "Contact Skill",
  ACT: "ACT Technique",
  Other: "Other",
};
