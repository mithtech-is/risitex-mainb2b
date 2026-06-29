import * as React from "react";

/** Swatch — three overlapping squares with offset, representing colour samples. */
export const SwatchIcon = React.forwardRef<
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
    <rect x="3" y="3" width="10" height="10" rx="2" />
    <rect x="8" y="8" width="10" height="10" rx="2" />
    <rect x="11" y="11" width="10" height="10" rx="2" />
  </svg>
));
SwatchIcon.displayName = "SwatchIcon";
