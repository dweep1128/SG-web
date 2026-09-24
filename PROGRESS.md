# S.K. Traders parts site — progress

Checkpoint rule: build passes → commit `site: phase N — <what>` → tick here.

- [x] Phase 0 — recover: install, ESLint configured (flat config, pinned), lint + build green, old-session work committed as baseline
- [x] Phase 1 — data layer: paged RPC fetch (1417 rows), unstable_cache 300s, lean `Part` (no qty/cost), draft classifier, <PartImage>, Cloudinary-only remotePatterns, old routes removed
- [x] Phase 2 — design system: tokens (circuit green + volt), Big Shoulders / Figtree / JetBrains Mono, components/ui.tsx (Button, ButtonLink, ExternalButton, Badge, StockBadge, CodeTag, Input, Textarea, Card, Skeleton, EmptyState), components/toast.tsx. All token text pairs ≥ 5.4:1
- [ ] Phase 3 — pages (header, home, /parts, /parts/[code], /quote, 404, loading, errors, /about)
- [ ] Phase 4 — search (fuzzy, header dropdown, /search, lib/search-aliases.ts)
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

## Decisions (resolved 2026-09-24)

- docs/busy-schema-report.md → gitignored, local only. Done.
- .npm-cache → untracked + gitignored (no history rewrite). Done.
- Root static prototype + tmp files → deleted. Done.
- Old routes (/account/*, /admin, /products/*, middleware.ts + lib/components) → remove in Phase 3; 301 /products and /products/:path* → /parts. No DB tables dropped.
