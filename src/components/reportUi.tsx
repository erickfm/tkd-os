import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/PageHeader";

// Small presentational pieces shared by the Reports screens. No data access here.

export function pct(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined ? "—" : `${(n * 100).toFixed(digits)}%`;
}

export function num1(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toFixed(1);
}

/** "10.4 months" under two years, otherwise "3.1 years". */
export function fmtMonths(m: number | null | undefined): string {
  if (m === null || m === undefined) return "—";
  return m < 24 ? `${m.toFixed(1)} months` : `${(m / 12).toFixed(1)} years`;
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type Tone = "good" | "warn" | "bad" | "neutral";

const TONE_TEXT: Record<Tone, string> = {
  good: "text-green-700",
  warn: "text-amber-600",
  bad: "text-red-600",
  neutral: "text-[var(--color-fg)]",
};

/** Loads something async and re-loads when `deps` change; keeps the old result on screen while refreshing. */
export function useReport<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    load()
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => { if (live) setError(String(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, deps);
  return { data, error, loading };
}

/** Page frame for a detail report: a way back to the scorecard, the title, and any load error. */
export function ReportShell({ title, subtitle, error, controls, children }: {
  title: string;
  subtitle: string;
  error?: string | null;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Link to="/reports" className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
        <ArrowLeft size={14} />All reports
      </Link>
      <PageHeader title={title} subtitle={subtitle} />
      {controls && <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">{controls}</div>}
      {error && <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>}
      {children}
    </>
  );
}

export function Card({ title, hint, children, className = "" }: { title?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${className}`}>
      {title && (
        <div className="mb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <div className="text-xs text-[var(--color-fg-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${TONE_TEXT[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{sub}</div>}
    </div>
  );
}

export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const c = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" }[cols];
  return <div className={`mb-6 grid grid-cols-2 gap-3 ${c}`}>{children}</div>;
}

/** A plain-English note: what a number means, or a caveat about the data behind it. */
export function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" }) {
  const cls = tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-[var(--color-border)] bg-[var(--color-surface-2)]";
  return <div className={`mb-4 rounded-md border p-3 text-xs leading-relaxed text-[var(--color-fg-muted)] ${cls}`}>{children}</div>;
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const cls = {
    good: "bg-green-600/10 text-green-700",
    warn: "bg-amber-500/15 text-amber-700",
    bad: "bg-red-500/10 text-red-700",
    neutral: "bg-[var(--color-surface-3)] text-[var(--color-fg-muted)]",
  }[tone];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

/** Button group for picking one option (a time window, a filter). */
export function Segmented<T extends string | number>({ label, options, value, onChange }: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-[var(--color-fg-muted)]">{label}</span>}
      <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)]">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              o.value === value
                ? "bg-[var(--color-brand)] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-fg-muted)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5" />
      {label}
    </label>
  );
}

/** One horizontal bar with a label on the left and a value on the right. */
export function BarRow({ label, value, max, right, color, sublabel, dim, labelWidth = "w-44" }: {
  label: ReactNode;
  value: number;
  max: number;
  right?: ReactNode;
  color?: string;
  sublabel?: ReactNode;
  dim?: boolean;
  labelWidth?: string;
}) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`flex items-center gap-2 text-sm ${dim ? "opacity-50" : ""}`}>
      <div className={`${labelWidth} shrink-0 truncate`} title={typeof label === "string" ? label : undefined}>{label}</div>
      <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--color-surface-2)]">
        <div className="h-full rounded" style={{ width: `${width}%`, background: color ?? "var(--color-brand)" }} />
      </div>
      <div className="w-24 shrink-0 text-right text-xs tabular-nums text-[var(--color-fg-muted)]">{right ?? value}</div>
      {sublabel && <div className="w-40 shrink-0 text-xs text-[var(--color-fg-muted)]">{sublabel}</div>}
    </div>
  );
}

export interface Column {
  key: string;
  label: string;
  value: number;
  /** Shown on hover. */
  title?: string;
  color?: string;
  faded?: boolean;
}

/** Vertical bars, one per item, with a label under each. `labelEvery` thins the labels when there are many. */
export function ColumnChart({ items, height = 140, labelEvery = 1, format = (n: number) => String(n) }: {
  items: Column[];
  height?: number;
  labelEvery?: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }}>
        {items.map((it) => (
          <div key={it.key} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={it.title ?? `${it.label}: ${format(it.value)}`}>
            <div className="mb-0.5 text-center text-[10px] tabular-nums text-[var(--color-fg-muted)]">{it.faded ? "" : format(it.value)}</div>
            <div
              className="w-full rounded-t"
              style={{
                height: `${(it.value / max) * (height - 18)}px`,
                minHeight: it.value > 0 ? 2 : 0,
                background: it.faded
                  ? "repeating-linear-gradient(45deg, var(--color-surface-3), var(--color-surface-3) 3px, var(--color-surface-2) 3px, var(--color-surface-2) 6px)"
                  : it.color ?? "var(--color-brand)",
                ...(it.faded ? { height: height - 18 } : {}),
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {items.map((it, i) => (
          <div key={it.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-[var(--color-fg-muted)]">
            {i % labelEvery === 0 ? it.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tiny bar chart of a series (e.g. a student's visits per week). */
export function Sparkbars({ values, height = 22, color = "var(--color-brand)" }: { values: number[]; height?: number; color?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-px" style={{ height }} aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-t-sm"
          style={{ height: v === 0 ? 1 : Math.max(3, (v / max) * height), background: v === 0 ? "var(--color-border)" : color }}
        />
      ))}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">{children}</p>;
}

/** A simple table with the app's header styling. */
export function Table({ head, children }: { head: (string | { label: string; right?: boolean })[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
          <tr>
            {head.map((h) => {
              const c = typeof h === "string" ? { label: h, right: false } : h;
              return <th key={c.label} className={`px-3 py-2 font-medium ${c.right ? "text-right" : ""}`}>{c.label}</th>;
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, right, muted, className = "" }: { children: ReactNode; right?: boolean; muted?: boolean; className?: string }) => (
  <td className={`border-t border-[var(--color-border)] px-3 py-2 ${right ? "text-right tabular-nums" : ""} ${muted ? "text-[var(--color-fg-muted)]" : ""} ${className}`}>{children}</td>
);
