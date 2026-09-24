# S.K. Traders parts site — progress

Checkpoint rule: build passes → commit `site: phase N — <what>` → tick here.

- [x] Phase 0 — recover: install, ESLint configured (flat config, pinned), lint + build green, old-session work committed as baseline
- [x] Phase 1 — data layer: paged RPC fetch (1417 rows), unstable_cache 300s, lean `Part` (no qty/cost), draft classifier, <PartImage>, Cloudinary-only remotePatterns, old routes removed
- [x] Phase 2 — design system: tokens (circuit green + volt), Big Shoulders / Figtree / JetBrains Mono, components/ui.tsx (Button, ButtonLink, ExternalButton, Badge, StockBadge, CodeTag, Input, Textarea, Card, Skeleton, EmptyState), components/toast.tsx. All token text pairs ≥ 5.4:1
- [x] Phase 3 — pages: sticky header (logo, search, categories <details> menu, live quote count), home (hero + search + value line, category tiles, popular parts, WhatsApp strip), /parts (category chips, in-stock toggle, sort, 24/page pagination, all URL-synced), /parts/[code] (ISR), /quote (localStorage, cross-tab sync, WhatsApp send), /about [FILL], 404, loading + error per route, global-error, /products → /parts 301
- [x] Phase 4 — search: Fuse.js AND-of-tokens (word tokens fuzzy, tokens with digits exact), normalize (case, punctuation, "60 v"→"60v"), exact item code ranks first; header combobox (120ms debounce, ↑↓ Enter Esc, `/` focus, word-level highlight incl. typos, top 6 + See all); lazy `/api/search-index` (tuples, ISR 300s); /search reuses catalog filters; no-results → closest matches + WhatsApp with query; lib/search-aliases.ts (empty); `npm run check:search` self-check
- [ ] Phase 5 — polish (SEO, sitemap, robots, a11y, perf)
- [ ] Phase 6 — final check (build, console, bundle grep, 375/1440, WhatsApp with 3 items)

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
- Design: dominant #0b6e4f circuit green, accent #d8ff3e volt (only on dark / as fill behind ink). Display font Big Shoulders (condensed industrial), body Figtree, codes JetBrains Mono. Next has no fallback metrics for Big Shoulders → small heading reflow on first font load (ceiling: add a size-adjusted @font-face fallback).
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

## Decisions (resolved 2026-09-24)

- docs/busy-schema-report.md → gitignored, local only. Done.
- .npm-cache → untracked + gitignored (no history rewrite). Done.
- Root static prototype + tmp files → deleted. Done.
- Old routes (/account/*, /admin, /products/*, middleware.ts + lib/components) → remove in Phase 3; 301 /products and /products/:path* → /parts. No DB tables dropped.
