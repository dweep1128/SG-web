# Pre-deploy report — 2026-10-06

Branch `chore/handover-audit` (uncommitted working tree). Nothing deployed, no live data changed. The live Supabase was
only *read* with the public key, the same way any visitor could. Everything below was tested against a local stack:
local Supabase and fake BUSY in Docker, `next build` + `next start`, real sync runs.

Risks already decided in AUDIT.md / NOTES.md aren't listed again: CSP `unsafe-inline`, the login rate limit coming
from Supabase, `postcss`/`sharp` waiting on Next 16, npm-cache git history, "Portal" vs `manual`, BUSY code shown
as the item code, and n8n alerting only on change.

## 1. Audit (state before this session → now)

| Feature | Before | Now | Files |
|---|---|---|---|
| BUSY sync (read-only SQL, delta 60 s, full nightly, upsert-only) | done | done | `scripts/busy-sync/*`, `n8n/busy-sync-workflow.json` |
| Company guard Comp0003 | partial: the sync followed `BUSY_EXPECTED_DB`, so an env var naming Comp0001 would have synced Comp0001 | done: pinned in code, any other company → `WRONG_DATABASE` | `scripts/busy-sync/busy.mjs`, `check.mjs`, `index.mjs` |
| Admin portal product upload | done | done + "Same item as BUSY code" link | `src/components/sk-image/product-form.tsx`, `src/app/sk-image/(portal)/add/page.tsx` |
| SK-image camera → Cloudinary | done (direct signed upload, nothing written to the phone) | done + server-side cap on stored image size | `src/lib/cloudinary-server.ts`, `camera.tsx`, `photo-manager.tsx` |
| Display-name override | done (`display-name.sql`, not applied live) | done + a test proving the sync never sends staff columns | `supabase/display-name.sql`, `check.mjs` |
| Consultancy page | partial: built, not linked, showed "Placeholder" proof cards | done: in the header menu and footer, placeholders hidden, enquiries go to WhatsApp | `src/app/consultancy/*`, `categories-menu.tsx`, `site-footer.tsx` |
| Two-source catalog (BUSY + portal) | partial: both listed, no way to sum stock | done: a portal product can be linked to a BUSY item and its stock is added | `supabase/stock-status-only.sql` |
| Stock indicators | partial: labels only on the page, but **exact quantities readable by anyone** (see 4.1) | done: status computed in the DB, no quantity column reachable by anon | `stock-status-only.sql`, `src/lib/catalog.ts` |
| Auth (portal) | done (Supabase Auth, owner/staff roles, RLS, middleware + route re-check) | done + Secure cookies | `src/middleware.ts`, `src/lib/supabase*.ts` |
| Env handling | done (server-only secrets, sync secrets off Vercel by design) | done | `.env.example` |

## 2. What I fixed

1. **Stock never exposed as a number** (`supabase/stock-status-only.sql`, new migration):
   - `catalog_view` has no `stock` column now. It returns `stock_status` = `in_stock` / `low_stock` / `out_of_stock` / `ask`, computed in Postgres.
   - The threshold lives in one place, `public.stock_low_threshold()` = 10. The site's own `LOW_STOCK_THRESHOLD` is gone.
   - Rules:
     - At or below the threshold and above 0 → Low.
     - 0 or negative → Out.
     - BUSY stock not verified or never synced → Check availability.
     - Portal "in stock" switch with no count → In stock.
   - Revoked anon access to `public_catalog_list()` / `public_catalog_item()`, which both returned `stock_qty`.
   - Revoked anon SELECT on `products_manual`, `quote_*` and the legacy demo tables (`products.available_quantity`).
   - Revoked the legacy public `create_quote_request()` write.
   - Removed quantity tables from Realtime if any were published.
   - Verification queries are at the bottom of the file.
2. **Two-source stock:**
   - New column `products_manual.busy_code` (FK to `busy_items`). A linked portal product isn't listed separately, and its stock is added to the BUSY item's.
   - Negative BUSY stock counts as 0 in the sum. Hidden linked products don't count.
   - The portal form validates the code (an unknown code shows "No BUSY item has that code"), and the portal list shows the link.
3. **Site reads explicit columns** (`src/lib/catalog.ts`) instead of `select("*")`, so a column added to the view later can't reach pages by accident. It maps the DB status to a label, and an unknown status falls back to "Check availability".
4. **Sync company pin:** `EXPECTED_COMPANY_DB = /^BusyComp0003_db1\d{4}$/`.
   - An env var naming any other company → `WRONG_DATABASE` before any data query.
   - A failed run prints `*** SYNC FAILED: <status> <reason>` to stderr and exits with code 1.
   - New checks in `npm run sync:check`: the Comp0001-in-env case, and sync rows never carry `display_name` / `description` / `hidden`.
