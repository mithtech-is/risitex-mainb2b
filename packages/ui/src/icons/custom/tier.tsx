import * as React from "react";

/** Tier — three ascending bars, the icon for tier brackets. */
export const Tier = React.forwardRef<
  SVGSVGElement,
  React.SVGAttributes<SVGSVGElement>
>(({ width = 24, height = 24, ...props }, ref) => (
  <svg
    ref={ref}
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="3" y="15" width="5" height="6" rx="1" />
    <rect x="9.5" y="10" width="5" height="11" rx="1" />
    <rect x="16" y="4" width="5" height="17" rx="1" />
  </svg>
));
Tier.displayName = "Tier";
