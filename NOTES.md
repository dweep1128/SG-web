# NOTES — live BUSY sync, merged storefront, admin portal (2026-09-30)

Branch `chore/handover-audit`. Everything below was built on what was already here (BUSY sync, SK-image portal,
`catalog_view`), not rebuilt. README / HANDOVER / STAFF-GUIDE describe the older 15–30 min Web Service sync; **this
file supersedes them where they differ** (sync transport, schedule, roles).

## What was built

### 1. Live BUSY sync (`scripts/busy-sync/`)
- **Transport is now the read-only SQL login** (`webapp_readonly`) via `sql.mjs`, not the BUSY Web Service. Three locks:
  the login (db_datareader only), `assertReadOnly` on every statement, read-only connection intent. Bonus: SQL works
  when the BUSY *app* is closed, as long as the shop PC and SQL Server are on.
- **Company guard every run** (start, and again before saving): `DB_NAME()` must equal `BUSY_EXPECTED_DB` exactly →
  otherwise `WRONG_DATABASE` (Comp0001 is refused). If BUSY has a *later* financial year DB of the same company, the
  run stops with `NEW_FY_DETECTED` instead of silently syncing a frozen old year.
- **`delta` job (every 60 s):** pulls Code+Stamp+price for all items (one cheap query) and re-pulls only items whose
  Stamp or price changed; pulls stock and pushes only rows whose quantity changed. A no-change run writes nothing.
- **`full` job (nightly):** re-pulls every item, pushes every stock row. Safety net.
- Upsert only, never delete (items gone from BUSY are flagged `missing_from_busy`). A failed run writes nothing; the
  site keeps the last good data. Existing checks kept: schema fingerprint, sanity limits, cost-column block.
- **last_synced_at:** global = `sync_status.last_ok_at` (every item confirmed at that moment); per item =
  `busy_items.last_synced_at` (last time the sync wrote that row; the nightly full touches all).
- `sync_runs` only gets a row when a run changed data, was a full run, or the status flipped — not 1,440 rows/day.
- **`server.mjs`** — tiny HTTP runner n8n calls: `POST /run/delta|full`, bearer token, one run at a time (409 if busy),
  binds 127.0.0.1 by default. Response includes `status`, `error`, `status_changed`.
