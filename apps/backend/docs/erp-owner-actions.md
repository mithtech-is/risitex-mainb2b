# RISITEX ERP — Owner action items

This is the install + configure checklist for getting the
`risitex_erp` Frappe app live on the WSL bench and the
RISITEX↔ERPNext sync running. Follow top to bottom.

Architecture context: [erp-architecture.md](./erp-architecture.md).

> **STATUS: LIVE (2026-06-17).** ERPNext 16.22 + HRMS + risitex_erp
> installed on `site1.local`. Medusa↔ERPNext connection verified
> (ping returns the `medusa-sync` user; a test Customer write with
> the `medusa_customer_id` custom field succeeded end-to-end). The
> 7 RISITEX canonical mappings are seeded. See the
> "Gotchas we actually hit" appendix at the bottom for the issues
> resolved during the live bring-up — read it before any redeploy.

---

## 1. Install ERPNext + HRMS on the site

The bench has `erpnext` and `hrms` downloaded but only `frappe` is
installed on `site1.local`. From inside WSL as user `divya`:

```bash
cd /home/divya/frappe-bench
bench --site site1.local install-app erpnext
bench --site site1.local install-app hrms
```

If `bench` isn't on PATH, use the bundled CLI:

```bash
./env/bin/bench --site site1.local install-app erpnext
```

Both installs together take ~3–8 min on first run. Watch for the
"India Compliance" prompt — install it (the canonical mappings rely
on the `gstin` and `pan` custom fields it adds to Customer).

---

## 2. Install `risitex_erp`

The app skeleton has already been created at
`/home/divya/frappe-bench/apps/risitex_erp` (Phase 3 deliverable).
Register it with the bench and install on the site:

```bash
cd /home/divya/frappe-bench
./env/bin/bench --site site1.local install-app risitex_erp
./env/bin/bench --site site1.local migrate
```

`migrate` creates the 7 custom doctypes and applies the 14 custom
fields on standard doctypes (`Customer`, `Item`, `Sales Order`,
`Sales Invoice`, `Delivery Note`) from
`risitex_erp/fixtures/custom_field.json`.

Verify in Frappe Desk:

- Open **DocType List** — search "RISITEX". All 7 should appear:
  - RISITEX Customer Tier
  - RISITEX Affiliate Partner
  - RISITEX Commission Ledger
  - RISITEX Wallet Settlement
  - RISITEX Matrix Order
  - RISITEX Matrix Cell  (child)
  - RISITEX ERP Sync Log
- Open a **Customer** record — confirm `medusa_customer_id`,
  `risitex_tier`, `wallet_balance_paise` custom fields are visible.

---

## 3. Configure the shared webhook secret

Pick a strong random secret (32+ chars). The same value goes on
both sides.

### Frappe side

Append to `/home/divya/frappe-bench/sites/site1.local/site_config.json`:

```json
{
  "medusa_url": "http://localhost:9000",
  "medusa_webhook_secret": "<your-32-char-random-string>"
}
```

### Medusa side

Append to `D:\Users\KillerKoli\Desktop\risitex-v2\.env`:

```bash
ERPNEXT_URL=http://localhost:8000
ERPNEXT_API_KEY=<see step 4>
ERPNEXT_API_SECRET=<see step 4>
ERPNEXT_WEBHOOK_SECRET=<same 32-char string you used in site_config>
```

The shared `*_WEBHOOK_SECRET` is used by both sides to HMAC-sign +
verify webhook bodies. Different from the API key (which
authenticates the Medusa→Frappe REST pulls).

---

## 4. Issue an ERPNext API key + secret for Medusa

In Frappe Desk:

1. Create a system user, e.g. `medusa-sync@risitex.com`, role
   `System Manager`.
2. Open the user record → click **"API Access"** → **Generate Keys**.
3. Copy the API Key and API Secret into the `ERPNEXT_API_KEY` and
   `ERPNEXT_API_SECRET` entries in `risitex-v2/.env`.

---

## 5. Seed the canonical mappings

After both sides have URLs + secrets configured, restart the
Medusa backend:

```powershell
# Stop existing backend if running
Get-NetTCPConnection -State Listen -LocalPort 9000 |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
cd D:\Users\KillerKoli\Desktop\risitex-v2
pnpm dev
```

Then ping ERPNext from the Medusa admin to confirm connectivity:

- Open `http://localhost:9000/app` (Medusa admin).
- Navigate to **ERPNext** in the sidebar.
- Click the **Settings** tab → Ping button → expect 200 OK.
- Click the **Mappings** tab → **"Seed canonical mappings"** button.

