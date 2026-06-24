import writeXlsxFile from "write-excel-file/browser";

import type { InventoryItem } from "@/db/schema";
import { saveBytesFile } from "./download";

/** Build an .xlsx for one inventory section and save it via the Save dialog. */
export async function exportSectionXlsx(sectionName: string, items: InventoryItem[]): Promise<boolean> {
  const header = ["Item", "Size", "In stock", "To order"].map((value) => ({
    value,
    fontWeight: "bold" as const,
  }));
  const rows = items.map((it) => [
    { value: it.name, type: String },
    { value: it.size ?? "", type: String },
    { value: it.inStock, type: Number },
    { value: it.toOrder, type: Number },
  ]);
  const columns = [{ width: 24 }, { width: 14 }, { width: 10 }, { width: 10 }];
  // The library's overloads are finicky with mixed cell shapes; call through a
  // loose signature. The browser build resolves to { toBlob, toFile }.
  const write = writeXlsxFile as unknown as (data: unknown, opts: unknown) => Promise<{ toBlob: () => Promise<Blob> }>;
  const result = await write([header, ...rows], { columns, sheetName: sectionName.slice(0, 31) });
  const bytes = new Uint8Array(await (await result.toBlob()).arrayBuffer());
  const safe = sectionName.replace(/[^a-z0-9]+/gi, "_");
  return saveBytesFile(`inventory_${safe}.xlsx`, bytes, "Excel workbook", "xlsx");
}
