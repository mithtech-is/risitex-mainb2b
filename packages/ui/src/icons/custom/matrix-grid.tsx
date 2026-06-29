import * as React from "react";

/** MatrixGrid — 3×3 dot matrix, the icon for variant matrices. */
export const MatrixGrid = React.forwardRef<
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
    {[5, 12, 19].map((y) =>
      [5, 12, 19].map((x) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" stroke="none" />
      )),
    )}
  </svg>
));
MatrixGrid.displayName = "MatrixGrid";
