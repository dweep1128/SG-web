# Admin access

Base URL: `https://www.sktraders.org.in` (until the domain is connected the site runs on `sg-web-bice.vercel.app`).
There is **one** admin portal, SK-image. There is no `/admin` or `/dashboard` route. `supabase/live-sync-admin.sql` is a
database migration (roles, RLS, `admin_catalog` view), not a page.

## Portals

| Portal | URL | Who can access | Login method |
|---|---|---|---|
| Login page | https://www.sktraders.org.in/sk-image/login | Anyone can see the form; only `owner` / `staff` get in | Supabase Auth, email + password (no magic link, no signup) |
| Products list (portal home): search products, open one to edit | https://www.sktraders.org.in/sk-image | owner, staff | same session |
| Add Product: create a portal-only product (auto SKU `M<id>`), owner can permanently delete | https://www.sktraders.org.in/sk-image/add | owner, staff (delete: owner only) | same session |
| Product photos/details: upload/delete photos, set display name, hide | https://www.sktraders.org.in/sk-image/p/{busy\|manual}/{id} | owner, staff | same session |
| API (used by the pages above) | `/api/sk-image/{sign,delete,delete-product,revalidate}` | owner, staff (`delete-product`: owner only) | same session; 401 if signed out |

`/api/sync-status` is public (used by n8n and the stale-data banner), not an admin page.

## How access is enforced

- `src/middleware.ts` matches `/sk-image/*` and `/api/sk-image/*`. It reads the Supabase session cookie and checks
  `app_metadata.role` is `owner` or `staff` (`roleOf` in `src/lib/sk-image.ts`). Also rejects cross-site writes (CSRF origin check).
- Signed out, or signed in **without** a role: pages redirect to `/sk-image/login?next=...`, API calls get `401`.
- At login, an account with a valid password but no role is signed straight back out with "This account has no portal access."
- Second and third locks: API routes call `requireStaff()` (`src/lib/supabase-server.ts`); database RLS uses `is_portal_staff()` /
  `portal_role()` (`supabase/live-sync-admin.sql`).
- `app_metadata` can only be written with the Supabase service-role key, so users cannot grant themselves a role.

| Role | Can do |
|---|---|
| `owner` | Everything staff can, plus permanently delete portal-added products |
| `staff` | View all products, edit display name / description / hidden, add products, upload and delete photos |
| none / customer | Nothing in the portal. The public site needs no login |

(`profiles.role = admin` in `supabase/schema.sql` is an older, separate mechanism. The portal does not use it.)

## Who can log in

The repo contains **no real owner or staff emails**. Only placeholders (`OWNER_EMAIL@example.com`, `OWNER@EXAMPLE`,
`YOUR_EMAIL@example.com`) and the local-test accounts seeded by `scripts/local/seed.mjs` (`owner@local.test`,
`staff@local.test`, `norole@local.test`). Those exist only on a local database; the seed script refuses non-localhost URLs.
The real list lives in Supabase: Authentication → Users (filter on `raw_app_meta_data->>'role'`).

**Passwords are not stored in the repo.** Supabase keeps only hashes. `scripts/admin-user.mjs` prints a generated password once
at creation and nowhere else.

## Domain readiness

Hardcoded site URLs (all of them):

| File:line | What |
|---|---|
| `HANDOVER.md:15` | Prose: "site runs on `sg-web-bice.vercel.app`" |
| `PROGRESS.md:41` | Prose: deployment log entry for `https://sg-web-bice.vercel.app` |
| `src/lib/site.ts:23` | Fallback `http://localhost:3000` when no site URL env var is usable (dev only) |

No code, env example, or auth-redirect config hardcodes `sg-web-bice.vercel.app` or `sktraders.org.in`.
The code never sets `redirectTo` / `emailRedirectTo`, so the **Supabase dashboard Site URL and Redirect URLs** decide where
password-recovery emails send people. Those are not in the repo.

Env vars that hold a site URL (names only):

- `NEXT_PUBLIC_SITE_URL`: canonical origin for metadata, sitemap, robots (`src/lib/site.ts`). Falls back to `VERCEL_PROJECT_PRODUCTION_URL`.
- `VERCEL_PROJECT_PRODUCTION_URL`: set by Vercel, fallback for the above.
- `SITE_URL`: n8n host env, used by the workflow to call `/api/sync-status`.
- `LIVE_SITE_URL`: shell only, for `check:stock --live` and `check:leaks --live`.

Related, not a URL: `NEXT_PUBLIC_ALLOW_INDEXING` is `false` by default (robots `Disallow: /` + noindex). Flip it when the domain goes live.

## To do before handover

- [ ] **Reset the owner/staff passwords.** Supabase → Authentication → Users → the user → **Send password recovery**. Do this after the
      Site URL below is set, or the recovery link will point at the wrong host.
- [ ] **Confirm the owner role.** Supabase → Authentication → Users → the owner → check `raw_app_meta_data` contains `"role": "owner"`
      (or run `node scripts/admin-user.mjs <email> owner`). The owner must sign out and in again to pick it up.
- [ ] Confirm every other login is `staff`, and remove accounts that should not have access (`... <email> none` or Delete user).
- [ ] Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" **off** (HANDOVER.md §4).
- [ ] Supabase → Authentication → URL Configuration: set **Site URL** to `https://www.sktraders.org.in` and add it to Redirect URLs.
- [ ] Vercel: add the domain, set `NEXT_PUBLIC_SITE_URL=https://www.sktraders.org.in`, redeploy.
- [ ] n8n: set `SITE_URL` to the same origin.
- [ ] Set `NEXT_PUBLIC_ALLOW_INDEXING=true` only when the owner wants the site in search engines.
