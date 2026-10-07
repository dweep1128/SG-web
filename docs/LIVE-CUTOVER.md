# Live cutover — paste-ready, in order

Prepared 2026-10-06. **Nothing here has been applied to the live Supabase project or deployed.** Everything below was
rehearsed on a throwaway local database rebuilt to match live (schema → finish-setup → busy-sync → busy-catalog-list →
sk-image → handover-audit) and replayed in the order below. Live was only read with the public anon key. No service-role
key was used or is needed for any step here: SQL goes in the Supabase SQL Editor (it runs as the project owner).

## ⚠ Correction first — do not run the plain `revoke` yet

My earlier report said the `public_catalog_list` / `public_catalog_item` revokes could be run today with no site impact.
**That was wrong.** The currently deployed production `main` fetches its whole catalog with
`rpc("public_catalog_list")` (`git show main:src/lib/catalog.ts`) and computes In stock / Low stock from its `stock_qty`.
Revoking now would make every catalog page on the live site error out until the new site is deployed.

Rehearsed result: the literal revoke makes the RPC return `42501 permission denied`.

So Step 1 is a **non-breaking stopgap** instead: the same functions with the same signatures, but `stock_qty` becomes a
bucket (`11` = more than 10, `1` = 1–10, `null` = none/unverified). I replayed production's own logic on test data
(edge cases 1737, 7, 10, 0, −4, null, unverified): the In / Low / Check-availability result was identical before and after.
The literal revoke is Step 7, after the new site is live (it is already inside `stock-status-only.sql`).

What anon can read on live today (probed read-only with the public key):

