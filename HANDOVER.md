# Handover

Everything the new owner needs to run, pay for and repair the S.K. Traders parts site. Values (passwords, keys) are
never written here — only where they live. Items marked **CONFIRM** were not visible from the code and must be filled in
by the person handing over.

## 1. Accounts and services

| Service | What it does | Who should own it | Cost / free-tier limits (verify current pricing) |
|---|---|---|---|
| **Vercel** (team "dweep's projects", project `sg-web`) | Hosts the website + SK-image; builds on every push to GitHub | Business owner's account; developer invited as member | Currently **Hobby (free)**. Hobby is for **non-commercial** use only — a business site should be on **Pro (~US$20/user/month)**. |
| **Supabase** (one project) | Database (products, photos list, sync log), staff logins | Business owner (org owner), developer as member | Free: 500 MB DB, 50k monthly users, 5 GB egress, **no backups**, project pauses after ~7 days with no traffic. Pro ~US$25/month adds daily backups. |
| **Cloudinary** | Stores and resizes product photos | Business owner | Free: 25 credits/month (1 credit ≈ 1 GB storage or 1 GB bandwidth or 1,000 transformations), 10 MB max image upload. |
| **GitHub** (`dweep1128/SG-web`) | Source code; pushes trigger Vercel deploys | Transfer the repo to the business owner's account/org | Free |
| **Domain** | Public web address | Business owner | **CONFIRM** — none connected yet; site runs on `sg-web-bice.vercel.app`. A `.in` domain is ~₹700–1,000/year. |
| **BUSY** (desktop billing software on the shop PC) | Source of items, prices, stock. Its built-in Web Service (port 981) is what the sync reads | Business owner (existing licence) | Existing BUSY licence |
| **Sync machine / server** | Runs `scripts/busy-sync` on a schedule; must reach BUSY on the LAN | Business owner | **CONFIRM** which PC/server and its OS. |
| **Tailscale** | Private network so a remote machine can reach BUSY/SQL Server without opening ports | Business owner | Personal plan free (3 users). **CONFIRM** whether it is in use. |
| **n8n** | Automation/scheduling | Business owner | **CONFIRM** whether it is in use and what it runs. Self-hosted is free; n8n Cloud is paid. Nothing in this repo depends on it. |
| **Healthchecks.io** (recommended) | Emails you when the sync stops pinging | Business owner | Free (20 checks) |

## 2. Environment variables

**Website (Vercel → Project → Settings → Environment Variables, Production + Preview)**

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Public Supabase key. Either name works; the publishable one wins |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Shop WhatsApp number, digits with country code (`91…`). Empty = WhatsApp buttons disabled |
| `NEXT_PUBLIC_SITE_URL` | Public address for canonical URLs/sitemap, e.g. `https://www.example.in`. Optional |
| `NEXT_PUBLIC_ALLOW_INDEXING` | `true` lets Google index the site. Anything else = hidden from search engines |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (SK-image uploads + image URLs) |
| `CLOUDINARY_API_KEY` | Cloudinary API key — server only |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret — server only, **never** `NEXT_PUBLIC_` |

Set automatically by Vercel: `VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`.

**Sync machine (`.env` in the repo folder on that machine)**

| Name | Purpose |
|---|---|
| `BUSY_HOST`, `BUSY_PORT` | Where the BUSY Web Service listens (port 981 by default) |
| `BUSY_USERNAME`, `BUSY_PASSWORD` | BUSY user the Web Service accepts |
| `BUSY_EXPECTED_DB` | Exact BUSY company database, e.g. `BusyComp0003_db12026` (S.K. TRADERS, FY suffix). Sync refuses any other |
| `PRICE_VERIFIED`, `STOCK_VERIFIED` | `true` shows BUSY prices / stock on the site. Anything else hides them |
| `ALLOW_LIVE_WRITE` | Must be `true` (plus the `--live` flag) for the sync to write. Keep `false` on every other computer |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Where the sync writes. The service-role key bypasses all security — this machine only |
| `HEALTHCHECK_URL` | Optional URL pinged after each successful run (e.g. Healthchecks.io) |
| `SYNC_DATA_DIR` | Folder for dry-run output and logs (default `local-data`) |
| `BUSY_SQL_*` | Only for the one-off `scripts/busy-sql/discover.mjs` (read-only SQL login). Not used by the sync |

