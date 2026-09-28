# Pre-handover audit — 2026-09-28

Scope: website, SK-image portal, BUSY sync, Supabase, Vercel. Branch `chore/handover-audit`, based on
`feat/sk-image` (which is `main` + SK-image) because half the scope is SK-image code — **merging this branch also merges
SK-image**. The live Supabase already has `sk-image.sql` applied, so that merge is safe once the Cloudinary env vars exist.

How it was checked: code read end to end; live Supabase probed read-only (public key for "what can anyone read",
service key only for `sync_runs` and user roles); `catalog_view` compared row-by-row with `public_catalog_list()`;
full git history scanned; `npm audit`; production build run locally against the live database with headless Chrome
(360/390 px, console/CSP errors, quote flow) and Lighthouse (mobile).

Legend: ✅ fixed on this branch · 🟠 needs you (dashboard/setting/decision) · ℹ️ checked, fine.

## Critical

**1. ✅ Next.js had an unauthenticated remote-code-execution bug in the image optimizer (15.5.23).**
Production `main` is still on the vulnerable version. Fixed: Next 15.5.26, and Next's image optimizer is switched off
entirely (`images.unoptimized` — every photo is already resized by Cloudinary), so `/_next/image` no longer exists.
→ Merge this branch (or at least commit `489cbf4`) to `main` soon.

**2. 🟠 Anyone can create a Supabase account (sign-ups are ON), and any account can edit SK-image data.**
`disable_signup` is `false` on the live project. The SK-image policies trust every signed-in user, so a stranger who
signs up with the public key could add/delete photos and manual products and request Cloudinary upload signatures.
→ Supabase → Authentication → Sign In / Providers → turn off "Allow new users to sign up". (5 seconds, do it first.)
→ Also recommended, belt and braces: restrict the policies to staff (both existing users currently have role `customer`,
so set the role first):
```sql
update public.profiles set role = 'staff' where id in (select id from auth.users where email in ('<staff email 1>', '<staff email 2>'));
drop policy "product_media staff insert" on public.product_media;
drop policy "product_media staff update" on public.product_media;
drop policy "product_media staff delete" on public.product_media;
drop policy "products_manual staff all" on public.products_manual;
create policy "product_media staff insert" on public.product_media for insert to authenticated with check (public.is_staff());
create policy "product_media staff update" on public.product_media for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "product_media staff delete" on public.product_media for delete to authenticated using (public.is_staff());
create policy "products_manual staff all" on public.products_manual for all to authenticated using (public.is_staff()) with check (public.is_staff());
```
Not applied: it changes who can log in to SK-image, and every new staff user then needs the role set.

**3. 🟠 The BUSY sync is not scheduled — site stock/prices are 6 days old.**
`sync_runs` has 3 runs ever, all manual `full` runs, the last on 2026-09-22 08:48. Nothing refreshes stock.
→ Schedule it on the machine that reaches BUSY: exact commands in HANDOVER.md §8 (stock every 15 min, items every
30 min, full daily, staggered). Set `HEALTHCHECK_URL` for email alerts.
✅ Added: SK-image home now shows when BUSY stock last synced, with a "Sync is late" badge after 2 h
(needs `supabase/handover-audit.sql`).

## High

**4. 🟠 Cloudinary env vars are missing on Vercel.** SK-image uploads fail on preview and production until
`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` are added (then redeploy).

**5. 🟠 BUSY Web Service login is trivial.** The sync's BUSY user has a 4-character password identical to its
username. The Web Service (port 981) accepts SQL over plain HTTP headers; anyone on the shop LAN/Tailscale with these
credentials can query BUSY, and BUSY service codes beyond read queries exist.
→ Create a dedicated BUSY user for the sync with a long random password and the fewest rights BUSY allows; make sure
port 981 is reachable only from the LAN/Tailscale (Windows Firewall), never from the internet.
The sync itself is read-only by construction (constant SC=1, SELECT-only filter, DB-name guard) — ℹ️ verified.