| Path | Today |
|---|---|
| `public_catalog_item(1291)` | returns the exact count |
| `public_catalog_list()` | exact count for every item |
| `catalog_view` (`stock` column) | exact count, non-null for 432 products |
| `products` (legacy demo table) | `stock`, `available_quantity` readable |
| `admin_catalog`, `public_sync_status` | do not exist → `live-sync-admin.sql` is **not applied** |
| `catalog_view` columns | no `display_name` → `display-name.sql` is **not applied** |
| `handover-audit.sql` | **cannot be told from anon** (PostgREST hides functions anon can't run). Use the Step 4 query. |

---

## Step 0 — set up the checks (your machine, nothing is written)

Values come from your own `.env` / Supabase dashboard. **Use the publishable (anon) key only**: the scripts refuse a
secret or `service_role` key, load no `.env` file, and never print the key.

```bash
# bash
export LIVE_SUPABASE_URL="https://<project>.supabase.co"
export LIVE_SUPABASE_ANON_KEY="sb_publishable_..."
export LIVE_SITE_URL="https://<your production URL>"     # only needed for check:stock / check:leaks
```
```powershell
# PowerShell
$env:LIVE_SUPABASE_URL = "https://<project>.supabase.co"
$env:LIVE_SUPABASE_ANON_KEY = "sb_publishable_..."
$env:LIVE_SITE_URL = "https://<your production URL>"
```

Baseline, before touching anything (expect **5 FAIL**, which confirms the leak):

```bash
npm run check:live-anon
```

## Step 1 — Stopgap SQL (run first, on its own)

File: `supabase/leak-stopgap.sql` (identical to the block below). Supabase Dashboard → SQL Editor → paste → Run.
Re-runnable. Changes no data, no table structure.

- **Part A**: the two RPCs return a bucket instead of the quantity (signatures unchanged: `(integer)` each).
- **Part B**: anon/authenticated can no longer select the quantity column of `catalog_view` (column-level grants, built
  from whatever columns the view has) and no longer read the legacy `products` table.

```sql
-- LEAK STOPGAP — safe to run on the LIVE project while production `main` is still deployed. Re-runnable.
-- Paste into Supabase Dashboard -> SQL Editor. Changes no table data.
--
-- Production `main` calls public_catalog_list() and computes "In stock" / "Low stock" from its stock_qty
-- (low = quantity <= 10). Revoking that function would take the live catalog down, so instead the function keeps its
-- exact signature and columns but returns a BUCKET instead of the real count: 11 = more than 10 (In stock),
-- 1 = 1..10 (Low stock), null = nothing in stock / not verified. Production keeps working and no real quantity is returned.
-- The threshold 10 mirrors LOW_STOCK_THRESHOLD in main's src/lib/site.ts.

-- ─── PART A: the two RPCs return a bucket, not the quantity ────────────────────────────────────────────────
create or replace function public.public_catalog_list(p_busy_code integer default null)
returns table (
  busy_code integer, busy_name text, hsn_code text, unit_name text, gst_pct numeric,
  busy_group_name text, price numeric, stock_status text, stock_qty numeric,
  stock_synced_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.busy_code,
         coalesce(b.display_name, b.busy_name),
         b.hsn_code,
         b.unit_name,
         b.gst_pct,
         b.busy_group_name,
         case when b.price_visible then b.sale_price end,
         case when b.stock_visible then case when b.stock_qty > 0 then 'in_stock' else 'ask' end end,
         case when b.stock_visible and b.stock_qty > 0 then (case when b.stock_qty > 10 then 11 else 1 end)::numeric end,
         case when b.stock_visible then b.stock_synced_at end
    from public.busy_items b
   where b.is_active
     and not b.exclude_from_catalog
     and (p_busy_code is null or b.busy_code = p_busy_code)
   order by b.busy_name;
$$;

create or replace function public.public_catalog_item(p_busy_code integer)
returns table (busy_code integer, busy_name text, unit_name text, gst_pct numeric, price numeric, stock_status text, stock_qty numeric)
language sql
stable
security definer
set search_path = public
as $$
  select b.busy_code,
         coalesce(b.display_name, b.busy_name),
         b.unit_name,
         b.gst_pct,
         case when b.price_visible then b.sale_price end,
         case when b.stock_visible then case when b.stock_qty > 0 then 'in_stock' else 'ask' end end,
         case when b.stock_visible and b.stock_qty > 0 then (case when b.stock_qty > 10 then 11 else 1 end)::numeric end
    from public.busy_items b
   where b.busy_code = p_busy_code
     and b.is_active
     and not b.exclude_from_catalog;
$$;
-- create or replace keeps the existing grants (anon + authenticated execute), which production still needs.

-- ─── PART B: catalog_view and the legacy demo table stop exposing quantities ───────────────────────────────
-- Production main does not read catalog_view or products, so this cannot affect it. Column-level grants: every column of
-- the view EXCEPT quantity-like ones (stock, stock_qty, ...; stock_status and stock_synced_at are allowed). The column
-- list is read from the view, so the same block works before and after display-name.sql. `select *` on the view is then
-- denied for anon; the new site lists its columns explicitly.
-- RE-RUN PART B after live-sync-admin.sql and after display-name.sql: each of them re-creates the view's grants.
-- stock-status-only.sql removes the column for good and makes this part unnecessary.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'catalog_view'
     and (column_name !~* '(stock|qty|quantity|available)' or column_name in ('stock_status', 'stock_synced_at'));
  execute 'revoke select on public.catalog_view from anon, authenticated';
  execute format('grant select (%s) on public.catalog_view to anon, authenticated', cols);
end $$;

revoke select on public.products from anon, authenticated; -- legacy demo table with available_quantity; unused by every site version
```

## Step 2 — Verify (the leak is closed, production still works)

**A. In the SQL Editor** — who can still execute the two functions and read the view's quantity column:

```sql
select p.oid::regprocedure::text as function, r.role,
       has_function_privilege(r.role, p.oid, 'execute') as can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) r(role)
 where n.nspname = 'public' and p.proname in ('public_catalog_list', 'public_catalog_item')
 order by 1, 2;

select r.role, has_column_privilege(r.role, 'public.catalog_view', 'stock', 'select') as can_read_view_stock
  from (values ('anon'), ('authenticated')) r(role);
```

Expected now: `can_execute = true` for all four rows (**intended**: production still needs them; they return buckets only)
and `can_read_view_stock = false` for both.
Expected after Step 7: `can_execute = false` everywhere.

**B. From your machine:**

```bash
npm run check:live-anon -- --interim
```
Expected: 5 × PASS (RPCs show "bucket values only", `catalog_view` and `products` denied).
Without `--interim` the two RPC lines still FAIL on purpose (the column is still there until Step 7).

**C. By hand (not scriptable):** open the production site, load `/parts`, open one product. Pages must render as before
with In stock / Low stock labels. If any catalog page errors, stop and tell me; Part A is the only thing that could cause it.

## Step 3 — Roles (before any migration)

**How roles are stored.** In `auth.users.raw_app_meta_data ->> 'role'` (so in the login's JWT `app_metadata.role`):
`'owner'` or `'staff'`. It is not a table or an enum. Only the service role or SQL can write it, so a user can't grant
themselves a role. The migrations (`live-sync-admin.sql`) change RLS to require it, so **a login with no role loses
portal access** the moment that file runs. (`public.profiles.role` — enum `customer/staff/admin` — is the *legacy* demo
role; the new code ignores it. Shown in the list below for reference only.)

**3a. See who exists and who needs a role:**

```sql
select u.id, u.email, u.raw_app_meta_data ->> 'role' as portal_role, p.role::text as legacy_profile_role,
       u.last_sign_in_at, u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
 order by u.created_at;
```

Anyone you don't recognise is someone who signed up while sign-ups were open (AUDIT #2). **Give them no role**, and turn
off Dashboard → Authentication → Sign In / Providers → *Allow new users to sign up* first.

**3b. Assign (replace the placeholders; each statement shows what it changed):**

```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'owner')
 where lower(email) = lower('OWNER_EMAIL@example.com')
returning email, raw_app_meta_data ->> 'role' as portal_role;

update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'staff')
 where lower(email) in (lower('STAFF_EMAIL_1@example.com'), lower('STAFF_EMAIL_2@example.com'))
returning email, raw_app_meta_data ->> 'role' as portal_role;
```

Each should return the rows you expect (0 rows = typo in the email). Remove a role (keeps the account):
`update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where lower(email) = lower('x@example.com');`

Everyone must **sign out and back in**: the role is read from the JWT, which is issued at login.
Rehearsed: after this SQL, a fresh sign-in has `app_metadata.role = owner/staff`, and a user with no role has none.

## Step 4 — Migrations, in order

Run each file's whole text in the SQL Editor. **Where am I?** (read-only; run before starting and after every file):

```sql
select
  (exists (select 1 from pg_constraint where conname = 'product_media_own_asset') and to_regprocedure('public.sync_health()') is not null) as "1 handover-audit",
  (to_regclass('public.sync_status') is not null and to_regprocedure('public.portal_role()') is not null and to_regclass('public.admin_catalog') is not null) as "2 live-sync-admin",
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'catalog_view' and column_name = 'source_name') as "3 display-name",
  (to_regprocedure('public.stock_status_of(numeric, boolean)') is not null) as "4 stock-status-only";
```

Expected before you start: `?, f, f, f` (the `?` is the handover-audit answer I couldn't get from outside).

**Every migration that re-creates `catalog_view` resets its grants, which reopens the quantity column** (rehearsed:
probe went back to FAIL). So after steps **4b and 4c, immediately re-run `supabase/leak-stopgap.sql`** (safe to repeat).

| # | File | What it changes | Confirms it applied | If it was already applied |
|---|---|---|---|---|
| 4a | `handover-audit.sql` | `product_media_own_asset` constraint (photos must be our own Cloudinary assets); `sync_health()` function | column 1 of the query above is `true` | **No error** (drop-if-exists / create-or-replace). Only possible failure: `23514 check constraint "product_media_own_asset" is violated by some row` if an existing photo row points outside `sk-image/<source>/<key>/` on res.cloudinary.com. Live `product_media` looked empty from anon, but anon only sees public rows: unverified. |
| 4b | `live-sync-admin.sql` | role functions, `busy_items.hidden/description/last_synced_at`, `products_manual.display_name/in_stock`, staff-only RLS (was: any signed-in user), column grants, `sync_status`, `record_sync_run`, `public_sync_status`, `portal_sync_status`, rebuilt `catalog_view` + new `admin_catalog` | column 2 is `true` | **No error if run again before 4c.** After 4c (or 4d) it fails: `ERROR: cannot drop columns from view` (or the new guard message below). Don't re-run it. |
| 4c | `display-name.sql` | recreates `catalog_view` / `admin_catalog` with `display_name` and `source_name` | column 3 is `true` | **No error**, even repeated. After 4d it now stops with `stock-status-only.sql is already applied; re-running this file would put the stock column back. Skip it.` |
| 4d | `stock-status-only.sql` | **run after the deploy (Step 6)**. `catalog_view` loses `stock`, gains `low_stock`; `stock_low_threshold()` / `stock_status_of()`; `products_manual.busy_code`; revokes the RPCs, legacy tables, `create_quote_request`; leaves Realtime | column 4 is `true` | **No error** (NOTICEs only). |

The two guards were added this session to `live-sync-admin.sql` and `display-name.sql` (raise an exception if
`stock_status_of` exists), because rehearsal showed a stray re-run of `display-name.sql` after 4d silently re-created the
view *with* the quantity column.

**Order of the whole thing** (rehearsed end to end; production's RPC kept returning correct data after each of 4a–4c):

1. Step 1 stopgap → Step 2 verify
2. Step 3 roles
3. `handover-audit.sql` (if the "where am I" column 1 is not `true`)
4. `live-sync-admin.sql` → re-run `leak-stopgap.sql` → `check:live-anon -- --interim`
5. `display-name.sql` → re-run `leak-stopgap.sql` → `check:live-anon -- --interim`
6. **Deploy the new site** (Step 6)
7. `stock-status-only.sql` (Step 7)

Take the CSV exports of `busy_items`, `products_manual`, `product_media` before 4b (the Free plan has no backups).

## Step 5 — Sync server after 4b/4c

The sync's new code needs `live-sync-admin.sql` (it calls `record_sync_run`). Don't start the new sync server or n8n
workflow before 4b. Setup order is in NOTES.md → "Deploy — in this order", steps 4–6.

## Step 6 — Deploy notes (you do this; I did not)

- `git checkout main && git merge chore/handover-audit` brings in SK-image too (AUDIT intro). Nothing is committed yet:
  commit first.
- Vercel env: only the 9 site variables in `docs/PRE-DEPLOY-REPORT.md` §5. Unconfirmed: whether the Vercel project
  currently holds sync/BUSY secrets (AUDIT #6).
- After the deploy finishes and the site shows your catalog, run `check:stock -- --live` (below) *before* Step 7 and
  confirm product pages open.

## Step 7 — Close it for good, then verify again

1. Run `supabase/stock-status-only.sql` (it contains the literal revoke, exact signatures from the migrations):

   ```sql
   revoke execute on function public.public_catalog_list(integer) from public, anon, authenticated;
   revoke execute on function public.public_catalog_item(integer) from public, anon, authenticated;
   ```

   **Run the file, not only these two lines, once the new site is live.** If you run only the two lines while production
   `main` is still deployed, the live site breaks (see the correction at the top).
2. Re-run the Step 2A SQL: expect `can_execute = false` in all four rows. Re-run "where am I": expect `?/t, t, t, t`.
3. From your machine, all read-only:

```bash
npm run check:live-anon          # expect 5 PASS: both RPCs denied, no quantity column anywhere
npm run check:stock -- --live    # needs LIVE_SITE_URL
npm run check:leaks -- --live    # needs LIVE_SITE_URL
```

What each does with only the three env vars:

- **`check:live-anon`** calls `public_catalog_item(1291)`, `public_catalog_list()`, `catalog_view?select=*&limit=1`,
  `catalog_view?select=stock`, and `products`. PASS = denied, or no quantity-like column returned. FAIL = any
  quantity-like column comes back, even as `null` in the sampled row (one row can't prove the column is gone).
  The `--interim` flag is only for Step 2.
- **`check:stock -- --live`** reads `catalog_view` completely (anon), asserts no quantity column and valid statuses,
  and checks the site's `/api/search-index` shows the same status as the view for every product present on both.
  It **cannot** compare against raw BUSY quantities (anon can't read them, by design); that stays a local test
  (`check:stock -- --db`). It fails if nothing could be compared.
- **`check:leaks -- --live`** crawls the live site (pages, RSC payloads, sitemap, APIs, every JS chunk, `.map` files) for
  quantity fields, "only N left" text, BUSY database / login names, key shapes, Tailscale addresses, cost fields.
  It reads no `.env`, so it doesn't look for your actual secret *values* (the local run does).
  It sends ~100–300 GET requests; run it once, not in a loop.

## Could not verify (flagged)

1. **Whether `handover-audit.sql` is applied on live**: anon can't see it. Use the "where am I" query.
2. **Live data vs. `product_media_own_asset`**: any existing photo row outside Cloudinary `sk-image/…` fails 4a (possible only if rows exist; anon saw none).
3. **Whether the Supabase SQL Editor runs a pasted script as one transaction.** Assumed *not guaranteed*: if a file errors halfway, run "where am I", then re-run the file (all are re-runnable except where marked).
4. **Which branch / URL Vercel deploys as production** and what env it holds: no Vercel access. I inferred production = `main` from `PROGRESS.md` and git; the Step 2C hand-check is how you'd catch a mistake.
5. **Existing live logins**: I only know the AUDIT's note that both have legacy `customer` role. Step 3a shows the truth.
6. **`check:leaks --live` against your real domain**: tested against my local build only.
7. **Interim state, Step 4a–6:** between `display-name.sql` and the deploy, the production site is unchanged and the quantity column is closed by Part B. If you skip re-running `leak-stopgap.sql` after 4b/4c, the view is open again until the next re-run.
8. The old production site on `main` never reads `catalog_view`, `display_name` or the portal, so none of 4a–4c affect it. Verified by reading `main`'s source, not by running it.
