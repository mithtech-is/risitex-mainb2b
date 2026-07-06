"use client";

import * as React from "react";
import Image from "next/image";
import { ZoomIn, X } from "lucide-react";

/**
 * Product image gallery with click-to-zoom lightbox.
 *
 * - Multiple images → large main image + thumbnail strip.
 * - Single image    → one large portrait image with breathing room below,
 *                     instead of a lonely half-width tile.
 * - Any image is clickable to open a full-resolution lightbox that zooms on
 *   click, so buyers get a clear, high-quality view.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: string[];
  productName: string;
}) {
  const imgs = React.useMemo(
    () => Array.from(new Set(images.filter(Boolean))),
    [images],
  );
  const [active, setActive] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Lock background scroll while the lightbox is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (imgs.length === 0) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-md bg-paper-100 font-display text-[96px] leading-none text-text-muted/30 ring-1 ring-border-subtle">
        {productName.charAt(0).toUpperCase()}
      </div>
    );
  }

  const single = imgs.length === 1;
  const openLightbox = (i: number) => {
    setActive(i);
    setZoomed(false);
    setOpen(true);
  };

  return (
    <div>
      {/* Main image */}
      <button
        type="button"
        onClick={() => openLightbox(active)}
        aria-label={`Zoom ${productName} image`}
        className={[
          "group relative block w-full overflow-hidden rounded-md bg-image-plate ring-1 ring-border-subtle cursor-zoom-in",
          single ? "aspect-[4/5]" : "aspect-square",
        ].join(" ")}
      >
        <Image
          src={imgs[active]!}
          alt={`${productName} — image ${active + 1}`}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover transition-transform duration-slow group-hover:scale-105"
        />
        <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-surface-background/90 px-2.5 py-1 text-caption text-text-secondary opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-3.5 w-3.5" /> Click to zoom
        </span>
      </button>

      {/* Breathing room below a single-image product */}
      {single && <div className="h-8" />}

      {/* Thumbnail strip for multi-image products */}
      {!single && (
        <div className="mt-3 grid grid-cols-4 gap-3">
          {imgs.slice(0, 8).map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              onDoubleClick={() => openLightbox(i)}
              aria-label={`View image ${i + 1}`}
              className={[
                "relative aspect-square overflow-hidden rounded-md bg-image-plate ring-1 transition-shadow",
                active === i
                  ? "ring-2 ring-action-primary-bg"
                  : "ring-border-subtle hover:ring-text-muted",
              ].join(" ")}
            >
              <Image
                src={src}
                alt={`${productName} thumbnail ${i + 1}`}
                fill
                sizes="120px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} image viewer`}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="max-h-[92vh] max-w-[92vw] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Plain <img> to load the full-resolution original for zoom. */}
            <img
              src={imgs[active]}
              alt={`${productName} — enlarged view`}
              onClick={() => setZoomed((z) => !z)}
              className={[
                "select-none rounded-md transition-transform duration-normal",
                zoomed ? "scale-[1.8] cursor-zoom-out" : "cursor-zoom-in",
              ].join(" ")}
              style={{ maxHeight: "88vh", maxWidth: "88vw", objectFit: "contain" }}
            />
          </div>
          {imgs.length > 1 && (
            <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
              {imgs.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActive(i);
                    setZoomed(false);
                  }}
                  aria-label={`Go to image ${i + 1}`}
                  className={[
                    "h-2 w-2 rounded-full transition-colors",
                    active === i ? "bg-white" : "bg-white/40 hover:bg-white/70",
                  ].join(" ")}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
