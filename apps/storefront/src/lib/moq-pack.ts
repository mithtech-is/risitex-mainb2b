/**
 * Pack-aware MOQ math for wholesale ordering.
 *
 * MOQ is a single per-product number measured in INDIVIDUAL PIECES.
 * A variant may be sold as a pack (e.g. a "30-36" pack of 4). The buyer
 * keys a PACK count into each grid cell; the pieces that count toward MOQ
 * (and toward pricing) are `packCount * packSize`.
 */

/** Normalise a raw packSize to a positive integer, defaulting to 1. */
export function packSizeOf(raw: number | undefined | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

/** Pieces represented by `packCount` packs of `packSize` each. */
export function cellPieces(packCount: number, packSize: number): number {
  return Math.max(0, packCount) * packSizeOf(packSize);
}

/** Max whole packs that fit in `availablePieces` stock. null stock = no cap. */
export function maxPacksForStock(
  availablePieces: number | null | undefined,
  packSize: number,
): number {
  if (availablePieces === null || availablePieces === undefined) return Infinity;
  return Math.floor(Math.max(0, availablePieces) / packSizeOf(packSize));
}

/** Whether total pieces satisfies the product MOQ. */
export function meetsMoq(totalPieces: number, moq: number): boolean {
  return totalPieces >= (moq ?? 0);
}
