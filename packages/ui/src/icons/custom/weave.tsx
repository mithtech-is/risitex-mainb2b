import * as React from "react";

/** Weave — two-thread crossing pattern. */
export const Weave = React.forwardRef<
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
    <path d="M4 8c2.5 0 2.5 4 5 4s2.5-4 5-4 2.5 4 5 4" />
    <path d="M4 16c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4" />
  </svg>
));
Weave.displayName = "Weave";
