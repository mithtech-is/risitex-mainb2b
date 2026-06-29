/**
 * One-off: ping ERPNext + seed the canonical mappings, server-side
 * (no admin-auth needed). Run via:
 *   pnpm exec medusa exec ./src/scripts/erpnext-ping-seed.ts
 *
 * Safe to delete after the ERPNext integration is verified live.
 */
export default async function erpnextPingSeed({ container }: { container: any }) {
  const logger = container.resolve("logger")
  const erpnext: any = container.resolve("erpnext")

  logger.info("[erpnext-ping-seed] pinging ERPNext…")
  try {
    const ping = await erpnext.pingErpnext()
    logger.info(`[erpnext-ping-seed] PING: ${JSON.stringify(ping)}`)
  } catch (err: any) {
    logger.error(`[erpnext-ping-seed] PING FAILED: ${err?.message ?? err}`)
    return
  }

  logger.info("[erpnext-ping-seed] seeding canonical mappings…")
  try {
    const seeded = await erpnext.seedCanonicalMappings()
    logger.info(`[erpnext-ping-seed] SEED: ${JSON.stringify(seeded)}`)
  } catch (err: any) {
    logger.error(`[erpnext-ping-seed] SEED FAILED: ${err?.message ?? err}`)
  }
}
