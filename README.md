# SK Traders storefront

## Run locally

1. Copy `.env.example` to `.env.local` and add the Supabase URL, publishable key and WhatsApp number.
2. In Supabase, open **SQL Editor**, paste and run [`supabase/schema.sql`](./supabase/schema.sql).
3. Add products, images and compatibility data through Supabase Table Editor (or the admin page after assigning your account the `admin` role).
4. Run `npm install` then `npm run dev`.

## Architecture

- Next.js: storefront, catalogue, account and protected admin area.
- Supabase: Postgres, authentication, product data, product images and quote-request data.
- Vercel: production hosting.

The browser only receives the Supabase **publishable** key. Never put a service-role key in `NEXT_PUBLIC_*` variables.
