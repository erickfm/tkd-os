import writeXlsxFile from "write-excel-file/browser";

import type { BeltOrderNeed, BeltOrderRow } from "@/db/repos";
import { saveBytesFile } from "./download";

/** Build the belt-order .xlsx (roster + purchase-breakdown sheets) and save it via the Save dialog. */
export async function exportBeltOrderXlsx(
  roster: BeltOrderRow[],
  breakdown: BeltOrderNeed[],
  label: string,
): Promise<boolean> {
  const bold = { fontWeight: "bold" as const };

  const rosterData = [
    ["Name", "Age", "Current Belt", "Testing For", "Belt Size"].map((value) => ({ value, type: String, ...bold })),
    ...roster.map((r) => [
      { value: r.name, type: String },
      { value: r.age, type: Number },
      { value: r.currentBelt, type: String },
      { value: r.testingFor ?? "(top rank)", type: String },
      // Belt size stays text on purpose: sizes like "000"/"00"/"0" would all
      // collapse to the number 0, losing the distinction between them.
      { value: r.beltSize ?? "", type: String },
    ]),
  ];

  const breakdownData = [
    ["Belt", "Size", "Needed", "In Stock", "To Purchase"].map((value) => ({ value, type: String, ...bold })),
    ...breakdown.map((r) => [
      { value: r.belt, type: String },
      { value: r.size, type: String },
      { value: r.needed, type: Number },
      { value: r.inStock, type: Number },
      { value: r.toPurchase, type: Number },
    ]),
  ];

  // See inventoryExport.ts: the library's overloads are finicky with mixed
  // cell shapes, so call through a loose signature.
  const write = writeXlsxFile as unknown as (
    sheets: { data: unknown; sheet: string; columns: unknown }[],
  ) => Promise<{ toBlob: () => Promise<Blob> }>;
  const result = await write([
    { data: rosterData, sheet: "Roster", columns: [{ width: 24 }, { width: 8 }, { width: 18 }, { width: 18 }, { width: 12 }] },
    { data: breakdownData, sheet: "Order Breakdown", columns: [{ width: 20 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 12 }] },
  ]);
  const bytes = new Uint8Array(await (await result.toBlob()).arrayBuffer());
  return saveBytesFile(`belt_order_${label}.xlsx`, bytes, "Excel workbook", "xlsx");
}