5. **Upload limits:**
   - The Cloudinary signature now also pins an incoming transformation `c_limit,w_1600,h_1600,q_auto`, so even a client that skips its own resize can't store a bigger image.
   - Formats (jpg/png/webp), folder, the 8-photo limit and staff auth were already enforced.
6. **Cookies / headers** (`next.config.ts`, `src/lib/supabase.ts`):
   - Auth cookies are `Secure` in production (they already had SameSite=Lax).
   - Added `Strict-Transport-Security: max-age=63072000`.
   - `X-Powered-By` removed; production source maps explicitly off.
7. **`/api/sync-status`:** `s-maxage=10` at the CDN. It was an uncached public function hitting the DB on every call; now it's at most one DB read per 10 s per region.
8. **Consultancy:**
   - Linked from the header "Categories" menu and the footer.
   - The proof section is hidden until `PROOF` has real entries, so it no longer shows "Placeholder 1/2" publicly.
9. **Deps:** `npm audit fix` without `--force` (lockfile only): `source-map-js` 1.2.1 → 1.2.2 (high), `tedious` 20.0.0 → 20.3.4.
10. **New checks:**
    - `npm run check:stock`: edge-case self-test.
    - `npm run check:stock -- --db --site=<url>`: every product, raw quantity → expected status vs `catalog_view` vs what the running site serves. It also confirms anon can't read any quantity.
    - `npm run check:leaks -- --site=<url>`: crawls pages + RSC payloads + sitemap + APIs + every JS chunk, and checks that `.map` files 404. It greps for quantity fields, "only N left" text, BUSY DB names / SQL logins, Supabase secret keys, Tailscale addresses, cost/supplier fields, and the actual secret values from `.env`. It never prints a matched secret.
11. `scripts/local/seed.mjs` now applies `display-name.sql` and `stock-status-only.sql`. NOTES.md deploy step 2 lists all four migrations in order.

### Verification (local, this session)
- `npx tsc --noEmit`, `npm run lint`, `npm run build`: 0 errors. `sync:check`, `check:search`, `check:stock`: pass.
- **Stock edge cases** in the real view:

  | Case | Status |
  |---|---|
  | 10 (= threshold) | Low |
  | 11 | In stock |
  | 0 | Out of stock |
  | −3 | Out of stock |
  | null | Check availability |
  | unverified | Check availability |
  | BUSY 4 + linked portal 8 | In stock |
  | BUSY 0 + linked "in stock" switch | In stock |

  `check:stock --db --site`: 8/8 products match the DB and the rendered site; anon can't read `catalog_view.stock`, the two RPCs, `busy_items`, `products_manual` or `products`.
- **Leak crawl** of the built site: 93 URLs, 29 JS chunks, 4.9 MB. No quantities, secrets or BUSY identifiers, and no source maps served. A negative control (a fake page with `"stock":7`, "only 3 left", `BusyComp0003`, a secret key, a `.map`) was caught on every rule.
- **Display name survives a sync:** set on BUSY 1001 → full live sync → still set in the DB, and shown on `/parts` and `/parts/1001`.
- **Wrong company:**
  - Env set to Comp0001 → `WRONG_DATABASE … is not S.K. TRADERS`.
  - Connection to Comp0001 with Comp0003 expected → `WRONG_DATABASE Connected to BusyComp0001…`.
  - In both cases nothing was written and the exit code was 1.
- **Portal:**
  - Signed out: pages → 307, all `/api/sk-image/*` → 401.
  - Cross-site POST → 403.
  - Login without a role → 307/401.
  - Staff: pages 200; permanent delete → 403 (owner only).
  - Staff can link a product; linking to an unknown BUSY code is refused (FK).
