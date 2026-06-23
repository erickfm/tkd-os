export const TRACKS = ["tiger", "regular"] as const;
export type Track = (typeof TRACKS)[number];

export const AGE_GROUPS = ["jr", "adult"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const CLASS_TYPES = ["tiger", "jr-wy", "jr-gbp", "jr-brb", "adult"] as const;
export type ClassType = (typeof CLASS_TYPES)[number];

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
};
