-- Handover audit follow-ups — MIGRATION FILE ONLY. NOT APPLIED. Run once in Supabase Dashboard -> SQL Editor,
-- after sk-image.sql. Re-runnable. Nothing here changes BUSY sync behaviour.

-- ─── product_media: only our own Cloudinary assets ─────────────────────────────────────────────────────────
-- The app signs every upload into sk-image/<source>/<key>/ on res.cloudinary.com. Enforce that in the table too, so a
-- signed-in user can't point a row at some other Cloudinary asset (the delete route would then destroy it) or at a
-- non-Cloudinary URL (hotlinking on the public site). Fails loudly if an existing row breaks the rule.
alter table public.product_media drop constraint if exists product_media_own_asset;
alter table public.product_media add constraint product_media_own_asset check (
  cloudinary_public_id like 'sk-image/' || source || '/' || product_key || '/%'
  and url like 'https://res.cloudinary.com/%'
);

-- ─── Sync health, for the SK-image portal ──────────────────────────────────────────────────────────────────
-- One row per sync job: last successful finish, last run (any status) and its error, plus the catalog size.
-- security definer because sync_runs / busy_items have RLS with no policies. Staff (authenticated) only, not anon.
create or replace function public.sync_health()
returns table (job text, last_ok_at timestamptz, last_run_at timestamptz, last_status text, last_error text, catalog_items bigint)
language sql
stable
security definer
set search_path = public
as $$
  select j.job,
         (select max(s.finished_at) from public.sync_runs s where s.job = j.job and s.status = 'OK'),
         r.finished_at,
         r.status,
         r.error,
         (select count(*) from public.busy_items b where b.is_active and not b.exclude_from_catalog)
    from (values ('items'), ('stock'), ('full')) as j (job)
    left join lateral (
      select s.finished_at, s.status, s.error from public.sync_runs s where s.job = j.job order by s.finished_at desc limit 1
    ) r on true;
$$;
revoke all on function public.sync_health() from public, anon;
grant execute on function public.sync_health() to authenticated;

-- ─── Indexes ────────────────────────────────────────────────────────────────────────────────────────────────
-- None added on purpose. product_media lookups by (source, product_key) already use the unique
-- (source, product_key, cloudinary_public_id) index. The catalog is ~1.4k rows: the portal's ILIKE search and filters
-- on catalog_view are sequential scans that cost ~1 ms, and the site reads the whole view once per 5 minutes anyway.
-- When the catalog passes ~50k rows, add trigram indexes for the portal search:
--   create extension if not exists pg_trgm;
--   create index busy_items_name_trgm on public.busy_items using gin (coalesce(display_name, busy_name) gin_trgm_ops);
--   create index products_manual_name_trgm on public.products_manual using gin (name gin_trgm_ops);