**6. 🟠 Sync and BUSY secrets are stored in Vercel, which doesn't need them.** `SUPABASE_SERVICE_ROLE_KEY`,
`BUSY_PASSWORD`, `BUSY_SQL_READONLY_PASSWORD`, `ALLOW_LIVE_WRITE=…` etc. are set on the Vercel project. The website
never reads them (verified: not in any source file under `src/`, not in the client bundle), but they sit in the
website's runtime and in every Vercel member's view. → Delete these from Vercel: all `BUSY_*`, `BUSY_SQL_*`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRICE_VERIFIED`, `STOCK_VERIFIED`, `ALLOW_LIVE_WRITE`, `HEALTHCHECK_URL`,
`SYNC_DATA_DIR`. Keep them only on the sync machine. Consider rotating the service-role key afterwards (HANDOVER §5).

**7. 🟠 Vercel Hobby plan is non-commercial.** A business storefront should move to Vercel Pro before launch.

## Medium

**8. ✅ Security headers were missing.** Added in `next.config.ts`: Content-Security-Policy (self + Supabase +
Cloudinary; Vercel toolbar on previews only), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self)` and everything else off.
Verified: zero CSP violations in the browser console on all public pages and the login page.
Left: `script-src 'unsafe-inline'` — Next's App Router streams inline scripts; the nonce alternative makes every page
dynamic (loses ISR caching). Acceptable for a site with no user-generated HTML.

**9. ✅ SK-image API hardening.**
- Cross-site POSTs to `/api/sk-image/*` are refused (Origin check in middleware; cookies are also SameSite=Lax). Verified 403.
- `/api/sk-image/sign` signs only for products that exist; folder pinned to `sk-image/<source>/<key>`, formats pinned to
  jpg/png/webp by the signature; 8-photo limit checked before signing.
- Delete routes only destroy Cloudinary assets inside that product's `sk-image/…` folder (a row pointing elsewhere is
  refused), and `handover-audit.sql` adds the same rule as a table constraint.
- Error responses are generic; details go to the server log only.
- Every route re-checks the session itself (middleware is not the only gate). Verified 401 without login on all four.
Left: **file size** can't be enforced by a Cloudinary signature. The client rejects > 10 MB and resizes to 1600 px
before upload; the Cloudinary free plan also caps uploads at 10 MB. For a hard server limit, create a signed upload
preset with max file size and sign `upload_preset` instead.

**10. 🟠 Legacy public write endpoint: `create_quote_request()`.** Callable by anyone with the public key and inserts
into `quote_requests` (1 row exists). The current site never calls it (quotes go by WhatsApp), so it's only a spam
vector. Recommended:
```sql
revoke execute on function public.create_quote_request(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
```
The other legacy demo tables (`products`, `product_images`, `categories`, `scooter_models`, `product_compatibility`)
are publicly readable demo data (6 products) and unused by the site. Drop them when convenient; not done because
dropping tables is irreversible.

**11. 🟠 No database backups on the Supabase Free plan.** Export `products_manual` / `product_media` periodically or
move to Pro (daily backups). `busy_items` can always be rebuilt by a `full` sync.

**12. 🟠 Sync runs can overlap.** There is no lock; two runs at once are harmless for items (idempotent upserts) but an
older stock snapshot could land after a newer one. The staggered schedule in HANDOVER §8 avoids it. Recommended code
change (touches sync core, so not made): a lock file in `scripts/busy-sync/index.mjs` `main()` that makes a second
run exit with status `BUSY_LOCKED`.

**13. 🟠 Financial-year rollover stops the sync.** `BUSY_EXPECTED_DB=BusyComp0003_db12026` is pinned to one FY.
When BUSY moves to the next FY the sync stops with `NEW_FY_DETECTED` (by design). Someone must update the env var —
steps in HANDOVER §8.

**14. ✅ Known SK-image gaps from the build.**
- Orphaned Cloudinary files when the DB save fails after upload: now deleted automatically (kept only if the phone is
  offline, so the retry can still save it). A retry after a lost response is recognised as already saved.
- Android Back button while the camera is open now closes the camera (with the "still uploading" warning) instead of
  leaving the page.