That seeds the 7 RISITEX canonical mapping rows (Customer,
Product Variant, Order→Sales Order, Order→Sales Invoice, Wallet
Settlement, Delivery Note←Fulfillment, Inventory←Bin). The
operator can edit per-field direction afterwards via the same UI.

---

## 6. Wire the inbound Frappe webhooks

Frappe-side outbound (Delivery Note submit → Medusa shipment, etc.)
is wired automatically by `risitex_erp/hooks.py`. The
**Medusa-side inbound** Frappe Webhook rows (Customer.on_update →
Medusa) get seeded by the plugin's auto-seeder on first connect:

- In the Medusa admin's ERPNext tab → **Settings** → click
  **"Seed Frappe Webhooks"**.

That creates Frappe Webhook rows in Desk that POST to
`http://localhost:9000/webhooks/erpnext-inbound` on every Customer
/ Item / Bin change.

---

## 7. Verify end-to-end

Smoke a single customer push from Medusa:

1. In the Medusa admin, find any existing customer (or create one
   via the storefront).
2. Edit the customer's first name + save.
3. The push subscriber fires `customer.updated`; check the **Events**
   tab in the ERPNext admin view — there should be a green
   `success` row within a few seconds.
4. In Frappe Desk, open the matching Customer record — the
   `customer_name` should now show the updated value.

If the row stays `pending` or shows `failed`:

- Click into it; the **last_error** field will say why.
- Common causes: wrong `ERPNEXT_URL`, wrong webhook secret, or
  India Compliance app not installed (so `gstin` field doesn't exist
  on Customer doctype).

---

## 8. Production deploy notes

When you move to prod:

- Generate a fresh 32+ char webhook secret. Don't reuse the dev
  one.
- Set `medusa_url` in `site_config.json` to the public Medusa URL
  (e.g. `https://api.risitex.com`).
- Update `ERPNEXT_URL` on the Medusa side to point at the public
  ERPNext URL (e.g. `https://erp.risitex.com`).
- Use HTTPS on both endpoints. The webhook secret protects against
  body tampering but doesn't encrypt the body — TLS does.

---

## ACTION REQUIRED FROM OWNER (summary)

Five things only you can do — nothing in this list can be done by
the implementation team without a credential or decision:

| # | Action | Why |
|---|---|---|
| 1 | Run `bench install-app erpnext + hrms + risitex_erp` on `site1.local` | I don't have sudo in the WSL session |
| 2 | Decide whether to install the **India Compliance** app | The canonical Customer mapping references `gstin` + `pan` custom fields that come from this app |
| 3 | Generate the shared **webhook secret** (32+ chars) | Goes in both `site_config.json` and `risitex-v2/.env`; treat as a secret |
| 4 | Issue a Frappe API Key + Secret for the `medusa-sync` user | Required for the Medusa-side pull jobs |
| 5 | Decide GL account mapping for Wallet Settlement | The Journal Entry needs explicit Cash / Wallet / Settlement accounts — pick a chart-of-accounts pattern then drop into `risitex_erp.medusa.wallet_settlement.run_daily_batch` |

Items 4 + 5 unblock the daily wallet-settlement batch and the
on-demand pull jobs. Items 1–3 unblock everything.

---

## Appendix — Gotchas we actually hit during live bring-up

Recorded 2026-06-17 so a redeploy (or a fresh dev machine) doesn't
re-discover these the hard way.

### 1. `risitex_erp` won't install — `No module named 'risitex_erp'`

The scaffolded app dir existed but the package wasn't registered in
the bench env. Fix:

```bash
cd ~/frappe-bench
./env/bin/pip install -e apps/risitex_erp
printf 'frappe\nerpnext\nhrms\nrisitex_erp\n' > sites/apps.txt   # clean, one app per line
```

NB: `echo "risitex_erp" >> sites/apps.txt` corrupted apps.txt the
first time (no trailing newline on the previous line joined two app
names → `erpnextrisitex_erp`). Always rewrite the whole file.

### 2. Install "succeeds" but doctypes aren't in the DB

The Custom Field fixtures threw a `KeyError: 'name'` mid-install,
which rolled back the doctype creation but still marked the app
installed. Two scaffolder bugs were fixed: the `medusa/` subpackage
was one dir too deep, and the fixture rows needed an explicit
`name` (`<DocType>-<fieldname>`). If doctypes are missing after
install, force-load them + sync fixtures:

