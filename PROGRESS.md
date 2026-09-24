# S.K. Traders parts site — progress

Checkpoint rule: build passes → commit `site: phase N — <what>` → tick here.

- [x] Phase 0 — recover: install, ESLint configured (flat config, pinned), lint + build green, old-session work committed as baseline
- [x] Phase 1 — data layer: paged RPC fetch (1417 rows), unstable_cache 300s, lean `Part` (no qty/cost), draft classifier, <PartImage>, Cloudinary-only remotePatterns, old routes removed
- [x] Phase 2 — design system: tokens (circuit green + volt), Big Shoulders / Figtree / JetBrains Mono, components/ui.tsx (Button, ButtonLink, ExternalButton, Badge, StockBadge, CodeTag, Input, Textarea, Card, Skeleton, EmptyState), components/toast.tsx. All token text pairs ≥ 5.4:1
- [x] Phase 3 — pages: sticky header (logo, search, categories <details> menu, live quote count), home (hero + search + value line, category tiles, popular parts, WhatsApp strip), /parts (category chips, in-stock toggle, sort, 24/page pagination, all URL-synced), /parts/[code] (ISR), /quote (localStorage, cross-tab sync, WhatsApp send), /about [FILL], 404, loading + error per route, global-error, /products → /parts 301
- [x] Phase 4 — search: Fuse.js AND-of-tokens (word tokens fuzzy, tokens with digits exact), normalize (case, punctuation, "60 v"→"60v"), exact item code ranks first; header combobox (120ms debounce, ↑↓ Enter Esc, `/` focus, word-level highlight incl. typos, top 6 + See all); lazy `/api/search-index` (tuples, ISR 300s); /search reuses catalog filters; no-results → closest matches + WhatsApp with query; lib/search-aliases.ts (empty); `npm run check:search` self-check
- [x] Phase 5 — polish: per-page metadata + canonicals, product titles `NAME (#code)`, sitemap.xml (1434 URLs), robots.txt (blocks /api, /quote, /search), SVG icon; a11y (skip link, labelled combobox/stepper/sort, visible focus ring, hidden h2 on listings, narrow-screen menu label kept for screen readers, AA contrast); perf (fixed 4:3 image frames, content-visibility on below-fold grids, search index 18 KB gzip loaded on first focus, 24 cards per page)
- [x] Phase 6 — final check (2026-09-24):
  - REST re-check: 1417 rows, no cost keys, 0 synced_at-while-hidden. No dev fixture was ever needed (RPC was live from Phase 1).
  - Clean `rm -rf .next && npm run build` passes; lint clean; `npm run check:search` passes.
  - Console: zero messages on /, /parts (filters+page 2), /search, /parts/1291, /quote, /about, 404 (tracker verified with a probe).
  - Bundle grep of .next/static: service key value, SUPABASE_SERVICE_ROLE_KEY, BUSY_*, sale_price, stock_qty, purchase, busy_items, D4 → 0 hits.
  - 375px (iframe) + ~1440px: no horizontal overflow; header, hero, grid, chips checked visually.
  - Quote with 3 parts (qtys 3/1/2) → wa.me/<number>?text=… decoded correctly incl. "&" and "#" in notes (tested with a throwaway number via shell env only).
  - 404: unknown/invalid part codes return HTTP 404; /products/* → 301 /parts.

## Review round 1 (2026-09-24)

- [x] Phase 7a — data: row count reconciled (1422 sync-active − 5 active-excluded = 1417 live; code sets identical to the sync's dry-run output, nothing missing). docs/exclusions-draft.md (18 non-parts, 4 whole vehicles, 7 unsure). Categories: fasteners-first rule (nut/bolt/spring/key/washer/screw → hardware, except "WITH SPRING", "DOUBLE SPRING", "AND KEY", "KEY LOCK"), noun-first rules (throttle/lock → controls, motor → motors, seat → body, tie → hardware), misspellings (cylender, throttale, chagori, conctor, harnas, carier, axcel, …). "other" 69 → 44.
- [x] Phase 7b — quote form: "Name / Shop name" required, "Phone (optional)"; WhatsApp message now `Name / Shop: …` and a Phone line only when given. Hero: "Live stock" → "Stock from our billing system"; "packed same day" removed ("Shipped to your workshop anywhere in India."). Same wording in site + /parts meta descriptions.
- [x] Phase 7c — size-adjusted @font-face fallbacks (Arial Bold 69%, Roboto Bold 75% for Android; ascent/descent overrides), hero max-width 14ch → 6.9em. Measured in-browser on /, /parts, /parts/2046, /quote at 375 + 1280: heading height change 0px, page height shift 0px (old stack: hero jumped 42px mobile / 88px desktop).

## Demo deploy prep (2026-09-24)

- [x] Phase 8 — demo hardening: 22 codes from docs/exclusions-draft.md §A (not parts) + §B (whole vehicles) hidden via `src/lib/hidden-items.ts` filter in lib/catalog.ts (their detail pages 404); §C unsure stays visible. All [FILL] placeholders replaced by `CONTACT` in lib/site.ts (empty = not rendered). `NEXT_PUBLIC_ALLOW_INDEXING` (default false → robots.txt `Disallow: /` + noindex meta on every page).
- [ ] **TODO (after demo): move the 22 hidden codes into scripts/busy-sync/catalog-exclusions.json + re-sync, then delete src/lib/hidden-items.ts.**
- [ ] TODO: fill `CONTACT` in src/lib/site.ts (address, phone, hours, GSTIN, email, payment terms, about text).
- Note: `git ls-files | grep -i env` → `.env.example` and `next-env.d.ts` (Next's generated TS types, no secrets). `.env` is untracked + gitignored.

## Vercel deploy (2026-09-24)

- [x] Phase 9 — deploy fix. Root cause of failed dashboard deploy (sg-dexuwrcav…): no Supabase env vars on the project →
  `Error occurred prerendering page "/sitemap.xml"` / `Error: supabaseUrl is required.` → build exit 1.
  Fixes: env vars set on Vercel (prod + preview); code accepts NEXT_PUBLIC_SUPABASE_ANON_KEY or _PUBLISHABLE_KEY;
  catalog fetch failure during `next build` calls connection() → route renders at request time instead of failing the build
  (verified: build with zero env vars passes); `engines.node = 24.x` (= Vercel project); import-path case check (123 imports OK); `npm ci` clean.
- No photo-upload feature / sku-images.sql exists in this codebase → no Cloudinary/UPLOAD_PIN/service-role vars added.
- Deployed: https://sg-web-bice.vercel.app (dpl_HbCp6UdnunibiokYr2pdHYkw62cP, READY, build fetched 1417 → 1395 shown). /, /parts, /parts/1340, /quote, /search?q=chager+60v → 200 with real parts; hidden 1296 → 404; robots `Disallow: /` + noindex.
- [ ] TODO: NEXT_PUBLIC_WHATSAPP_NUMBER on Vercel has no digits (buttons show "not configured") → set real number, redeploy.
- [ ] TODO (security): Vercel project also holds BUSY_*, BUSY_SQL_*, ALLOW_LIVE_WRITE, PRICE_VERIFIED, STOCK_VERIFIED, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HEALTHCHECK_URL, SYNC_DATA_DIR (added before this session). Site never reads them; recommend deleting from Vercel.

## Verified 2026-09-24 (REST, publishable key, p_busy_code: null, 1000-row pages)

1417 rows (2 pages: 1000 + 417), 1417 unique codes. Keys: busy_code, busy_name, hsn_code, unit_name, gst_pct,
busy_group_name, price, stock_status, stock_qty, stock_synced_at — no cost/D4 fields. stock_synced_at-null-when-hidden:
0 violations, but stock is visible on every row right now, so that branch is untested against live data.

## Decisions to review

- Old routes removed in Phase 1 (not 3) so the build stayed green once lib/catalog-types.ts changed shape.
- Removed `@supabase/ssr` (no auth left); catalog uses plain supabase-js, no cookies → cacheable. Added `fuse.js@7.1.0`. All deps pinned to installed versions.
- `price` of 0 (41 items) is treated as hidden → "Price on request".
- Low-stock threshold: ≤ 10 units (`LOW_STOCK_THRESHOLD` in lib/site.ts). Live in-stock qty: p25 = 18, median = 57.
- Price shown as **excl. GST** ("₹330 + GST", detail page also shows incl. price) — `PRICE_INCLUDES_GST = false` in lib/site.ts. Unconfirmed whether BUSY D3 includes GST; this default never under-quotes.
- Categories: 14 draft buckets (lib/categories.ts). Distribution: body 441, brakes 155, controls 121, wiring 119, hardware 111, lights 109, meters 84, other 69, motors 54, suspension 47, chargers 36, controllers 25, wheels 23, batteries 23.
- Non-parts still in the live catalog (candidates for scripts/busy-sync/catalog-exclusions.json — not edited): ASUS LAPTOP, PRINTER TSC 244 PRO, LLOYD SAC (AC), 32 INCH LED TV, WALL FAN, MUSIC SYSTEM, VACCUM FLASK STEEL, HELMET/HELMENT ×3, E SCOOTER G3, E SCOOTER MAGIC, ELECTRIC SCOOTY, BICYCLE KIT 36 VOLT.
- Design: dominant #0b6e4f circuit green, accent #d8ff3e volt (only on dark / as fill behind ink). Display font Big Shoulders (condensed industrial), body Figtree, codes JetBrains Mono. Font-swap reflow fixed in Phase 7c (measured fallbacks).
- Header quote badge counts distinct parts, not total qty (50 bolts ≠ "50").
- Pagination (numbered, URL `?page=`) instead of load-more: shareable + server-rendered, only 24 cards in the HTML.
- "Popular parts" = priced + in-stock, one per category round-robin (no sales data yet). Swap for a hand-picked list later.
- Card has a one-tap "+" (qty 1) quick-add in addition to the detail page stepper; both show a toast.
- Quote page shows an **indicative subtotal** of priced lines (+ GST, "N on request"). Prices are snapshotted when added.
- Quote form: name + phone required (phone pattern `[+]?[0-9 ]{10,15}`), notes optional. Contact fields are NOT persisted.
- Quote is NOT cleared after sending (user may need to resend); explicit "Clear quote" button instead.
- Detail pages render on first request then cache 300s (ISR); none prebuilt at build time.
- Error pages never show `error.message` to shoppers; only the digest ref.
- Search: exact-substring for any token containing a digit ("60v" never fuzzes to "48v"); typo tolerance only on words ≥ 3 letters. Threshold 0.34.
- Search aliases map slang → item codes (not slang → canonical word), so one alias can point at several SKUs.
- 404 fix: detail route has no loading.tsx above it (listing loading moved into `parts/(list)/`, root loading removed) so unknown codes return a real HTTP 404 instead of a 200 stuck on a skeleton.
- Units normalised for display: "Pcs." → "pcs", "PACKS" → "packs".
- Prices: whole rupees shown without decimals (₹504), otherwise two decimals (₹529.20).
- `NEXT_PUBLIC_SITE_URL` (optional) added to .env.example; on Vercel it falls back to VERCEL_PROJECT_PRODUCTION_URL.
- /quote and /search are noindex + disallowed in robots; category pages are in the sitemap as `/parts?cat=…`.
- App icon is a volt lightning bolt on brand green (no letters, since the brand name isn't final).

## Decisions (resolved 2026-09-24)

- docs/busy-schema-report.md → gitignored, local only. Done.
- .npm-cache → untracked + gitignored (no history rewrite). Done.
- Root static prototype + tmp files → deleted. Done.
- Old routes (/account/*, /admin, /products/*, middleware.ts + lib/components) → remove in Phase 3; 301 /products and /products/:path* → /parts. No DB tables dropped.
