import { MedusaService } from "@medusajs/framework/utils"
import scrypt from "scrypt-kdf"
import { PasswordHistoryEntry } from "./models/password-history-entry"

/** How many historic passwords to remember. */
export const PASSWORD_HISTORY_LIMIT = 10

/**
 * PasswordHistoryService — remembers the last N password hashes per
 * account so update flows can reject password reuse.
 *
 * We use `scrypt-kdf` (the same library Medusa's auth-emailpass
 * provider uses internally) — zero added dependencies and the format
 * is familiar to anyone reading this table in a DB client. The hashes
 * stored here are independent of Medusa's (we don't read Medusa's
 * stored hash), so the format choice is purely internal.
 */
class PasswordHistoryService extends MedusaService({ PasswordHistoryEntry }) {
    // scrypt-kdf default config — matches Medusa's auth-emailpass
    // provider. `logN: 15` (i.e. N = 32768) is the recommended default
    // as of 2024; slow enough to discourage rainbow attacks on a
    // leaked DB dump, fast enough that the history check adds < 200ms.
    private readonly HASH_CONFIG = { logN: 15, r: 8, p: 1 }

    /**
     * Returns true iff `newPassword` matches any of the last N stored
     * hashes for this account.
     */
    async wasRecentlyUsed(
        email: string,
        actorType: "customer" | "user",
        newPassword: string,
    ): Promise<boolean> {
        if (!email || !newPassword) return false
        const recent = await this.listPasswordHistoryEntries(
            {
                email: email.toLowerCase(),
                actor_type: actorType,
            },
            { take: PASSWORD_HISTORY_LIMIT },
        )
        for (const row of recent) {
            try {
                const buf = Buffer.from(row.password_hash, "base64")
                const match = await scrypt.verify(buf, newPassword)
                if (match) return true
            } catch {
                // Corrupt hash — ignore, treat as non-match.
            }
        }
        return false
    }

    /**
     * Insert the new password's hash and trim the history to N entries
     * (soft-delete the overflow).
     */
    async record(
        email: string,
        actorType: "customer" | "user",
        newPassword: string,
    ): Promise<void> {
        if (!email || !newPassword) return
        const hashBuf = await scrypt.kdf(newPassword, this.HASH_CONFIG)
        const hash = hashBuf.toString("base64")
        await this.createPasswordHistoryEntries({
            email: email.toLowerCase(),
            actor_type: actorType,
            password_hash: hash,
        })

        // Trim oldest entries beyond the cap.
        const all = await this.listPasswordHistoryEntries(
            { email: email.toLowerCase(), actor_type: actorType },
            { take: PASSWORD_HISTORY_LIMIT * 2 },
        )
        if (all.length <= PASSWORD_HISTORY_LIMIT) return

        // `created_at` exists on every entry but isn't in the model's
        // typed shape — cast to any to read it for the sort.
        const sorted = [...all].sort((a: any, b: any) => {
            const ta = new Date(a.created_at || 0).getTime()
            const tb = new Date(b.created_at || 0).getTime()
            return tb - ta // newest first
        })
        const stale = sorted.slice(PASSWORD_HISTORY_LIMIT)
        if (stale.length > 0) {
            await this.deletePasswordHistoryEntries(
                stale.map((e: any) => e.id),
            )
        }
    }
}

export default PasswordHistoryService
