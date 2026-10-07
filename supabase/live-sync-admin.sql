-- Live BUSY sync + admin portal — MIGRATION FILE ONLY. NOT APPLIED. Run once in Supabase Dashboard -> SQL Editor,
-- after handover-audit.sql. Re-runnable.
--
-- BEFORE running: give every existing SK-image login a role, or it loses portal access (policies below check it):
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"owner"}' where email = 'OWNER@EXAMPLE';
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"staff"}' where email = 'STAFF@EXAMPLE';
-- (or `node scripts/admin-user.mjs <email> owner|staff`). Users must sign out and in again to pick up the role.

-- Guard: stock-status-only.sql removed the quantity column from catalog_view. Re-running this file would re-create the
-- view WITH it. If you see this error, skip this file: it is already applied.
do $$
begin
  if to_regprocedure('public.stock_status_of(numeric, boolean)') is not null then
    raise exception 'stock-status-only.sql is already applied; re-running this file would put the stock column back. Skip it.';
  end if;
end $$;

-- ─── Roles ──────────────────────────────────────────────────────────────────────────────────────────────────
-- Read from app_metadata in the JWT: only the service role can set it, so a user can't grant themselves a role.
-- Named portal_* because the legacy public.is_staff() (profiles-based, schema.sql) still exists and is left alone.
create or replace function public.portal_role()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

create or replace function public.is_portal_staff()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.portal_role() in ('owner', 'staff');
$$;

-- ─── Admin-owned columns (the sync never writes these) ─────────────────────────────────────────────────────
alter table public.busy_items add column if not exists description text;
alter table public.busy_items add column if not exists hidden boolean not null default false;
alter table public.busy_items add column if not exists last_synced_at timestamptz; -- set by the sync on every write to the row

alter table public.products_manual add column if not exists display_name text;
-- Used only when stock is empty: lets staff say "in stock" without counting.
alter table public.products_manual add column if not exists in_stock boolean not null default false;

-- ─── Staff access to busy_items: read all, update ONLY display_name / description / hidden ─────────────────
-- Price and stock stay sync-owned: column privileges make any other update fail, whatever the client sends.
revoke all on public.busy_items from anon, authenticated; -- anon never reads it directly (catalog_view masks it)
grant select on public.busy_items to authenticated;
grant update (display_name, description, hidden) on public.busy_items to authenticated;
drop policy if exists "busy_items staff read" on public.busy_items;
drop policy if exists "busy_items staff edit" on public.busy_items;
create policy "busy_items staff read" on public.busy_items for select to authenticated using (public.is_portal_staff());
create policy "busy_items staff edit" on public.busy_items for update to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());

-- ─── Portal products + photos: staff only (was: any signed-in user); permanent delete is owner only ────────
drop policy if exists "products_manual staff all" on public.products_manual;
drop policy if exists "products_manual staff read" on public.products_manual;
drop policy if exists "products_manual staff insert" on public.products_manual;
drop policy if exists "products_manual staff update" on public.products_manual;
drop policy if exists "products_manual owner delete" on public.products_manual;
create policy "products_manual staff read" on public.products_manual for select to authenticated using (public.is_portal_staff());
create policy "products_manual staff insert" on public.products_manual for insert to authenticated with check (public.is_portal_staff());
create policy "products_manual staff update" on public.products_manual for update to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "products_manual owner delete" on public.products_manual for delete to authenticated using (public.portal_role() = 'owner');

drop policy if exists "product_media staff insert" on public.product_media;
drop policy if exists "product_media staff update" on public.product_media;
drop policy if exists "product_media staff delete" on public.product_media;
create policy "product_media staff insert" on public.product_media for insert to authenticated with check (public.is_portal_staff());
create policy "product_media staff update" on public.product_media for update to authenticated using (public.is_portal_staff()) with check (public.is_portal_staff());
create policy "product_media staff delete" on public.product_media for delete to authenticated using (public.is_portal_staff());

