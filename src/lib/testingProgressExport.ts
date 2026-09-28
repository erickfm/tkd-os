import writeXlsxFile from "write-excel-file/browser";

import type { ProgressRow } from "@/db/repos";
import { saveBytesFile } from "./download";

const CHECKED = "☑"; // ☑
const UNCHECKED = "☐"; // ☐

// Same order + labels as the Testing Progress screen's stripe columns.
const STRIPE_COLUMNS = [
  { field: "blueStripe", label: "Blue" },
  { field: "orangeStripe", label: "Orange" },
  { field: "redStripe", label: "Red" },
  { field: "greenStripe", label: "Green" },
] as const;

/** Build the Testing Progress .xlsx: one row per student, a checkbox per stripe + Permission to Test, pre-checked to match the app. */
export async function exportTestingProgressXlsx(rows: ProgressRow[]): Promise<boolean> {
  const header = ["Name", "Belt", ...STRIPE_COLUMNS.map((s) => s.label), "Permission to Test"].map((value) => ({
    value,
    type: String,
    fontWeight: "bold" as const,
    align: "center" as const,
  }));
  const data = rows.map((r) => [
    { value: `${r.firstName} ${r.lastName}`, type: String },
    { value: r.rank.name, type: String },
    ...STRIPE_COLUMNS.map((s) => ({
      value: r.track === "tiger" ? "—" : r[s.field] ? CHECKED : UNCHECKED,
      type: String,
      align: "center" as const,
      fontSize: 14,
    })),
    { value: r.permissionToTest ? CHECKED : UNCHECKED, type: String, align: "center" as const, fontSize: 14 },
  ]);
  const columns = [{ width: 24 }, { width: 20 }, ...STRIPE_COLUMNS.map(() => ({ width: 10 })), { width: 16 }];
  // See inventoryExport.ts: the library's overloads are finicky with mixed cell
  // shapes, so call through a loose signature.
  const write = writeXlsxFile as unknown as (data: unknown, opts: unknown) => Promise<{ toBlob: () => Promise<Blob> }>;
  const result = await write([header, ...data], { columns, sheetName: "Testing Progress" });
  const bytes = new Uint8Array(await (await result.toBlob()).arrayBuffer());
  return saveBytesFile(`testing_progress.xlsx`, bytes, "Excel workbook", "xlsx");
}
