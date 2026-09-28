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

The site reads products only through the `public.catalog_view` view (`supabase/sk-image.sql`): BUSY items + manual
products, active and non-excluded only; BUSY price/stock hidden unless their visibility flags are on (same masking as
`public_catalog_list()`); no cost fields. Fetched server-side in 1000-row pages and cached for 5 minutes (`src/lib/catalog.ts`).
BUSY parts keep their URLs (`/parts/1291`); manual products live at `/parts/m<id>`.

Categories are a draft keyword classifier (`src/lib/categories.ts`), computed at render time; nothing is written to the DB.
Search slang can be mapped to item codes in `src/lib/search-aliases.ts`.

## BUSY sync

`scripts/busy-sync` (see `npm run sync:*`) uses server-only env vars (service role key, BUSY creds). Never prefix those with `NEXT_PUBLIC_`.

## SK-image (staff photo portal)

`/sk-image` — phone-first portal for staff to photograph products and add products that aren't in BUSY.

- **Setup:** run `supabase/sk-image.sql` once in the SQL Editor (creates `products_manual`, `product_media`, `catalog_view`,
  RLS). Then in Supabase Auth turn **off** "Allow new users to sign up" and add each staff user by hand: any signed-in
  user can edit photos and manual products. Set the three Cloudinary env vars.
- **Login:** `/sk-image/login`, Supabase email + password. `src/middleware.ts` gates `/sk-image/*` and `/api/sk-image/*`.
- **Photos:** search (name/SKU), filter, tap a product. "Take photo" uses an in-browser camera: frames are resized to
  1600px JPEG in memory and uploaded straight to Cloudinary (signed by `/api/sk-image/sign`), so nothing is saved to the
  phone gallery. Two uploads at a time; failed ones retry on tap or when the network returns. Max 8 photos/product, 10 MB
  per file, jpg/png/webp. The first photo becomes the cover; the DB trigger enforces both rules.
- **Delete:** `/api/sk-image/delete` removes the Cloudinary asset first, then the row.
- **Site:** cards use the cover at `w_600`, detail pages show every photo at `w_1200`. Changes appear within the 5-minute
  catalog cache.
- The BUSY sync never touches `products_manual` or `product_media`.