-- ─── Sync: 'delta' job, global status, run logging ─────────────────────────────────────────────────────────
alter table public.sync_runs drop constraint if exists sync_runs_job_check;
alter table public.sync_runs add constraint sync_runs_job_check check (job in ('items', 'stock', 'full', 'delta'));

-- One row. last_ok_at is the global "last_synced_at": every item was confirmed against BUSY at that moment.
-- last_change_at moves only when a run actually wrote something; the website uses it as its cache version.
create table if not exists public.sync_status (
  id                   boolean primary key default true check (id),
  last_run_at          timestamptz,
  last_status          text,
  last_error           text,
  last_ok_at           timestamptz,
  last_change_at       timestamptz,
  consecutive_failures integer not null default 0
);
alter table public.sync_status enable row level security; -- no policies: service role + the functions below only

-- Called once per run by the sync (service role). Updates sync_status and appends to sync_runs only when the run is
-- worth keeping — it changed data, it was a full run, or the status flipped — so a 60 s poll doesn't write
-- 1,440 log rows a day. Returns the previous status so the caller can alert on transitions only.
create or replace function public.record_sync_run(p_run jsonb)
returns text
language plpgsql
set search_path = public
as $$
declare
  prev   text;
  ok     boolean := p_run ->> 'status' = 'OK';
  at     timestamptz := (p_run ->> 'finished_at')::timestamptz;
  change boolean := coalesce((p_run ->> 'changes')::integer, 0) > 0;
begin
  select last_status into prev from public.sync_status where id for update;
  insert into public.sync_status as s (id, last_run_at, last_status, last_error, last_ok_at, last_change_at, consecutive_failures)
  values (true, at, p_run ->> 'status', p_run ->> 'error', case when ok then at end, case when ok and change then at end, case when ok then 0 else 1 end)
  on conflict (id) do update set
    last_run_at = excluded.last_run_at,
    last_status = excluded.last_status,
    last_error = excluded.last_error,
    last_ok_at = coalesce(excluded.last_ok_at, s.last_ok_at),
    last_change_at = coalesce(excluded.last_change_at, s.last_change_at),
    consecutive_failures = case when ok then 0 else s.consecutive_failures + 1 end;

  if change or p_run ->> 'job' <> 'delta' or prev is distinct from p_run ->> 'status' then
    insert into public.sync_runs (job, status, started_at, finished_at, duration_ms, busy_db, counts, details, error)
    values (p_run ->> 'job', p_run ->> 'status', (p_run ->> 'started_at')::timestamptz, at, (p_run ->> 'duration_ms')::integer,
            p_run ->> 'busy_db', coalesce(p_run -> 'counts', '{}'), coalesce(p_run -> 'details', '{}'), p_run ->> 'error');
  end if;
  return prev;
end;
$$;
revoke all on function public.record_sync_run(jsonb) from public, anon, authenticated;
grant execute on function public.record_sync_run(jsonb) to service_role;

-- Public health for /api/sync-status and the site's "Stock updated at". No error text (it can name hosts).
create or replace function public.public_sync_status()
returns table (last_ok_at timestamptz, last_change_at timestamptz, last_run_at timestamptz, last_status text)
language sql
stable
security definer
set search_path = public
as $$
  select last_ok_at, last_change_at, last_run_at, last_status from public.sync_status where id;
$$;
revoke all on function public.public_sync_status() from public;
grant execute on function public.public_sync_status() to anon, authenticated;

-- Stock writes now also stamp last_synced_at. The sync sends only rows whose quantity changed (plus all on full).
create or replace function public.apply_busy_stock(p_stock jsonb, p_synced_at timestamptz, p_visible boolean)
returns integer
language sql
set search_path = public
as $$
  with updated as (
    update public.busy_items b
       set stock_qty = s.stock_qty,
           stock_synced_at = p_synced_at,
           stock_visible = p_visible,
           last_synced_at = p_synced_at
      from jsonb_to_recordset(p_stock) as s (busy_code integer, stock_qty numeric)
     where b.busy_code = s.busy_code
    returning 1
  )
  select count(*)::integer from updated;