## 3. Database setup (Supabase → SQL Editor)

Run order. ✅ = already applied on the live project (checked 2026-09-28).

1. ✅ `supabase/schema.sql` + `finish-setup.sql` — legacy demo tables (see AUDIT.md: recommended cleanup)
2. ✅ `supabase/busy-sync.sql` — `busy_items`, `sync_runs`, stock RPC
3. ✅ `supabase/busy-catalog-list.sql` — `public_catalog_list()`
4. ✅ `supabase/sk-image.sql` — `products_manual`, `product_media`, `catalog_view`
5. ⬜ **`supabase/handover-audit.sql`** — photo-folder safety check + `sync_health()` (shows sync status in SK-image)
6. ⛔ `supabase/photo-identification.sql` — legacy, not used by the site; do **not** run

## 4. SK-image staff users

**First, once:** Supabase → Authentication → Sign In / Providers → turn **off** "Allow new users to sign up".
(It is currently **on** — see AUDIT.md #2.)

**Add a staff member**
1. Supabase → Authentication → Users → **Add user** → **Create new user**.
2. Enter their email and a strong password; tick **Auto Confirm User**.
3. Send them the site address + `/sk-image` and their password (in person or by phone, not in a group chat).

**Remove a staff member:** Authentication → Users → find the email → ⋯ → **Delete user**. A phone that is already
logged in keeps working until its login token expires (up to about an hour), then is logged out.

**Reset a password:** Users → ⋯ → **Send password recovery**, or delete and re-create the user.

## 5. Rotating keys

Do one at a time; after each, open the site and SK-image to check.

| Key | Steps |
|---|---|
| Supabase publishable key | Supabase → Settings → API Keys → create a new publishable key → paste into Vercel `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and `NEXT_PUBLIC_SUPABASE_ANON_KEY` if set) → Redeploy → delete the old key. |
| Supabase service-role / secret key | Supabase → Settings → API Keys → create a new **secret** key → put it in the sync machine's `.env` as `SUPABASE_SERVICE_ROLE_KEY` → run `npm run sync:stock -- --live` once → revoke the old key. (Also remove it from Vercel — the site never uses it; AUDIT.md #6.) If the project still uses the legacy JWT `service_role` key, rotating means rotating the JWT secret, which logs every staff user out. |
| Cloudinary API key/secret | Cloudinary → Settings → API Keys → **Generate new API key** → update `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` in Vercel → Redeploy → test one upload → delete the old key. |
| BUSY Web Service user | In BUSY, change the password of the user used by the sync → update `BUSY_PASSWORD` on the sync machine → run a dry run: `npm run sync:stock -- --dry-run`. |
| BUSY SQL read-only login | SQL Server Management Studio → Security → Logins → change password → update `BUSY_SQL_READONLY_PASSWORD` where the discovery script runs. |
| Staff passwords | See §4. |

## 6. Deploying

- **Normal deploy:** merge/push to `main` on GitHub → Vercel builds and publishes automatically (~1 minute).
- **Preview:** any other branch gets its own preview URL (Vercel → Deployments). Previews are behind Vercel login.
- **Redeploy without code changes** (e.g. after changing an env var): Vercel → Deployments → latest Production → ⋯ →
  **Redeploy**. Env var changes only take effect after a redeploy.
- **Before merging a branch that adds SQL:** run its SQL file first (§3), then merge.

## 7. Undoing a bad deploy

1. Vercel → Deployments → pick the last deployment that worked (Production, Ready) → ⋯ → **Instant Rollback** /
   **Promote to Production**. Takes seconds; no rebuild.
2. Then fix the code: `git revert <bad commit>` → push to `main`.
3. Database changes are **not** rolled back by this. On the Free plan there are no automatic backups — export important
   tables (Table editor → Export CSV) before running new SQL, or upgrade to Pro for daily backups.

## 8. BUSY sync

**It is not scheduled today.** The last run was 2026-09-22 (3 runs in total), so stock and prices on the site are
frozen at that date. Set up the schedule on the machine that can reach BUSY:

```bat
:: Windows Task Scheduler, from an Administrator command prompt. Replace C:\SG-web with the repo folder.
schtasks /Create /TN "SK sync stock" /SC MINUTE /MO 15 /ST 09:00 /TR "cmd /c cd /d C:\SG-web && npm run sync:stock -- --live >> local-data\sync.log 2>&1"
schtasks /Create /TN "SK sync items" /SC MINUTE /MO 30 /ST 09:07 /TR "cmd /c cd /d C:\SG-web && npm run sync:items -- --live >> local-data\sync.log 2>&1"
schtasks /Create /TN "SK sync full"  /SC DAILY       /ST 20:30 /TR "cmd /c cd /d C:\SG-web && npm run sync:full -- --live >> local-data\sync.log 2>&1"
```

- `stock` = quantities (every 15 min). `items` = names/prices/new items, only changed ones (every 30 min).
  `full` = re-reads every item (daily). Start times are staggered so runs don't overlap.
- **BUSY must be open with the company loaded** for any run to work (the Web Service lives inside the BUSY app). Schedule
  `full` while the shop PC is on — not at 2 a.m. if BUSY is closed at night.
- Set `HEALTHCHECK_URL` to a Healthchecks.io check (period 30 min, grace 30 min) to get an email when syncs stop.

**Is it working?** SK-image home shows "BUSY stock & prices: updated N minutes ago" (after running
`supabase/handover-audit.sql`), with a "Sync is late" badge past 2 hours. Details: Supabase → Table editor →
`sync_runs`, newest first. Product pages also show "Updated … ago" under Stock.

**If a run fails** (`status` in `sync_runs`). A failed run never writes partial data; the site keeps showing the last good data.

| Status | Meaning | Fix |
|---|---|---|
| `BUSY_CLOSED` | BUSY is running but no company is open | Open S.K. TRADERS in BUSY |
| `BUSY_UNREACHABLE` | Can't reach BUSY (PC off, network, Tailscale down) | Turn on the PC / check network; next run retries |
| `WRONG_DATABASE` | BUSY has a different company open | Open S.K. TRADERS (Comp0003) |
| `NEW_FY_DETECTED` | BUSY moved to a new financial year | Update `BUSY_EXPECTED_DB` to the new DB name (e.g. `…_db12027`), run `npm run sync:full -- --dry-run`, check `local-data`, then `--live` |
| `SCHEMA_CHANGED` | BUSY update changed its tables | Developer: compare `local-data/busy-schema-observed.json`, re-verify `scripts/busy-sync/mapping.mjs`, then update the baseline. Don't bypass |
| `SANITY_FAILED` | Pull looked wrong (active items fell > 10%, many zero prices) | Check BUSY data; if the change is real, run once with a developer |
| `PARSE_FAILED` / `BUSY_QUERY_FAILED` | Odd response from BUSY | Usually transient; if repeated, developer |
| `CONFIG_ERROR` | Missing/wrong `.env` value | Read the error text; fix `.env` |

**If BUSY changes** (upgrade, new company, new PC): update `BUSY_HOST`/`BUSY_PORT`/`BUSY_EXPECTED_DB`, run
`npm run sync:check` (offline self-test), then a `--dry-run`, then `--live`.

## 9. Everyday checks

- Weekly: SK-image home sync line is green; Vercel → Deployments has no failed production builds.
- Monthly: Cloudinary → Dashboard credit usage; Supabase → Usage.
- After any BUSY update: watch the next sync run.
