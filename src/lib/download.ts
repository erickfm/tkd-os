/**
 * Save text to a file the user picks via the native OS "Save As" dialog.
 * Returns true if a file was written, false if the user canceled.
 *
 * Lazy imports keep the Tauri runtime out of the Node/test import graph
 * (same pattern as db/client.ts).
 */
export async function saveTextFile(defaultName: string, text: string): Promise<boolean> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "Comma-separated values", extensions: ["csv"] }],
  });
  if (!path) return false;
  await invoke("write_text_file", { path, contents: text });
  return true;
}