$$;
revoke all on function public.apply_busy_stock(jsonb, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.apply_busy_stock(jsonb, timestamptz, boolean) to service_role;

-- sync_health() (handover-audit.sql) only knew items/stock/full; the portal now reads sync_status directly.
create or replace function public.portal_sync_status()
returns table (last_ok_at timestamptz, last_run_at timestamptz, last_status text, last_error text, consecutive_failures integer, catalog_items bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.last_ok_at, s.last_run_at, s.last_status, s.last_error, s.consecutive_failures,
         (select count(*) from public.busy_items b where b.is_active and not b.exclude_from_catalog)
    from (select true as id) one
    left join public.sync_status s on s.id
   where public.is_portal_staff();
$$;
revoke all on function public.portal_sync_status() from public, anon;
grant execute on function public.portal_sync_status() to authenticated;

-- ─── Public catalog: + hidden filter, admin display name / description, out-of-stock state ─────────────────
-- Same columns as before (sk-image.sql), so `create or replace` works. Still owner-privileged with explicit masking.
-- stock_status: 'in_stock' | 'out_of_stock' | 'ask' (stock not verified yet → "Check availability") | null
create or replace view public.catalog_view as
select c.*,
       (select m.url
          from public.product_media m
         where m.source = c.source and m.product_key = c.product_key
         order by m.is_primary desc, m.sort_order, m.id
         limit 1) as primary_image_url
  from (
    select 'busy'::text                              as source,
           b.busy_code::text                         as product_key,
           coalesce(nullif(btrim(b.display_name), ''), b.busy_name) as name,
           b.busy_code::text                         as sku,
           b.busy_group_name                         as category,
           case when b.price_visible then b.sale_price end as price,
           case when b.stock_visible and b.stock_qty > 0 then b.stock_qty end as stock,
           case when b.stock_visible then case when b.stock_qty > 0 then 'in_stock' else 'out_of_stock' end else 'ask' end as stock_status,
           case when b.stock_visible then b.stock_synced_at end as stock_synced_at,
           b.hsn_code,
           b.unit_name,
           b.gst_pct,
           b.description
      from public.busy_items b
     where b.is_active and not b.exclude_from_catalog and not b.hidden
    union all
    select 'manual',
           p.id::text,
           coalesce(nullif(btrim(p.display_name), ''), p.name),
           p.sku,
           p.category,
           p.price,
           case when p.stock > 0 then p.stock end,
           case when p.stock > 0 or (p.stock is null and p.in_stock) then 'in_stock' else 'out_of_stock' end,
           null::timestamptz,
           null::text,
           null::text,
           null::numeric,
           p.description
      from public.products_manual p
     where p.is_active
  ) c;
revoke all on public.catalog_view from public, anon, authenticated;
grant select on public.catalog_view to anon, authenticated;

-- ─── Portal list: everything staff can manage, hidden included ─────────────────────────────────────────────
-- security_invoker: runs with the caller's RLS, so anon sees nothing and staff see what the policies above allow.
-- BUSY rows that are inactive / on the sync's exclusion list are left out: staff can't change those.
create or replace view public.admin_catalog with (security_invoker = true) as
select c.*,
       (select m.url
          from public.product_media m
         where m.source = c.source and m.product_key = c.product_key
         order by m.is_primary desc, m.sort_order, m.id
         limit 1) as primary_image_url
  from (
    select 'busy'::text as source, b.busy_code::text as product_key,
           coalesce(nullif(btrim(b.display_name), ''), b.busy_name) as name, b.busy_name as source_name,
           b.busy_code::text as sku, b.hidden, b.sale_price as price, b.stock_qty as stock
      from public.busy_items b
     where b.is_active and not b.exclude_from_catalog
    union all
    select 'manual', p.id::text, coalesce(nullif(btrim(p.display_name), ''), p.name), p.name, p.sku, not p.is_active, p.price, p.stock
      from public.products_manual p
  ) c;
revoke all on public.admin_catalog from public, anon, authenticated;
grant select on public.admin_catalog to authenticated;
