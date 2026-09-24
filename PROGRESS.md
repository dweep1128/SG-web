# S.K. Traders parts site — progress

Checkpoint rule: build passes → commit `site: phase N — <what>` → tick here.

- [x] Phase 0 — recover: install, ESLint configured (flat config, pinned), lint + build green, old-session work committed as baseline
- [ ] Phase 1 — data layer (lib/catalog.ts, lib/categories.ts, <PartImage>, cloudinary remotePatterns)
- [ ] Phase 2 — design system (tokens, fonts, Button/Badge/Input/Card/Skeleton/EmptyState/Toast)
- [ ] Phase 3 — pages (header, home, /parts, /parts/[code], /quote, 404, loading, errors, /about)
- [ ] Phase 4 — search (fuzzy, header dropdown, /search, lib/search-aliases.ts)
- [ ] Phase 5 — polish (SEO, sitemap, robots, a11y, perf)
- [ ] Phase 6 — final check (build, console, bundle grep, 375/1440, WhatsApp with 3 items)

## BLOCKED — public_catalog_list() not visible to the API (re-checked 2026-09-24 after "applied")

REST call with the publishable key → 404 PGRST202; OpenAPI lists no /rpc paths for it. Project in .env: bmadalyvnzqxtptbixla.
Fix, in SQL Editor of that project:
1. `select pg_get_function_identity_arguments('public.public_catalog_list'::regproc);` — errors = function not created there.
2. If it exists: `notify pgrst, 'reload schema';`
3. Tell Claude → verify via REST (paged, expect ≈1422 rows) → Phase 1.

## Decisions (resolved 2026-09-24)

- docs/busy-schema-report.md → gitignored, local only. Done.
- .npm-cache → untracked + gitignored (no history rewrite). Done.
- Root static prototype + tmp files → deleted. Done.
- Old routes (/account/*, /admin, /products/*, middleware.ts + lib/components) → remove in Phase 3; 301 /products and /products/:path* → /parts. No DB tables dropped.
