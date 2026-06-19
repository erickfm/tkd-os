import type { BeltRank } from "@/db/schema";

interface BeltBadgeProps {
  rank: Pick<BeltRank, "name" | "colorHex" | "textHex" | "borderHex" | "level" | "degree">;
  size?: "sm" | "md";
}

export function BeltBadge({ rank, size = "md" }: BeltBadgeProps) {
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${padding}`}
      style={{
        background: rank.colorHex,
        color: rank.textHex,
        borderColor: rank.borderHex,
      }}
    >
      {rank.name}
    </span>
  );
}
