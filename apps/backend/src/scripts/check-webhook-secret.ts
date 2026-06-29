import { MedusaContainer } from "@medusajs/framework/types"
import {
  CASHFREE_WALLET_MODULE,
  CashfreeWalletService,
} from "../modules/cashfree_wallet"

export default async function checkWebhookSecret({
  container,
}: {
  container: MedusaContainer
}) {
  const wallet = container.resolve(
    CASHFREE_WALLET_MODULE,
  ) as CashfreeWalletService

  // Resolve the secret the same way the live POST handler does. Don't
  // log the secret itself — only its presence + length so we can reason
  // about the config without leaking the value.
  const pgSecret = await wallet.getWebhookSecret("payment_gateway")
  const verificationSecret = await wallet.getWebhookSecret("verification")
  const payoutsSecret = await wallet.getWebhookSecret("payouts")

  const fp = (s: string | null) =>
    s
      ? `present, length=${s.length}, first2=${s.slice(0, 2)}, last2=${s.slice(-2)}`
      : "MISSING"
  console.log(`payment_gateway webhook secret  → ${fp(pgSecret)}`)
  console.log(`verification    webhook secret  → ${fp(verificationSecret)}`)
  console.log(`payouts         webhook secret  → ${fp(payoutsSecret)}`)
}
