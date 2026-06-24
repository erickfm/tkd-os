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
  return true;
}
