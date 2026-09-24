# S.K. Traders parts site — progress

Checkpoint rule: build passes → commit `site: phase N — <what>` → tick here.

- [x] Phase 0 — recover: install, ESLint configured (flat config, pinned), lint + build green, old-session work committed as baseline
- [ ] Phase 1 — data layer (lib/catalog.ts, lib/categories.ts, <PartImage>, cloudinary remotePatterns)
- [ ] Phase 2 — design system (tokens, fonts, Button/Badge/Input/Card/Skeleton/EmptyState/Toast)
- [ ] Phase 3 — pages (header, home, /parts, /parts/[code], /quote, 404, loading, errors, /about)
- [ ] Phase 4 — search (fuzzy, header dropdown, /search, lib/search-aliases.ts)
- [ ] Phase 5 — polish (SEO, sitemap, robots, a11y, perf)
- [ ] Phase 6 — final check (build, console, bundle grep, 375/1440, WhatsApp with 3 items)

## BLOCKED — needs Dweep (as of 2026-09-24)

`public.public_catalog_list()` is **not applied** in Supabase (live RPC returns PGRST202). Only
`public_catalog_item(code)` exists, and it has no HSN, group, or `stock_synced_at`, and no way to list items.
The site can't show a catalog without it.

1. Review `supabase/busy-catalog-list.sql` (updated this session: now also returns `stock_synced_at`, only when `stock_visible`).
2. Run it once in Supabase Dashboard → SQL Editor.
3. Tell Claude "applied" → resume at Phase 1.

## Open questions for Dweep

- `docs/busy-schema-report.md` contains real purchase-price (D4) samples. Left **untracked** on purpose. Commit it, gitignore it, or move it?
- `.npm-cache/` (235 files, one 31 MB blob) was committed in the initial commit. Proposed: `git rm -r --cached .npm-cache` + gitignore it.
- Legacy static prototype at repo root (tracked): `index.html product.html script.js product.js data.js styles.css`,
  plus `extend_sip_report.py tmp_inspect_report.py tmp_report_extract.txt`. Proposed: delete. Not touched without a yes.
- Old routes on the legacy `products` table (`/account/*`, `/admin`, `/products/*`, `lib/catalogue.ts`, `lib/types.ts`,
  admin/auth/photo-finder components, `middleware.ts`). New site uses `/parts`. Proposed: remove them in Phase 3 and redirect `/products` → `/parts`.
