/**
 * FR-9.02 — Available vs Physical quantity.
 *
 * ERPNext owns inventory accounting. The pull cron caches `Bin.actual_qty`
 * (physical, on-hand) and `Bin.reserved_qty` (allocated to submitted Sales
 * Orders) per SKU. MBOs must only ever see what they can actually buy now:
 *
 *     available = max(0, physical - reserved)
 *
 * Physical is kept separately for internal/warehouse views; this helper is
 * the single place the subtraction lives.
 */

export type StockLine = {
  /** ERPNext actual_qty cached on the Medusa inventory level. */
  physical: number | null
  /** ERPNext reserved_qty; missing/unknown is treated as zero. */
  reserved: number | null
  /** False (or a null physical) means the SKU is not stock-managed. */
  manageInventory?: boolean
}

export type AvailabilityResult = {
  physical: number | null
  reserved: number
  available: number | null
}

export function computeAvailability(line: StockLine): AvailabilityResult {
  const reserved = line.reserved ?? 0

  // Unmanaged stock has no meaningful availability to compute.
  if (line.manageInventory === false || line.physical == null) {
    return { physical: line.physical ?? null, reserved, available: null }
  }

  const available = Math.max(0, line.physical - reserved)
  return { physical: line.physical, reserved, available }
}
