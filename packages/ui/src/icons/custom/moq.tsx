import * as React from "react";

/** MOQ — three stacked items with a brace, representing minimum order quantity. */
export const MOQ = React.forwardRef<
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
    <rect x="4" y="4" width="13" height="3" rx="0.5" />
    <rect x="4" y="10.5" width="13" height="3" rx="0.5" />
    <rect x="4" y="17" width="13" height="3" rx="0.5" />
    <path d="M19.5 5v14" />
    <path d="M19.5 5c.5 0 1 .5 1 1m-1 13c.5 0 1-.5 1-1" />
  </svg>
));
MOQ.displayName = "MOQ";
