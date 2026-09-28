import writeXlsxFile from "write-excel-file/browser";

import type { SpecialTestRow } from "@/db/repos";
import { saveBytesFile } from "./download";
import { ageFromDob, prettyDate, today } from "./format";

const CHECKED = "☑";
const UNCHECKED = "☐";

/** Build the early/late testers .xlsx and save it via the Save dialog. */
export async function exportSpecialTestersXlsx(rows: SpecialTestRow[]): Promise<boolean> {
  const bold = { fontWeight: "bold" as const };
  const header = ["Name", "Age", "Current Belt", "Testing For", "Date", "Timing", "Tested"].map((value) => ({
    value, type: String, ...bold,
  }));
  const data = rows.map((r) => [
    { value: `${r.firstName} ${r.lastName}`, type: String },
    { value: ageFromDob(r.dateOfBirth), type: Number },
    { value: r.rank.name, type: String },
    { value: r.testingFor ?? "(top rank)", type: String },
    // Kept as formatted text rather than a native Date cell: this codebase has
    // been bitten before by ISO date strings shifting a day under UTC parsing
    // (see prettyDate's own local-midnight handling) — not worth the risk here.
    { value: prettyDate(r.testDate), type: String },
    { value: r.timing, type: String },
    { value: r.tested ? CHECKED : UNCHECKED, type: String, align: "center" as const, fontSize: 14 },
  ]);
  const columns = [{ width: 24 }, { width: 8 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 10 }, { width: 10 }];
  // See inventoryExport.ts: the library's overloads are finicky with mixed
  // cell shapes, so call through a loose signature.
  const write = writeXlsxFile as unknown as (data: unknown, opts: unknown) => Promise<{ toBlob: () => Promise<Blob> }>;
  const result = await write([header, ...data], { columns, sheetName: "Early-Late Testers" });
  const bytes = new Uint8Array(await (await result.toBlob()).arrayBuffer());
  return saveBytesFile(`early_late_testers_${today()}.xlsx`, bytes, "Excel workbook", "xlsx");
}
