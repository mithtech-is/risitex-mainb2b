/**
 * One-shot DPDP §12 hard-delete for Soubarna Karmakar (totsprod@gmail.com).
 * Run via `medusa exec /workspace/apps/medusa-backend/scripts/hard-delete-soubarna.ts`.
 */
import { hardDeleteCustomer } from "../src/utils/dpdp/hard-delete-customer"

const SOUBARNA_ID = "cus_01KRKV8G6G4EFD4BVN22CMAEX5"

export default async function ({ container }: { container: any }) {
  console.log(`[hard-delete] target: ${SOUBARNA_ID} (Soubarna Karmakar / totsprod@gmail.com)`)
  const report = await hardDeleteCustomer(container, SOUBARNA_ID)
  console.log("[hard-delete] report:", JSON.stringify(report, null, 2))
}
