# Parts storefront (Next.js + Supabase)

Brand name, prices-incl-GST flag, low-stock threshold and page size live in `src/lib/site.ts`, and nowhere else.

## Run locally

1. Copy `.env.example` to `.env.local`. The site itself only needs:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key only)
   - `NEXT_PUBLIC_WHATSAPP_NUMBER`: digits with country code, e.g. `91XXXXXXXXXX`. Empty = WhatsApp buttons disabled.
   - `NEXT_PUBLIC_SITE_URL` (optional; Vercel falls back to the production domain)
2. `npm install`, then `npm run dev`.
3. `npm run check:search` runs the search/classifier self-check.

## Data

The site reads BUSY items only through `public.public_catalog_list()` (`supabase/busy-catalog-list.sql`):
active, non-excluded items; price/stock hidden unless their visibility flags are on; no cost fields.
Fetched server-side in 1000-row pages and cached for 5 minutes (`src/lib/catalog.ts`).

Categories are a draft keyword classifier (`src/lib/categories.ts`), computed at render time; nothing is written to the DB.
Search slang can be mapped to item codes in `src/lib/search-aliases.ts`.

## BUSY sync

`scripts/busy-sync` (see `npm run sync:*`) uses server-only env vars (service role key, BUSY creds). Never prefix those with `NEXT_PUBLIC_`.
