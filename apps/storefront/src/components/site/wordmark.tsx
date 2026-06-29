/**
 * Wordmark — placeholder for the final identity drawn by a typographer.
 *
 * Set in Inter Display weight 600 with slightly negative tracking, lowercase,
 * to express the brand voice without committing to a logo treatment that
 * should be designed deliberately later.
 *
 * Monogram is the letter R rendered as the letterform itself, no decoration.
 * Replace this file with the finalised SVG mark when identity is signed off.
 */
export function Wordmark({
  showMonogram = false,
  className = "",
}: {
  showMonogram?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-heading-md text-text-primary ${className}`}
      aria-label="RISITEX"
    >
      {showMonogram && (
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-sm bg-text-primary text-text-on-inverse font-display text-[18px] font-medium leading-none"
        >
          R
        </span>
      )}
      <span
        style={{ letterSpacing: "-0.01em" }}
        className="font-sans font-semibold lowercase"
      >
        risitex
      </span>
    </span>
  );
}
