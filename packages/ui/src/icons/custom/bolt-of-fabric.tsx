import * as React from "react";

/**
 * BoltOfFabric — a rolled bolt of cloth, side profile.
 * 1.5px stroke on 24px grid; inherits currentColor.
 */
export const BoltOfFabric = React.forwardRef<
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
    <rect x="3" y="7" width="18" height="10" rx="2" />
    <ellipse cx="3" cy="12" rx="1" ry="5" />
    <ellipse cx="21" cy="12" rx="1" ry="5" />
    <path d="M7 12h10" />
  </svg>
));
BoltOfFabric.displayName = "BoltOfFabric";
