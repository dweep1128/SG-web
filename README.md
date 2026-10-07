# S.K. Traders parts site

E-scooter spare-parts catalogue for dealers and workshops. Shoppers search parts, build a quote and send it on
WhatsApp. Stock and prices come from the shop's billing software (BUSY). Staff add product photos from their phones
with **SK-image** (`/sk-image`).

**Live 60-second BUSY sync (SQL login, n8n), owner/staff admin portal: see [NOTES.md](NOTES.md) — it supersedes the
sync/scheduling parts below and in HANDOVER.md.**

Other documents: [HANDOVER.md](HANDOVER.md) (accounts, keys, runbooks) · [STAFF-GUIDE.md](STAFF-GUIDE.md) (for shop
staff) · [AUDIT.md](AUDIT.md) (security/quality audit and open items) · [PROGRESS.md](PROGRESS.md) (build log).

## Architecture

```
  Shop PC (Windows, on shop LAN)                      Cloud
 ┌──────────────────────────────┐
 │ BUSY desktop app              │
 │  └ Web Service :981 (SC=1)    │◄─┐  read-only SELECTs, DB-name guard
 └──────────────────────────────┘  │
 ┌──────────────────────────────┐  │  every 15–30 min / nightly (scheduler)
 │ BUSY sync (Node, this repo)  │──┘
 │  scripts/busy-sync           │─────── service-role key ──────►┌─────────────────────────────┐
 └──────────────────────────────┘   upsert busy_items, sync_runs │ Supabase (Postgres + Auth)  │
                                                                 │  busy_items   (sync-owned)  │
 Staff phone ── /sk-image (login) ─► Vercel ── user session ────►│  products_manual, product_  │
      │                                │                         │  media (staff, RLS)         │
      │ photo bytes (signed upload)    │ signs uploads           │  catalog_view (public read, │
      ▼                                ▼                         │  masks price/stock)         │
 ┌──────────────┐  delete (API secret) ┌──────────────────────┐  └──────────────┬──────────────┘
 │ Cloudinary   │◄─────────────────────│ Next.js on Vercel     │◄─ publishable key, 5-min cache ┘
 │ sk-image/…   │── f_auto,q_auto,w_… ►│  storefront + portal  │
 └──────────────┘   images to browser  └──────────┬───────────┘
                                                  ▼
                                   Shopper browser ── quote ──► WhatsApp (wa.me link, nothing stored)
```

- **Storefront** reads only `public.catalog_view` with the publishable key (`src/lib/catalog.ts`), cached 5 minutes;
  SK-image writes refresh it immediately. BUSY parts live at `/parts/1291`, manual products at `/parts/m<id>`.
- **Quotes** are never stored on a server: the list lives in the shopper's browser (localStorage) and is sent as a
  WhatsApp message.
- **BUSY sync** runs on a machine that can reach BUSY (not on Vercel). It only reads BUSY and only upserts Supabase.
- **SK-image** is Supabase email/password login, gated by `src/middleware.ts`. Photos go browser → Cloudinary directly
  (signed by `/api/sk-image/sign`); the API secret never leaves the server.

## Folder structure

```
src/
  app/                    Next.js App Router
    page.tsx              home
    parts/(list)/         /parts listing (filters, pagination)
    parts/[code]/         product page (ISR, gallery)
    search/  quote/  about/
    sk-image/             staff portal: login/, (portal)/ home, add/, p/[source]/[key]/
    api/search-index/     client search index (cached)
    api/sk-image/         sign, delete, delete-product, revalidate (all staff-only)
    sitemap.ts robots.ts  SEO
  components/             storefront UI (ui.tsx = design-system primitives), sk-image/ = portal UI
  lib/                    catalog, search, quote, categories, site config, supabase + cloudinary helpers
  middleware.ts           SK-image auth gate + CSRF origin check
scripts/
  busy-sync/              BUSY → Supabase sync (index.mjs entry, check.mjs self-test)
  busy-query.mjs          guarded read-only BUSY Web Service client
  busy-sql/discover.mjs   one-off read-only SQL Server discovery
  check-search.ts         search/classifier self-test
supabase/                 SQL migrations, run by hand in the SQL editor (see HANDOVER.md for order)
docs/                     exclusions draft (the BUSY schema report is local-only, gitignored)
```

Brand name, prices-incl-GST flag, low-stock threshold and page size live in `src/lib/site.ts`, and nowhere else.

## Run locally

1. Copy `.env.example` to `.env.local`. The site needs `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
   SK-image also needs the three Cloudinary vars. Full list in [HANDOVER.md](HANDOVER.md#environment-variables).
2. `npm install`, then `npm run dev`.
3. Checks: `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm run check:search`, `npm run sync:check`.

## Data notes

- `catalog_view` = active, non-excluded BUSY items + active manual products. BUSY price/stock appear only when the
  sync's visibility flags are on (same masking as `public_catalog_list()`); no cost fields exist anywhere.
- Categories are a draft keyword classifier (`src/lib/categories.ts`), computed at render time. Search slang → item codes
  in `src/lib/search-aliases.ts`.
- Photos: max 8 per product, jpg/png/webp, ≤ 10 MB; the first becomes the cover. Enforced by the DB trigger in
  `supabase/sk-image.sql` as well as the UI. The BUSY sync never touches `products_manual` or `product_media`.