- Manual products have a permanent **Delete** (confirm → each photo from Cloudinary + its row → the product). BUSY
  items can't be deleted (they belong to the sync).

**15. ✅ Photo/product changes took up to 5 minutes to reach the site.** SK-image now revalidates the catalog cache,
all product pages and the search index after every write.

## Low

**16. ℹ️ Performance (Lighthouse mobile) below 90, pre-existing.** Production `main` and this branch score in the
same range; accessibility and best-practices are 100 everywhere.

| Page | Perf | A11y | Best pr. | SEO* | LCP | CLS |
|---|---|---|---|---|---|---|
| `/` | 81 | 100 | 100 | 63 | 3.1 s | 0.001 |
| `/parts?cat=chargers` | 56–63 | 100 | 100 | 54 | 3.5–4.0 s | 0.001 |
| `/search?q=charger` | 48–59 | 100 | 100 | 54 | 3.7–5.0 s | 0.002 |
| `/parts/1291` | 75 | 100 | 100 | 66 | 3.5 s | 0 |
| production `/parts?cat=chargers` | 72 | – | – | – | 3.2 s | – |

\*SEO is low only because the site is deliberately `noindex` until `NEXT_PUBLIC_ALLOW_INDEXING=true`, plus a Lighthouse
artifact: Next 15 streams `<meta description>` in `<body>` for browsers; WhatsApp/Facebook previews get it in `<head>`
(verified). Local runs varied 1.2–5.3 s TBT between identical runs, so no "cheap fix" could be proven here; the cost is
"Style & Layout" + hydration of 24 cards. Next step: measure on a Vercel deployment with PageSpeed Insights and try
(a) dropping the staggered `.reveal` card animation, (b) making the card quick-add button a lighter island.

**17. ℹ️ npm audit after the fix:** `postcss` (high, build-time only — processes our own CSS) and `sharp` (high,
libvips/libheif) remain, both bundled inside Next; the only fix is Next 16 (major upgrade). `sharp` is no longer used at
runtime since the image optimizer is off. Revisit when upgrading to Next 16.

**18. ✅ Accessibility/SEO small fixes.** 404 page now has an `<h1>`; brand link's accessible name matches its
visible text; home page has a canonical URL.

**19. 🟠 Local dev `.env` has `ALLOW_LIVE_WRITE=true` and the service-role key.** A laptop can write live data.
`.env.example` says to keep it `false` everywhere except the sync machine.

**20. ℹ️ Git history contains an old `.npm-cache/` (npm registry metadata, ~60 MB of diffs).** No secrets in it
(scanned). Only repo size; a history rewrite isn't worth the risk.

**21. ✅ `.gitignore`: the `.env.example` exception was listed before `.env*`, so it was re-ignored.** Order fixed.

## Checked and fine (ℹ️)

- **Secrets in git:** full history scanned (excluding npm cache noise) for Supabase keys, JWTs, service-role, Cloudinary,
  BUSY/SQL passwords, GitHub/AWS tokens, URL credentials: only placeholders (`YOUR_…`). Only `.env.example` is tracked.
