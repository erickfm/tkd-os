/**
 * Save text to a file the user picks via the native OS "Save As" dialog.
 * Returns true if a file was written, false if the user canceled.
 *
 * Lazy imports keep the Tauri runtime out of the Node/test import graph
 * (same pattern as db/client.ts).
 */
export async function saveTextFile(
  defaultName: string,
  text: string,
  kind: "csv" | "html" = "csv",
): Promise<boolean> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  const filter = kind === "html"
    ? { name: "HTML (open & print)", extensions: ["html"] }
    : { name: "Comma-separated values", extensions: ["csv"] };
  const path = await save({ defaultPath: defaultName, filters: [filter] });
  if (!path) return false;
  await invoke("write_text_file", { path, contents: text });
  await openSaved(path);
  return true;
}

/** Save raw bytes (e.g. a generated .xlsx) via the native Save dialog. */
export async function saveBytesFile(
  defaultName: string,
  bytes: Uint8Array,
  filterName: string,
  ext: string,
): Promise<boolean> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await save({ defaultPath: defaultName, filters: [{ name: filterName, extensions: [ext] }] });
  if (!path) return false;
  await invoke("write_bytes_file", { path, bytes: Array.from(bytes) });
  await openSaved(path);
  return true;
}

/** Open the just-saved file in the OS default app. Best-effort — a failure to
 * open should not make the (successful) save look like it failed. */
async function openSaved(path: string): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_path", { path });
  } catch {
    /* file is saved; opening is a convenience only */
  }
}
