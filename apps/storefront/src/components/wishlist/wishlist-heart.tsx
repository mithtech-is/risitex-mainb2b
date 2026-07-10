"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { scopedKey } from "@/lib/user-scope";

const STORAGE_KEY = "risitex-b2b-wishlist";
const EVENT_NAME = "risitex:wishlist-changed";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function write(slugs: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(slugs));
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    /* quota / disabled — ignore */
  }
}

/**
 * Wishlist toggle. Keeps state in localStorage and broadcasts a custom event
 * so the topnav heart-badge updates instantly. A future backend swap (e.g.
 * /store/wishlist) only needs to replace the read/write helpers — every
 * consumer stays the same.
 *
 * Renders as a small icon-only button. Wrap with a click-guarded container
 * (e.g. inside a Link) — this component calls `stopPropagation` so the
 * surrounding Link does NOT navigate when the heart is clicked.
 */
export function WishlistHeart({
  slug,
  productName,
  className,
}: {
  slug: string;
  productName?: string;
  className?: string;
}) {
  const [inList, setInList] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setInList(read().includes(slug));
    const sync = () => setInList(read().includes(slug));
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("risitex:auth-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("risitex:auth-changed", sync);
    };
  }, [slug]);

  const toggle = (e: React.MouseEvent) => {
    // Cards are wrapped in <Link>; without this the click navigates instead
    // of toggling.
    e.preventDefault();
    e.stopPropagation();
    const current = read();
    const next = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug];
    write(next);
    setInList(next.includes(slug));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        inList
          ? `Remove ${productName ?? slug} from wishlist`
          : `Add ${productName ?? slug} to wishlist`
      }
      aria-pressed={mounted ? inList : undefined}
      className={[
        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-surface-background transition-colors duration-fast",
        mounted && inList
          ? "border-feedback-danger-border bg-feedback-danger-bg text-feedback-danger-text"
          : "text-text-muted hover:bg-surface-sunken hover:text-text-primary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Heart
        className="h-4 w-4"
        fill={mounted && inList ? "currentColor" : "none"}
        aria-hidden
      />
    </button>
  );
}