- **Client bundle:** no server-only env names, and none of the local secret values (service key, BUSY credentials) appear
  in `.next/static` (one hit was the literal word "BUSY", see #5).
- **What anon can read (live, public key):** `catalog_view` ✓, `product_media` ✓ (public photos), legacy demo tables (#10).
  **Cannot** read `busy_items`, `sync_runs`, `products_manual` (so no inactive manual rows), `profiles`,
  `quote_requests`, `quote_items`.
- **`catalog_view` masking:** 1,417 BUSY rows, **0 differences** from `public_catalog_list()` in price, stock status,
  quantity and stock time; no zero/negative quantity exposed; no cost column exists in the view.
- **Customer data:** quote contents live only in the shopper's browser (localStorage) and go out via WhatsApp;
  name/phone are not stored. The legacy `quote_requests` table (1 row) is readable by staff role only.
- **Rate limiting:** the app has no public write endpoints. `/api/search-index` is a cached static response. Login is
  rate-limited by Supabase Auth. The only anon write is the legacy RPC (#10).
- **BUSY sync:** upsert-only (never deletes; missing items are flagged inactive); company DB checked at start *and*
  before saving; strict parse + schema fingerprint + sanity limits (> 10 % drop in active items or a jump in zero prices
  aborts); any failure discards the whole pull, so a failed run never blanks data; per-request 60 s timeout; ≥ 1 s gap
  between BUSY requests; cost/purchase columns blocked from every query; never touches `product_media` or
  `products_manual` (only `busy_items`, `sync_runs`, `apply_busy_stock`). No retries inside a run — the next scheduled
  run is the retry, which is the right call for a 15-minute job. Stale stock is visible: product pages show
  "Updated N days ago".
- **Indexes:** none missing at this size. `product_media` lookups use the unique `(source, product_key, public_id)`
  index; the whole catalog is ~1.4k rows, so portal search/filters are ~1 ms scans and the site reads the view once per
  5 minutes. Trigram index SQL for > 50k rows is in `supabase/handover-audit.sql`. The API can't run `EXPLAIN`; to see
  the plans run in the SQL editor:
  `explain analyze select * from catalog_view where name ilike '%charger%60v%' order by name limit 24;`
  `explain analyze select count(*) from catalog_view where primary_image_url is not null;`
- **Caching:** catalog data 5 min (tag `catalog`), product pages ISR 5 min, search index 5 min, sitemap 1 h; SK-image
  writes now invalidate all three immediately.
- **Images:** every image is Cloudinary `f_auto,q_auto` — cards `w_600` (≈2× their 280 px size), product gallery
  `w_1200`; fixed 4:3 frames (CLS ≈ 0); below-the-fold images lazy-load, only the first product photo is `priority`.
- **Bundles:** public pages 103–123 kB first-load JS; heaviest is the SK-image photo screen (187 kB, includes the
  Supabase client). All dependencies are used.
- **SEO:** unique titles + meta descriptions, Open Graph on all pages, canonicals on listing/product/about/home,
  `sitemap.xml` lists every part, `robots.txt` disallows `/api/`, `/quote`, `/search`, `/sk-image` when indexing is on
  (and everything while it's off). SK-image pages are `noindex`.

## Functional QA

Run on this branch's production build against the live database (headless Chrome, 360 px and 390 px).

| Area | Result |
|---|---|
| Home, `/parts`, category filter, in-stock + sort + page 2 | ✅ |
| Search: typo "chager 60v" finds chargers; no-results page shows suggestions | ✅ |
| BUSY product `/parts/1291` (price, GST, stock, canonical, OG) | ✅ |
| Manual product `/parts/m…` | ⚪ no manual products exist yet; unknown `m999999` correctly 404s |
| Quote: add from product page → count → +1 qty → remove → empty state | ✅ |
| Quote: send on WhatsApp | ⚪ disabled locally (no WhatsApp number in local env); link builder covered by earlier tests |
| 404 (`/nope`, `/parts/abc`) real HTTP 404; error pages | ✅ |
| No horizontal scroll at 360 and 390 px on every page; images have alt; inputs labelled; one h1 | ✅ |
| Console / CSP errors | ✅ none (only the expected 404 resource on the 404 page) |
| SK-image: login page, every portal page and API redirects/401s without login, 403 cross-site | ✅ |
| SK-image signed-in flows: search, filters, camera, upload, cover, reorder, delete, add/edit/disable/delete product, 8-photo limit | 🟠 **not run** — needs a staff login and the Cloudinary env vars (#4). I can't create accounts on the live auth service. Checklist below. |
| Camera on a real phone (permissions, Back button, flash/haptics, uploads on mobile data) | 🟠 on you |

**Manual test checklist (15 min, on a phone):** log in → search "charger" → filter *No photo* → open a part → Take
photo ×3 → press phone Back while one is uploading (expect the warning) → Done → set the 2nd as cover (★) → move it ←
→ delete one → upload 1 from gallery → try a 9th photo (button disabled) → open the part on the site (photos show
immediately) → Add Product → save → add a photo → Disable (gone from site) → Enable → Delete (gone, photos removed from
Cloudinary Media Library) → Logout.
