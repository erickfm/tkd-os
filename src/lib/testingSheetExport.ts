import writeXlsxFile from "write-excel-file/browser";

import type { SpecialTestRow, TestingRow } from "@/db/repos";
import type { TestingCycle } from "@/db/schema";
import { saveBytesFile } from "./download";
import { ageFromDob, prettyDate } from "./format";
import { buildTestingSheetPages, shortRankName, type SheetLine, type TestingSheetPage } from "./testingSheet";

// Matches the school's own paper testing sheets (see Primary Testing Sheet
// Sept26.xls): a title line (name line / school name / testing date), a
// column-header row, then group labels and numbered lines — Arial, boxed with
// thin borders, no fill color.
const SCHOOL_NAME = "Ojai TaeKwonDo Academy";
const COLUMN_HEADERS = ["", "Name", "Age", "Rank", "Form", "Skill", "Spar", "Break", "Pass"];
const COLUMNS = [
  { width: 5.22 }, { width: 30 }, { width: 8.11 }, { width: 22 },
  { width: 10 }, { width: 9 }, { width: 8 }, { width: 8.5 }, { width: 7 },
];
// Title and column-header rows stay compact; the group labels and numbered lines
// are as tall as fits: 24 lines + the two header rows must stay under the ~758pt a
// Letter page holds at 95% between 0.5" margins (2 x 26.5 + 24 x 29 = 749pt).
const HEADER_HEIGHT = 26.5;
const LINE_HEIGHT = 29;
const BORDER = { borderColor: "#000000", borderStyle: "thin" as const };
const BOX = { ...BORDER, height: LINE_HEIGHT };
const HEADER_BOX = { ...BORDER, height: HEADER_HEIGHT };

// The library has no print-setup options, so it's injected into the sheet XML:
// portrait Letter at 95% (the table is ~590pt wide, so it fits the 576pt between
// the school's usual 0.25" side margins and prints one page wide) with a manual
// page break before each page's title row.
const PRINT_SCALE = 95;

function printSetupXml(pages: TestingSheetPage[]): string {
  const breaks: number[] = [];
  let rows = 0;
  for (const page of pages.slice(0, -1)) {
    rows += 2 + page.lines.length; // title + column header + lines
    breaks.push(rows);
  }
  const rowBreaks = breaks.length
    ? `<rowBreaks count="${breaks.length}" manualBreakCount="${breaks.length}">${breaks
        .map((id) => `<brk id="${id}" max="16383" man="1"/>`)
        .join("")}</rowBreaks>`
    : "";
  return (
    `<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="1" scale="${PRINT_SCALE}" orientation="portrait"/>` +
    rowBreaks
  );
}

function titleRow(dateLabel: string) {
  // Matches the source template's print header (size 12, not bold): a blank
  // name line at left, the school name centered, the testing date at right.
  const zone = (value: string, extra: Record<string, unknown> = {}) => ({
    value, type: String, columnSpan: 3, height: HEADER_HEIGHT, fontSize: 12, ...extra,
  });
  return [
    zone("Name: _____________________"),
    null, null,
    zone(SCHOOL_NAME, { align: "center" as const }),
    null, null,
    zone(dateLabel, { align: "right" as const }),
    null, null,
  ];
}

function columnHeaderRow() {
  return COLUMN_HEADERS.map((value, i) =>
    i === 0
      ? { type: String, ...HEADER_BOX }
      : { value, type: String, fontWeight: "bold" as const, fontSize: i <= 3 ? 12 : 10, align: "center" as const, ...HEADER_BOX },
  );
}

function blank() {
  return { type: String, ...BOX };
}

function lineRow(lineNum: number, line: SheetLine) {
  if (line.kind === "label") {
    return [
      blank(), // unnumbered, matching the paper template
      { value: line.label, type: String, fontWeight: "bold" as const, fontSize: 12, align: "center" as const, ...BOX },
      blank(), blank(), blank(), blank(), blank(), blank(), blank(),
    ];
  }
  const num = { value: lineNum, type: Number, ...BOX };
  if (line.kind === "blank") return [num, blank(), blank(), blank(), blank(), blank(), blank(), blank(), blank()];
  const s = line.student;
  const age = ageFromDob(s.dateOfBirth);
  return [
    num,
    { value: `${s.firstName} ${s.lastName}`, type: String, fontSize: 12, align: "left" as const, ...BOX },
    age == null ? { type: Number, ...BOX } : { value: age, type: Number, fontSize: 12, align: "right" as const, ...BOX },
    { value: shortRankName(s.rank.name), type: String, fontSize: 12, align: "center" as const, ...BOX },
    // Early/late testers carry their own test date in the Form column; everyone
    // else's stays blank for grading.
    line.tag ? { value: line.tag, type: String, ...BOX } : blank(),
    blank(), blank(), blank(), blank(),
  ];
}

function pageRows(page: TestingSheetPage, dateLabel: string) {
  let n = 0;
  return [
    titleRow(dateLabel),
    columnHeaderRow(),
    ...page.lines.map((line) => lineRow(line.kind === "label" ? 0 : ++n, line)),
  ];
}

/**
 * Build the printable testing-day sheet — the paper form judges grade from —
 * grouped the way the school runs testing (Tiger Cubs, White & Yellow,
 * Green/Blue/Purple, Brown/Red/Black, Adults, then the early/late testers, who are
 * taken off their regular group and listed together with their test date), ascending
 * rank and oldest-first within a rank, packed onto as few pages as possible, and
 * saves it via the Save dialog.
 */
export async function buildTestingSheetXlsxBytes(
  roster: TestingRow[],
  earlyLateTesters: SpecialTestRow[],
  cycle: TestingCycle,
): Promise<Uint8Array> {
  const pages = buildTestingSheetPages(roster, earlyLateTesters);
  const dateLabel = prettyDate(cycle.testingDate ?? cycle.endDate);
  const data = pages.flatMap((page) => pageRows(page, dateLabel));
  // See beltOrderExport.ts: the library's overloads are finicky with mixed cell
  // shapes, so call through a loose signature. fontFamily/fontSize/features are a
  // *third* argument (document-wide), not part of sheetOptions — passing them
  // alongside columns/sheetName is silently ignored.
  const write = writeXlsxFile as unknown as (
    data: unknown,
    sheetOpts: unknown,
    docOpts: unknown,
  ) => Promise<{ toBlob: () => Promise<Blob> }>;
  const printSetup = {
    files: { transform: { "xl/worksheets/sheet{id}.xml": { insert: () => printSetupXml(pages) } } },
  };
  const result = await write(
    data,
    { columns: COLUMNS, sheetName: "Testing Sheets" },
    { fontFamily: "Arial", fontSize: 10, features: [printSetup] },
  );
  return new Uint8Array(await (await result.toBlob()).arrayBuffer());
}

export async function exportTestingSheetXlsx(
  roster: TestingRow[],
  earlyLateTesters: SpecialTestRow[],
  cycle: TestingCycle,
): Promise<boolean> {
  const bytes = await buildTestingSheetXlsxBytes(roster, earlyLateTesters, cycle);
  return saveBytesFile(`testing_sheets_${cycle.testingDate ?? cycle.startDate}.xlsx`, bytes, "Excel workbook", "xlsx");
}
