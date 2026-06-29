import { Label, Text } from "@medusajs/ui";
import type { ReactNode } from "react";

export function InfoGrid({
  items,
  cols = 2,
}: {
  items: { label: string; value: ReactNode; mono?: boolean }[];
  cols?: 2 | 3 | 4;
}) {
  const grid =
    cols === 4
      ? "grid-cols-4"
      : cols === 3
        ? "grid-cols-3"
        : "grid-cols-2";
  return (
    <div className={`grid ${grid} gap-x-8 gap-y-3 px-6 py-4`}>
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-0.5">
          <Label size="xsmall" className="text-ui-fg-subtle">
            {it.label}
          </Label>
          {typeof it.value === "string" || typeof it.value === "number" ? (
            <Text className={it.mono ? "font-mono text-xs" : undefined}>
              {it.value}
            </Text>
          ) : (
            it.value
          )}
        </div>
      ))}
    </div>
  );
}
