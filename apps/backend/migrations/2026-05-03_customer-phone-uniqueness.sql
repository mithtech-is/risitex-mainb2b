-- 2026-05-03 — enforce uniqueness on customer.phone
--
-- Background: customer.email is already unique (registered customers
-- only) via Medusa's IDX_customer_email_has_account_unique. The phone
-- column had no constraint, so two accounts could share a number — a
-- problem for phone-OTP login (the resolver refuses on multi-match)
-- and for fraud detection (one phone tied to many "different" people).
--
-- This adds a partial unique index on phone, scoped to active rows
-- (deleted_at IS NULL) so soft-deleted customers don't block the
-- number being reused. NULL phones are allowed (the partial WHERE
-- clause excludes them) so customers without a phone still work.
--
-- Verified zero duplicates exist before adding (SELECT phone, count(*)
-- FROM customer WHERE phone IS NOT NULL AND deleted_at IS NULL
-- GROUP BY phone HAVING count(*) > 1 → 0 rows). The CREATE INDEX
-- below would fail noisily if duplicates existed; safe today.
--
-- Application-layer pre-checks in phone-otp/send and phone-otp/verify
-- catch this earlier and return a friendlier error message; this index
-- is the defense-in-depth backstop in case those checks are bypassed
-- (admin tools, raw SQL, future routes).

CREATE UNIQUE INDEX IF NOT EXISTS customer_phone_unique
    ON customer (phone)
    WHERE phone IS NOT NULL AND deleted_at IS NULL;
