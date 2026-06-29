import { type ReactNode } from "react";

type Width = "default" | "wide" | "narrow";

/**
 * Page container honouring the grid widths from §6 of the blueprint.
 *
 *   default → max 1200 (laptop) / 1360 (desktop) / 1440 (wide)
 *   wide    → flush margins, no max
 *   narrow  → max 720, centred — used for long-form editorial copy
 */
export function Container({
  children,
  width = "default",
  className = "",
}: {
  children: ReactNode;
  width?: Width;
  className?: string;
}) {
  const widthClass =
    width === "wide"
      ? "max-w-none"
      : width === "narrow"
        ? "max-w-[720px]"
        : "max-w-[1200px] xl:max-w-[1360px] 2xl:max-w-[1440px]";

  return (
    <div
      className={`mx-auto w-full px-5 sm:px-6 lg:px-8 xl:px-10 2xl:px-14 ${widthClass} ${className}`}
    >
      {children}
    </div>
  );
}
