import writeXlsxFile from "write-excel-file/browser";

import type { CertificateRow } from "@/db/repos";
import { saveBytesFile } from "./download";

/**
 * Build the certificate-data .xlsx (mail-merge source) and save it. Columns match
 * the school's existing template exactly — header "S Last Name" (holds the full
 * name) and "Color" (the new rank) — so existing Word mail merges keep working.
 */
export async function exportCertificateData(rows: CertificateRow[], label: string): Promise<boolean> {
  const header = ["S Last Name", "Color"].map((value) => ({ value, type: String }));
  const data = rows.map((r) => [
    { value: r.name, type: String },
    { value: r.rank, type: String },
  ]);
  const write = writeXlsxFile as unknown as (data: unknown, opts: unknown) => Promise<{ toBlob: () => Promise<Blob> }>;
  const result = await write([header, ...data], { columns: [{ width: 28 }, { width: 24 }], sheetName: "Certificate Data" });
  const bytes = new Uint8Array(await (await result.toBlob()).arrayBuffer());
  return saveBytesFile(`certificate_data_${label}.xlsx`, bytes, "Excel workbook", "xlsx");
}
