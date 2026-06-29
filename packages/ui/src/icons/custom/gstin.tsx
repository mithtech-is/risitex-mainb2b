import * as React from "react";

/** GSTIN — compact "GST" wordmark in a rounded square. */
export const GSTIN = React.forwardRef<
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
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <text
      x="12"
      y="15.5"
      textAnchor="middle"
      fontSize="7"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      fontWeight="700"
      fill="currentColor"
      stroke="none"
    >
      GST
    </text>
  </svg>
));
GSTIN.displayName = "GSTIN";
