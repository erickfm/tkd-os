import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]",
  secondary:
    "border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)]",
  ghost: "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
  danger: "border border-red-500/40 text-red-600 hover:bg-red-500/10",
};

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...props
}: {
  variant?: ButtonVariant;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
          {hint}
        </span>
      )}
    </label>
  );
}

const inputBase =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea {...props} className={`${inputBase} ${props.className ?? ""}`} />
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center">
      <div className="text-sm font-medium">{title}</div>
      {children && (
        <div className="mt-2 text-sm text-[var(--color-fg-muted)]">
          {children}
        </div>
      )}
    </div>
  );
}
