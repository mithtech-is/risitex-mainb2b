import * as React from "react";

/** Carton — open box with inner divider visible. */
export const Carton = React.forwardRef<
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
    <path d="M3 7l9-4 9 4-9 4-9-4Z" />
    <path d="M3 7v10l9 4 9-4V7" />
    <path d="M12 11v10" />
    <path d="M8 5l8 4" />
  </svg>
));
Carton.displayName = "Carton";
