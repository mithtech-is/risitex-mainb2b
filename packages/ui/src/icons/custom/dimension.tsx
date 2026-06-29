import * as React from "react";

/** Dimension — bracketed line, representing measurement / size dimension. */
export const Dimension = React.forwardRef<
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
    <path d="M3 6v12" />
    <path d="M3 6h3M3 18h3" />
    <path d="M21 6v12" />
    <path d="M21 6h-3M21 18h-3" />
    <path d="M6 12h12" />
  </svg>
));
Dimension.displayName = "Dimension";