```python
# bench --site site1.local console < this.py
import frappe
for d in ["risitex_customer_tier","risitex_affiliate_partner",
          "risitex_commission_ledger","risitex_wallet_settlement",
          "risitex_matrix_cell","risitex_matrix_order",
          "risitex_erp_sync_log"]:
    frappe.reload_doc("risitex_erp","doctype",d)
from frappe.utils.fixtures import sync_fixtures
sync_fixtures("risitex_erp")
frappe.db.commit()
```

### 3. Redis not running → install fails with `Connection refused :11000`

Frappe needs its two redis instances (queue :11000, cache :13000).
Start the bench services before any install:

```bash
cd ~/frappe-bench && nohup bench start > logs/bench-start.log 2>&1 &
```

### 4. `bench restart` does nothing under `bench start`

`bench restart` only works under supervisor. When you run the bench
via `bench start` in a shell, restart it by killing + relaunching:

```bash
pkill -f "bench start"; pkill -f honcho; pkill -f gunicorn; pkill -f "frappe.app"
sleep 3
nohup bench start > logs/bench-start.log 2>&1 &
```

### 5. site_config.json corrupted → `Expecting value: line 1 column 1`

A stray paste put a shell command at the top of the file. If the
site won't init, validate + rewrite it. The DB credentials
(`db_name`, `db_password`, `db_user`) MUST be preserved — copy them
from a backup or the error-free version. Then add:

```json
"medusa_url": "http://localhost:9000",
"medusa_webhook_secret": "<your-secret>"
```

### 6. Windows ↔ WSL2 networking — Medusa can't reach Frappe on localhost

WSL2 (non-mirrored mode) doesn't forward `localhost:8000` from
Windows. Use the WSL IP in `ERPNEXT_URL`:

```bash
wsl hostname -I    # e.g. 172.26.59.188
```

`ERPNEXT_URL=http://172.26.59.188:8000` in `risitex-v2/.env`. **This
IP changes on WSL restart** — re-check and update if the ping fails
after a reboot. (Permanent fix: enable WSL2 mirrored networking in
`.wslconfig`, then `localhost` works both ways.)

### 7. Port 9000 EACCES after Docker restart (Hyper-V dynamic exclusion)

When Docker Desktop restarts, Windows reserves a dynamic port range
(saw 8910-9009) that captures Medusa's port 9000 → `EACCES listen`.
Free it from an **elevated** terminal:

```powershell
net stop winnat
net start winnat
```

Docker reattaches its NAT automatically. Verify with
`netsh interface ipv4 show excludedportrange protocol=tcp`.

### 8. Mapping edits don't take effect — plugin loads a compiled build

`packages/medusa-plugin-erpnext` is a workspace package loaded from
its compiled `.medusa/server` output, AND pnpm hard-copies it into
the `.pnpm` store. After editing the plugin source you must:

```bash
cd packages/medusa-plugin-erpnext && ../../node_modules/.bin/medusa plugin:build
# then sync the rebuilt build into the pnpm store copy:
PNPM_COPY="node_modules/.pnpm/@polemarch+medusa-plugin-erpnext@file+...*/node_modules/@polemarch/medusa-plugin-erpnext"
rm -rf "$PNPM_COPY/.medusa/server" && cp -r packages/medusa-plugin-erpnext/.medusa/server "$PNPM_COPY/.medusa/server"
```

then restart the Medusa backend. (A `pnpm install` also refreshes
the file: dep but re-freezes the build, so the explicit copy is
faster during iteration.)

### 9. ERPNext writes 403 — System Manager isn't enough

ERPNext layers its own role permissions on top of Frappe's System
Manager. The `medusa-sync` API user needs ERPNext business roles to
write Customer / Sales Order / Item / etc. Roles added:

- Sales Manager, Sales User
- Accounts Manager, Accounts User
- Stock Manager, Item Manager

Add them on the User record in Desk (Roles section) or via
`frappe.get_doc("User", email).append("roles", {"role": ...})`.

### 10. Re-seeding mappings

A one-off ops script lives at `src/scripts/erpnext-ping-seed.ts`. It
pings ERPNext and (re)seeds the canonical mappings server-side, no
admin auth needed:

```bash
pnpm exec medusa exec ./src/scripts/erpnext-ping-seed.ts
```

If you ever need a clean reseed, truncate the mapping table first:

```bash
docker exec risitex-postgres psql -U risitex -d risitex_v2 -c "DELETE FROM erpnext_mapping;"
```