- **`/api/sync-status`** on the website: `{ status, last_success_at, last_change_at, last_run_at, age_seconds, stale }`
  (no error text — it's public).
- **n8n workflow** `n8n/busy-sync-workflow.json`: 60 s schedule → runner; nightly 20:30 IST full; every 5 min stale
  check (no success for 10 min); one "Alert needed?" node that alerts only when a problem starts/changes (plus an
  "OK again" note), optional quiet hours; email or webhook (WhatsApp) chosen by `ALERT_CHANNEL`.

### 2. Website
- One merged catalog (`catalog_view`): BUSY items + portal items. Portal source is stored as `manual` in the DB
  (existing Cloudinary folders and `/parts/m<id>` URLs depend on it) and labelled **Portal** everywhere in the UI.
- Shows `display_name` when set (BUSY and portal), admin description, hides hidden items.
- Stock labels: In stock / Low stock / **Out of stock** (new) / Check availability (stock not verified yet). No
  quantities shown (unchanged design).
- **"Stock updated at 3:42 pm"** on the listing, search and BUSY product pages; checks `/api/sync-status` every 30 s
  while the tab is visible and re-renders (`router.refresh`, no reload) only when a sync actually changed data. (30 s,
  not 60, so the page adds at most 30 s on top of the 60 s sync; the check is a one-row read. `LIVE_REFRESH_SECONDS`.)
  "· data may be out of date" after 15 min without a successful sync.
- Catalog cache is keyed by `last_change_at`, so a BUSY change is visible on the next render (was a 5-min cache).
- Existing: search, categories, Cloudinary gallery, placeholders for no photo, SEO/sitemap, mobile-first.

### 3. Admin portal (`/sk-image`, `/admin` redirects there)
- Supabase Auth (bcrypt-hashed passwords, server-side session cookies, Supabase's per-IP sign-in rate limit).
- **Roles** `owner` / `staff` in `app_metadata.role` (only the service role can set it). Logins without a role get
  nothing (middleware, API routes and RLS all check). Owner-only: permanent delete of portal products.
- Product list: search + three filters (source, visible/hidden, missing photo); hidden items included.
- BUSY items: edit **only** display name, description, visibility, photos. Price/stock shown read-only. Enforced by
  column-level grants in the DB, not just the UI.
- Portal products: name, display name, SKU, category, price, stock count or in-stock switch, description, photos,
  hide/unhide.
- Photos: existing SK-image flow reused — signed direct browser→Cloudinary upload, in-browser camera (nothing saved on
  the phone), native camera fallback.

### New / changed files
`supabase/live-sync-admin.sql` (migration) · `scripts/busy-sync/{sql,server}.mjs` + changes to `busy/index/store/mapping/check.mjs`
· `scripts/admin-user.mjs` · `scripts/local/{seed,fake-busy}.mjs` · `n8n/busy-sync-workflow.json`
· `src/app/api/sync-status/route.ts` · `src/components/stock-{freshness,updated}.tsx` · portal pages/components.

## Env vars
Full list with comments in `.env.example`.

| Where | Vars |
|---|---|
| Vercel (site) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ALLOW_INDEXING` — **nothing new** |
| Sync server `.env` | `BUSY_SQL_SERVER` (shop PC's Tailscale IP), `BUSY_SQL_PORT`, `BUSY_SQL_DATABASE=BusyComp0003_db12026`, `BUSY_SQL_READONLY_USER=webapp_readonly`, `BUSY_SQL_READONLY_PASSWORD`, `BUSY_SQL_ENCRYPT`, `BUSY_EXPECTED_DB=BusyComp0003_db12026`, `PRICE_VERIFIED`, `STOCK_VERIFIED`, `ALLOW_LIVE_WRITE=true`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_RUNNER_TOKEN`, `SYNC_RUNNER_PORT`, `SYNC_RUNNER_HOST`, optional `HEALTHCHECK_URL` |
| n8n | `SYNC_RUNNER_URL`, `SYNC_RUNNER_TOKEN`, `SITE_URL`, `ALERT_CHANNEL` (`webhook`\|`email`), `ALERT_WEBHOOK_URL` or `ALERT_EMAIL_FROM`+`ALERT_EMAIL_TO`, optional `STALE_ALERT_MINUTES` (10), `ALERT_QUIET_HOURS` (e.g. `21-9`), `ALERT_REPEAT_MINUTES` (0 = only on change), **`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`** (n8n 2.x blocks `$env` by default), `GENERIC_TIMEZONE=Asia/Kolkata` |

## Deploy — in this order
1. **Give existing portal logins a role first** (the migration locks out logins without one):
   `node scripts/admin-user.mjs owner@… owner` and `… staff@… staff` (run where `.env` has the service key), or the SQL
   at the top of `supabase/live-sync-admin.sql`.
2. Export `busy_items`, `products_manual`, `product_media` as CSV (Free plan has no backups), then run
   `supabase/handover-audit.sql` (if not yet), **`live-sync-admin.sql`**, **`display-name.sql`**, **`stock-status-only.sql`** (in that order) in Supabase → SQL Editor. See docs/PRE-DEPLOY-REPORT.md.
3. Merge to `main` → Vercel deploys. No new Vercel env vars.
4. Sync server (the cloud box with n8n, on the tailnet): `git clone`, `npm ci --omit=dev`, create `.env` (above),
   then `npm run sync:full -- --dry-run` → check `local-data/` → `npm run sync:full -- --live` once.
5. Keep the runner up: e.g. systemd `ExecStart=/usr/bin/node scripts/busy-sync/server.mjs`, `Restart=always`,
   `WorkingDirectory=<repo>` (or `pm2 start scripts/busy-sync/server.mjs --name sk-sync`). Check `curl localhost:8787/health`.
6. n8n: set the env vars, import the workflow (below), publish/activate it.
7. Remove the old Windows Task Scheduler jobs (HANDOVER §8) if they were ever created — two syncs would just race.

## Import the n8n workflow
- **UI:** Workflows → ⋯ → Import from File → `n8n/busy-sync-workflow.json` → (if `ALERT_CHANNEL=email`) open
  "Send alert email" and pick your SMTP credential → Publish/Activate.
- **CLI (Docker):** `n8n import:workflow --input=busy-sync-workflow.json` then `n8n publish:workflow --id=skBusyLiveSync01`
  and restart n8n.
- If n8n runs in Docker, `SYNC_RUNNER_URL` must reach the host: run the runner with `SYNC_RUNNER_HOST=172.17.0.1`
  (docker bridge) and use `http://172.17.0.1:8787`, or run n8n with `--network host` and keep 127.0.0.1.
- WhatsApp: any gateway that takes a URL works. For CallMeBot put `{text}` in the URL, e.g.
  `https://api.callmebot.com/whatsapp.php?phone=91XXXXXXXXXX&apikey=KEY&text={text}` (GET). Anything without `{text}`
  gets `POST {"text": "..."}` (Slack/Discord/Twilio-relay/another n8n webhook).
- Alert state (what was already sent) only persists for the active workflow, not manual "Test workflow" runs.

## Things you must do by hand
- **Shop PC:** SQL Server must accept TCP on 1433 (SQL Server Configuration Manager → TCP/IP enabled, SQL auth on), and
  Windows Firewall must allow 1433 **from the Tailscale interface only**. Create/confirm the `webapp_readonly` login
  with `db_datareader` on `BusyComp0003_db12026` only (no other roles, no other DBs needed). Tailscale installed and
  logged in, set to start at boot; disable key expiry for that machine in the Tailscale admin.
- **Cloud server:** Tailscale joined to the same tailnet; the runner and n8n on it. Consider a Tailscale ACL that only
  lets this server reach the shop PC on 1433.
- **Secrets:** `SYNC_RUNNER_TOKEN` (`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`),
  the SQL password, the Supabase service key — only on the sync server. Nothing new on Vercel.
- **Supabase dashboard:** Auth → Sign In / Providers → *Allow new users to sign up* **OFF** (AUDIT #2). Auth → Rate
  Limits → set sign-ins to ~10 per 5 min per IP (this is the login rate limit; the login goes straight to Supabase).
- **Financial year change (April):** the sync will stop with `NEW_FY_DETECTED` once BUSY creates `…_db12027`. Update
  `BUSY_SQL_DATABASE` and `BUSY_EXPECTED_DB` together, dry-run, restart the runner.
- **Schema baseline:** the committed `busy-schema-baseline.json` was taken through the Web Service. SQL returns the same
  `INFORMATION_SCHEMA` rows, so it should match; if the first SQL run says `SCHEMA_CHANGED`, compare
  `local-data/busy-schema-observed.json` with the real BUSY and update the baseline (don't bypass).
- **Stamp column** is still unconfirmed as an edit counter; the delta also compares price, and the nightly full catches
  anything else (e.g. a renamed item whose Stamp didn't move) within a day.
- Domain + `NEXT_PUBLIC_SITE_URL`, WhatsApp number, `PRICE_VERIFIED`/`STOCK_VERIFIED` after checking against the BUSY
  screen — unchanged from HANDOVER.

## Decisions / assumptions (safest option picked)
- Portal source stays `manual` in the DB, "Portal" in the UI (renaming would orphan existing Cloudinary photos).
- Hide for portal products = existing `is_active`; for BUSY items = new `busy_items.hidden` (sync never writes it).
  The sync's own exclusion list (`catalog-exclusions.json`) and `src/lib/hidden-items.ts` still apply on top.
- Admin portal stays at `/sk-image` (staff already use it); `/admin` redirects.
- Out-of-stock is now shown as such (was "Check availability"). Negative BUSY stock counts as out of stock.
- Login rate limiting relies on Supabase Auth's server-side limit (an app-level limiter could be bypassed by calling
  Supabase directly with the public key).
- n8n alerts only on state changes by default (the PC is off at night; a per-minute alert would be spam).
- `mssql` moved from devDependencies to dependencies (the sync server needs it with `npm ci --omit=dev`).

## Local testing (no production data touched)
Needs Docker. Everything local lives in gitignored `local-data/`.
```
npx supabase init && npx supabase start           # any empty folder; note API URL + service key
docker run -d --name skbusy-sql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=<pw> -p 14330:1433 mcr.microsoft.com/mssql/server:2022-latest
# local-data/local-test.env: SUPABASE_URL/keys (local), BUSY_SQL_SERVER=127.0.0.1, BUSY_SQL_PORT=14330, FAKE_BUSY_SA_PASSWORD,
#   BUSY_SCHEMA_BASELINE=local-data/fake-busy-schema-baseline.json, LOCAL_DB_CONTAINER, LOCAL_TEST_PASSWORD, ALLOW_LIVE_WRITE=true …
set -a; source local-data/local-test.env; set +a
npm run local:seed          # schema + owner/staff/no-role logins + 2 portal products (refuses non-localhost URLs)
npm run local:busy setup    # fake BUSY: Comp0003 (right) + Comp0001 (decoy) + webapp_readonly
npm run build && npx next start & npm run sync:server &
npm run local:busy sell 1001 12     # a sale in "BUSY" → watch /parts
```

## Test results (local, 2026-09-30)
Stack: local Supabase (Docker), fake BUSY on SQL Server 2022 (Docker), `next build && next start`, the runner, and
**n8n 2.41 in Docker running the imported workflow** (so every sync below was triggered by n8n every 60 s). Browser
checks ran in headless Chrome at 390×844 (26/26 pass, no browser console errors).
- `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run sync:check`, `npm run check:search`: all pass.
- Full sync over the SQL login → 6 items + stock written; delta with no change → 0 writes, no log row.
- **Fake BUSY change appears on the site without a reload:** a sale in fake BUSY showed on an open `/parts` page in
  **59 s** (twice). On an open product page it took **120 s**: product pages are ISR-cached for 30 s, so the first
  refresh can still get the old copy. Worst case ≈ 60 s (sync) + 30 s (poll) + ISR; typical listing ≈ 30–60 s.
- **n8n alerts** (webhook to a local catcher): runner down → `RUNNER_UNREACHABLE`; BUSY down → `BUSY_UNREACHABLE`;
  last success 20 min old → stale-data alert; each sent **once**, then "OK again" for both checks when BUSY returned.
  Meanwhile the site kept the last data and showed "· data may be out of date".
- **Portal product appears** (`Rear-view mirror set (pair)`, display name used); **hidden portal product absent** from
  listing and `catalog_view`.
- **Wrong company refused:** `BUSY_SQL_DATABASE=BusyComp0001_db12026` → `WRONG_DATABASE`, nothing written, logged once
  (repeat failures not re-logged). Later-FY DB present → `NEW_FY_DETECTED`. BUSY unreachable → `BUSY_UNREACHABLE`, old
  data kept.
- **Admin routes blocked when signed out:** `/sk-image`, `/add`, `/p/…` → 307 to login; all `/api/sk-image/*` → 401;
  runner without/with wrong token → 401.
- RLS probes: anon can't read `busy_items`/`admin_catalog`; a login with no role sees nothing; staff can change
  display name/description/hidden but price/stock updates fail (42501); staff delete of a portal product is a no-op,
  owner's works.
- Portal at 390 px: login gate, no-role login refused with a message, staff list with hidden items + badges, filters
  (portal+hidden, BUSY+missing photo), BUSY item price read-only, hide → gone from site + 404, unhide with display name,
  staff has no Delete and the delete API returns 403.

**Not tested here:** real Cloudinary uploads/camera (no Cloudinary keys locally; that SK-image code is unchanged and was
tested in the earlier audit), the email alert branch (needs SMTP), and the real BUSY SQL Server / Tailscale path.
