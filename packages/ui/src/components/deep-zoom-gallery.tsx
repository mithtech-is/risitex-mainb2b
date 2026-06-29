"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { ChevronLeft, ChevronRight, ZoomIn, Play, X } from "lucide-react";
import { cn } from "./utils";

export type MediaItem =
  | { type: "image"; src: string; alt: string; placeholderTone?: string }
  | { type: "video"; src: string; poster?: string; placeholderTone?: string };

export type DeepZoomGalleryProps = {
  items: MediaItem[];
  className?: string;
};

/**
 * Deep-zoom gallery with thumbnails, lightbox, and pan-on-hover (desktop) +
 * pinch-zoom (mobile via native browser support inside the lightbox).
 *
 * Stage image scales on mouse hover; cursor position drives the focal point so
 * the buyer can inspect weave and stitching without leaving the page. Click
 * the zoom icon to open the lightbox at full resolution.
 */
export function DeepZoomGallery({ items, className }: DeepZoomGalleryProps) {
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = React.useState(false);
  const [origin, setOrigin] = React.useState<{ x: number; y: number }>({ x: 50, y: 50 });

  const selected = items[selectedIdx];

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin({ x, y });
  };

  return (
    <div className={cn("flex flex-col gap-3 md:flex-row md:gap-4", className)}>
      {/* Thumbnail strip — vertical on desktop, horizontal scroll on mobile */}
      <div className="order-2 flex shrink-0 gap-2 overflow-x-auto md:order-1 md:w-20 md:flex-col">
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelectedIdx(i)}
            aria-label={`View media ${i + 1}`}
            className={cn(
              "relative h-16 w-16 shrink-0 overflow-hidden rounded-sm bg-image-plate ring-1 transition-shadow duration-fast",
              i === selectedIdx
                ? "ring-2 ring-brand-accent"
                : "ring-border-subtle hover:ring-border-strong",
            )}
            style={{ background: it.placeholderTone ?? "var(--image-plate)" }}
          >
            {it.type === "video" && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                <Play className="h-5 w-5" fill="currentColor" />
              </span>
            )}
            {it.type === "image" && "src" in it && it.src ? (
              <img
                src={it.src}
                alt={it.alt}
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden className="block h-full w-full" />
            )}
          </button>
        ))}
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className="order-1 relative aspect-square w-full overflow-hidden rounded-sm bg-image-plate ring-1 ring-border-subtle md:order-2"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseMove={onMouseMove}
      >
        {selected?.type === "image" ? (
          selected.src ? (
            <img
              src={selected.src}
              alt={selected.alt}
              className="h-full w-full object-cover transition-transform duration-base ease-standard"
              style={{
                transform: hovering ? "scale(2.2)" : "scale(1)",
                transformOrigin: `${origin.x}% ${origin.y}%`,
                cursor: hovering ? "zoom-in" : "default",
              }}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ background: selected.placeholderTone ?? "transparent" }}
            >
              <span className="font-display text-[140px] leading-none text-text-muted/30">
                {selected.alt.charAt(0).toUpperCase()}
              </span>
            </div>
          )
        ) : selected?.type === "video" ? (
          <video
            src={selected.src}
            poster={selected.poster}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        ) : null}

        {/* Zoom-into-lightbox button */}
        {selected?.type === "image" && (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="Open full-screen view"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-raised/90 text-text-primary shadow-rest transition-transform duration-fast hover:scale-105 focus-visible:ring-focus"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        )}

        {/* Prev/next */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => setSelectedIdx((i) => (i - 1 + items.length) % items.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised/90 text-text-primary shadow-rest hover:scale-105 transition-transform focus-visible:ring-focus"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => setSelectedIdx((i) => (i + 1) % items.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised/90 text-text-primary shadow-rest hover:scale-105 transition-transform focus-visible:ring-focus"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Counter */}
        <div className="absolute bottom-3 left-3 inline-flex items-center rounded-full bg-surface-raised/90 px-2 py-0.5 text-caption text-text-secondary shadow-rest numerics-tabular">
          {selectedIdx + 1} / {items.length}
        </div>
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          hideClose
          className="max-w-[95vw] p-0"
        >
          <DialogTitle className="sr-only">Media lightbox</DialogTitle>
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-raised text-text-primary shadow-rest focus-visible:ring-focus"
          >
            <X className="h-5 w-5" />
          </button>
          {selected?.type === "image" && selected.src && (
            <img
              src={selected.src}
              alt={selected.alt}
              className="h-auto max-h-[85vh] w-full object-contain"
            />
          )}
          {selected?.type === "image" && !selected.src && (
            <div
              className="aspect-square w-full"
              style={{ background: selected.placeholderTone ?? "var(--image-plate)" }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
