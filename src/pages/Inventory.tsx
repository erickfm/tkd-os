import { useEffect, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Button, TextInput } from "@/components/ui";
import {
  addInventoryItem,
  deleteInventoryItem,
  listInventory,
  updateInventoryItem,
  type InventorySectionWithItems,
} from "@/db/repos";
import type { InventoryItem } from "@/db/schema";
import { exportSectionXlsx } from "@/lib/inventoryExport";
import { prettyDate } from "@/lib/format";

export function InventoryPage() {
  const [data, setData] = useState<InventorySectionWithItems[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try { setData(await listInventory()); }
    catch (e) { setError(String(e)); }
  }
  useEffect(() => { load(); }, []);

  // Optimistically reflect an edit locally (keeps focus; avoids a full reload).
  function patchItem(sectionId: number, itemId: number, patch: Partial<InventoryItem>) {
    setData((d) => d?.map((sec) =>
      sec.section.id !== sectionId ? sec : {
        section: { ...sec.section, updatedAt: new Date().toISOString() },
        items: sec.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
      }) ?? null);
  }

  async function saveCount(sectionId: number, item: InventoryItem, field: "inStock" | "toOrder", raw: string) {
    const value = Math.max(0, Math.floor(Number(raw) || 0));
    patchItem(sectionId, item.id, { [field]: value });
    await updateInventoryItem(item.id, { [field]: value });
  }

  async function add(sectionId: number, name: string, size: string) {
    if (!name.trim()) return;
    await addInventoryItem(sectionId, name.trim(), size.trim() || null);
    await load();
  }
  async function remove(itemId: number) {
    await deleteInventoryItem(itemId);
    await load();
  }
  async function exportSection(name: string, items: InventoryItem[]) {
    const saved = await exportSectionXlsx(name, items);
    setMsg(saved ? `${name} exported to Excel.` : "Export canceled.");
  }

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock on hand and what to order, by section." />

      {error && <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">{error}</div>}
      {msg && <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">{msg}</div>}

      <div className="space-y-8">
        {data?.map(({ section, items }) => (
          <SectionCard
            key={section.id}
            name={section.name}
            updatedAt={section.updatedAt}
            items={items}
            onSaveCount={(item, field, raw) => saveCount(section.id, item, field, raw)}
            onAdd={(name, size) => add(section.id, name, size)}
            onRemove={remove}
            onExport={() => exportSection(section.name, items)}
          />
        ))}
      </div>
    </>
  );
}

function SectionCard({ name, updatedAt, items, onSaveCount, onAdd, onRemove, onExport }: {
  name: string;
  updatedAt: string;
  items: InventoryItem[];
  onSaveCount: (item: InventoryItem, field: "inStock" | "toOrder", raw: string) => void;
  onAdd: (name: string, size: string) => void;
  onRemove: (itemId: number) => void;
  onExport: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newSize, setNewSize] = useState("");

  function submitAdd() {
    onAdd(newName, newSize);
    setNewName("");
    setNewSize("");
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{name}</h2>
          <p className="text-xs text-[var(--color-fg-muted)]">Last updated {prettyDate(updatedAt)}</p>
        </div>
        <Button variant="secondary" onClick={onExport}><Download size={16} />Export to Excel</Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium text-right">In stock</th>
              <th className="px-3 py-2 font-medium text-right">To order</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-1.5">{it.name}</td>
                <td className="px-3 py-1.5 text-[var(--color-fg-muted)]">{it.size ?? "—"}</td>
                <td className="px-3 py-1.5 text-right">
                  <CountInput value={it.inStock} onCommit={(raw) => onSaveCount(it, "inStock", raw)} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <CountInput value={it.toOrder} onCommit={(raw) => onSaveCount(it, "toOrder", raw)} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button onClick={() => onRemove(it.id)} className="text-[var(--color-fg-muted)] hover:text-red-600" aria-label="Remove item"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-sm text-[var(--color-fg-muted)]">No items — add one below.</td></tr>
            )}
            <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <td className="px-3 py-2"><TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New item…" className="w-full" /></td>
              <td className="px-3 py-2"><TextInput value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="Size (optional)" className="w-full" /></td>
              <td colSpan={3} className="px-3 py-2">
                <Button variant="secondary" onClick={submitAdd} disabled={!newName.trim()}><Plus size={14} />Add</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Local value so typing is smooth; commit (persist) on blur or Enter.
function CountInput({ value, onCommit }: { value: number; onCommit: (raw: string) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <input
      type="number"
      min={0}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm outline-none focus:border-[var(--color-brand)]"
    />
  );
}