- **Git history:** the real service-role key and publishable key appear in 0 commits. Only `.env.example` is tracked. `.next/static` has no server env names (one hit is supabase-js's own `sb_secret_` prefix check).

## 3. Still open

| # | Item | Why it's open |
|---|---|---|
| O1 | Apply the migrations on live: `handover-audit.sql` (if not yet) → `live-sync-admin.sql` → `display-name.sql` → `stock-status-only.sql` | Changes the live DB. Live is still on the older view: no `display_name`, no `sync_status`. See 4.1 for ordering. |
| O2 | Real Cloudinary upload with the new signed `transformation` | No Cloudinary keys locally. The first real upload must succeed and the stored image must be ≤1600 px. |
| O3 | Native camera fallback (`<input capture>`) on staff phones | The in-browser camera keeps photos in memory only. Some Android OEM camera apps save their own copy to the gallery when the fallback is used. |
| O4 | Upload **bytes** limit | The 10 MB file cap is on the client; the stored size is capped server-side (fix 5). A hard byte cap needs a Cloudinary upload preset (dashboard) or the plan limit. |
| O5 | A linked portal product's own photos aren't shown | The site shows the BUSY item's photos. Upload photos on the BUSY item. |
| O6 | Real BUSY SQL / Tailscale path, n8n email branch | Unchanged from NOTES; needs the shop PC. |

## 4. Security findings by severity

### Critical
**4.1 Exact stock quantities are publicly readable on the LIVE database right now.** This was confirmed read-only with the public key:
- `catalog_view.stock` is non-null for 432 products.
- `public_catalog_item(1291)` returns its exact `stock_qty`.
- Legacy `products.available_quantity` is readable too.

The publishable key ships in every page, so anyone can do this.

**Fix:** `stock-status-only.sql` (written and verified locally, **not applied**).

**Ordering:** the current production site (old `main`) computes Low from the `stock` column. If you apply the migration before deploying this branch, production shows "Check availability" instead of "Low stock" for low items until the deploy. Nothing breaks.

**Stopgap available today with zero site impact:** run only the two `revoke execute … public_catalog_list/item` lines. Those RPCs aren't used by any site version.

### High
- **4.2 ✅ Sync could follow a mis-set env var to another company.** Fixed by the code pin (fix 4).
- **4.3 🟠 Confirm the Vercel project has no sync/BUSY secrets** (AUDIT #6, still unconfirmed). I can't see Vercel env here (no Vercel CLI). Expected: only the 9 site variables in section 5.

### Medium
- **4.4 ✅ Auth cookies weren't `Secure`.** Fixed. They stay readable by JS (not `httpOnly`): `@supabase/ssr`'s browser client needs that, and CSP is the XSS guard.
- **4.5 ✅ `/api/sync-status` was an uncached public function.** Now cached 10 s at the CDN.
- **4.6 ✅ Public placeholders on `/consultancy`.** Hidden.
- **4.7 ✅ Upload size was enforced only by the client.** Stored size is now capped by the signature. Bytes: see O4.
- **4.8 ✅ in migration:** the legacy public write `create_quote_request()` and legacy anon-readable tables are revoked.
- **4.9 🟠 `webapp_readwrite`:** nothing in the repo uses it. There is no order path that writes to BUSY; the site never connects to BUSY at all. Keep that login off the sync server and Vercel entirely. If it isn't needed yet, disable it in SQL Server.

### Low / info
- Portal API routes have no app-level rate limit. Every one requires a staff session, and login is limited by Supabase Auth.
- Staff see raw Supabase error text in portal toasts. Signed-in staff only, so acceptable.
- `npm audit` after the fix:
  - `braces` chain (high): dev-only, via `eslint-config-next`. No fix in 15.x.
  - `postcss` (high): already decided.
  - `sprintf-js` / `tedious` (moderate): sync server only. The only "fix" is downgrading `mssql` to 4.x, so left as is.
- Checked and fine:
  - SQL injection: PostgREST is parameterized. The sync's only interpolated SQL uses regex-validated env and integer codes.
  - SSRF: the server fetches only fixed Supabase / Cloudinary hosts.
  - XSS: no `dangerouslySetInnerHTML`.
  - CORS: no CORS headers, so same-origin only.
  - Error responses: generic.
  - Cart/quote: the quantity cap is a fixed 999, never stock-based, so no "only N left".
  - Sort/filter: name / price / in-stock only, no stock ordering.
  - robots/sitemap: public parts only.
  - Image URLs: Cloudinary `sk-image/<source>/<key>/…`, where the key is the public item code.

## 5. Vercel env checklist (site)

| Variable | Scope | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public (by design; RLS + this migration protect data) | Supabase → API Keys → Publishable key |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | public | Cloudinary → Dashboard → Cloud name |
| `CLOUDINARY_API_KEY` | **server-only** | Cloudinary → Settings → API Keys |
| `CLOUDINARY_API_SECRET` | **server-only** | Cloudinary → Settings → API Keys |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | public | Shop's WhatsApp, digits with 91. **Empty = WhatsApp buttons disabled on quote and consultancy** |
| `NEXT_PUBLIC_SITE_URL` | public | Final domain, e.g. `https://www.…` (optional on Vercel) |
| `NEXT_PUBLIC_ALLOW_INDEXING` | public | `false` until launch, then `true` |
| `REQUIRE_DISPLAY_NAME_AND_PHOTO` | server-only | `true` = only products with a display name AND photo are listed (launch gate) |

**Must NOT be on Vercel** (sync server only):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- all `BUSY_*` and `BUSY_SQL_*`
- `PRICE_VERIFIED`, `STOCK_VERIFIED`, `ALLOW_LIVE_WRITE`
- `SYNC_RUNNER_*`, `HEALTHCHECK_URL`, `SYNC_DATA_DIR`

The full sync-server and n8n lists are in NOTES.md → Env vars.

## 6. Vercel Hobby — what could bite
- **Commercial use:** Hobby is non-commercial (AUDIT #7, still open).
- **Cron:** none on Vercel. The sync is driven by n8n, so the Hobby once-a-day cron limit doesn't matter.
- **Function duration:** Fluid default 300 s. The heaviest request reads ~1.4k catalog rows, so it's far below that.
- **Data cache / ISR writes:** the most likely to grow. The catalog cache is keyed by `last_change_at`, so every BUSY change creates a fresh catalog entry, and product pages revalidate every 60 s. During shop hours that can be hundreds of writes a day. Watch Usage → ISR / Data Cache in the first week.
- **Function invocations:** every open tab polls `/api/sync-status` every 30 s. The new 10 s CDN cache caps real invocations at about 1 per 10 s per region, however many tabs are open.
- **Bandwidth:** photos are served by Cloudinary, not Vercel. Pages are ~105–125 kB first-load JS.
- **Middleware** runs only on `/sk-image/*` and `/api/sk-image/*`.

## 7. Local test plan (by hand)

Setup: Docker running, then follow NOTES.md → Local testing. Seed now applies all migrations. Or skip the setup and test steps 1–6 against a preview with the migrations applied.

1. `npm run lint && npx tsc --noEmit && npm run build`: zero errors.
2. `npm start`. Open `/`, `/parts`, a category, page 2, `/parts?stock=in`, sort by price both ways. Every card shows a label, never a number.
3. Search "chager 60v". It must find 60 V chargers and show labels only.
4. **Stock labels:**
   - In fake BUSY (`npm run local:busy sell <code> <qty>`), bring an item to exactly 10, 11, 0 and below 0.
   - Run `npm run sync:delta -- --live`.
   - Expect Low, In stock, Out of stock and Out of stock, within ~60 s and without reloading the listing.
5. `npm run check:stock -- --db --site=http://localhost:3000` → "every product matches, no quantity readable by anon".
6. `npm run check:leaks -- --site=http://localhost:3000` → "no quantities, secrets or BUSY identifiers found".
7. View page source + DevTools → Network on a product page. Search for the item's real quantity: it must not appear in HTML, `?_rsc=` responses, `/api/search-index` or the Supabase calls.
8. **Display-name override:**
   - Portal → open a BUSY item → set a display name.
   - Run `npm run sync:full -- --live`.
   - The name must still be there in the portal and on `/parts/<code>`.
9. **Two-source stock:**
   - Portal → Add product → "Same item as BUSY code" = a BUSY item with stock 4, stock 8 → save.
   - That BUSY item shows **In stock**, and the portal product isn't listed separately.
   - Hide the portal product → back to Low.
10. **Photo from phone** (needs Cloudinary keys; use a preview deploy or `next dev` reached over LAN/HTTPS):
    1. Log in as staff on the phone.
    2. Take 3 photos with the in-app camera, then check that the phone's gallery has no new photos.
    3. The photos show on the site immediately.
    4. Upload an image larger than 1600 px from the gallery. In Cloudinary → Media Library the stored file must be ≤1600 px.
    5. Try the native-camera fallback once, and check the gallery again (O3).
11. **Admin login:**
    - A wrong password a dozen times hits Supabase's rate-limit message.
    - A login without a role is refused.
    - Staff has no Delete on portal products. Owner does.
    - Logout leads back to the login page.
    - Signed out, `/sk-image` and `/api/sk-image/sign` → login redirect / 401.
12. **Consultancy:**
    - Header "Categories" menu and footer both link to `/consultancy`.
    - With `NEXT_PUBLIC_WHATSAPP_NUMBER` set, "Talk on WhatsApp" opens WhatsApp with the prefilled message.
    - No "Placeholder" text on the page.
13. **Wrong company:**
    - `BUSY_EXPECTED_DB=BusyComp0001_db12026 npm run sync:delta -- --live` → `*** SYNC FAILED: WRONG_DATABASE … not S.K. TRADERS`, exit code 1.
    - `BUSY_SQL_DATABASE=BusyComp0001_db12026` with the right expected DB → `WRONG_DATABASE Connected to …`.
    - In both cases the site data is unchanged.
14. **Sync delay:** stop the runner for 15+ min. The site keeps the last data and shows "· data may be out of date". n8n alerts once.
15. **Headers:** `curl -sI http://localhost:3000/` shows CSP, `X-Frame-Options: DENY`, HSTS, Referrer-Policy and Permissions-Policy, and no `X-Powered-By`.
