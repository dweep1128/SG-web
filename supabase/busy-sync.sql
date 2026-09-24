-- BUSY → Supabase item/stock sync (v1) — MIGRATION FILE ONLY. NOT APPLIED.
-- Review first, then run once in Supabase Dashboard → SQL Editor (same flow as schema.sql).
--
-- Design: the sync owns public.busy_items outright and never writes public.products.
-- Curated fields (products.name, category_id, images via product_images, description) stay manual.
-- A curated product points at its BUSY item through the new nullable products.busy_code.
-- Existing demo products are untouched: the new column is nullable and nothing is backfilled.

create table if not exists public.busy_items (
  busy_code        integer primary key,              -- Master1.Code (MasterType 6)
  busy_name        text not null,                    -- exactly as in BUSY, double spaces kept
  display_name     text,                             -- manual override shown on site instead of busy_name; sync never writes this
  search_name      text not null,                    -- lower-case, whitespace collapsed
  busy_alias       text,
  busy_print_name  text,
  hsn_code         text,
  busy_stamp       integer not null,                 -- Master1.Stamp; drives incremental pulls
  sale_price       numeric,                          -- Master1.D3 (GUESS until PRICE_VERIFIED)
  price_visible    boolean not null default false,
  gst_pct          numeric,                          -- tax category → MasterSupport.D2
  unit_name        text,
  busy_group_code  integer,                          -- Master1.ParentGrp
  busy_group_name  text,
  busy_deactivated boolean not null default false,   -- Master1.DeactiveMaster
  busy_blocked     boolean not null default false,   -- Master1.BlockedMaster
  missing_from_busy boolean not null default false,  -- code no longer in BUSY; row kept, never deleted
  is_active        boolean not null default true,    -- false if deactivated, blocked or missing
  exclude_from_catalog boolean not null default false, -- set each item sync from scripts/busy-sync/catalog-exclusions.json
  stock_qty        numeric,                          -- Folio1.D1 + SUM(Tran2.Value1) (GUESS until STOCK_VERIFIED)
  stock_visible    boolean not null default false,
  stock_synced_at  timestamptz,
  price_synced_at  timestamptz not null default now(), -- set on every item pull (covers name/HSN/GST/price together)
  created_at       timestamptz not null default now()
);

create table if not exists public.sync_runs (
  id          bigint generated always as identity primary key,
  job         text not null check (job in ('items', 'stock', 'full')),
  status      text not null,                         -- OK | BUSY_CLOSED | NEW_FY_DETECTED | SCHEMA_CHANGED | SANITY_FAILED | PARSE_FAILED | ...
  started_at  timestamptz not null,
  finished_at timestamptz not null,
  duration_ms integer not null,
  busy_db     text,
  counts      jsonb not null default '{}'::jsonb,
  details     jsonb not null default '{}'::jsonb,    -- per-phase / per-query timings, request count, warnings
  error       text
);
create index if not exists sync_runs_started_at_idx on public.sync_runs (started_at desc);

-- No policies on purpose: with RLS on and no policy, only the service role (the server-side sync) can read or write.
-- The website reads through public_catalog_item() below, which honours price_visible / stock_visible.
alter table public.busy_items enable row level security;
alter table public.sync_runs enable row level security;

alter table public.products add column if not exists busy_code integer unique references public.busy_items (busy_code);

-- Stock updates existing busy_items rows only. A plain upsert cannot do this: the insert half would fail NOT NULL busy_name.
create or replace function public.apply_busy_stock(p_stock jsonb, p_synced_at timestamptz, p_visible boolean)
returns integer
language sql
set search_path = public
as $$
  with updated as (
    update public.busy_items b
       set stock_qty = s.stock_qty,
           stock_synced_at = p_synced_at,
           stock_visible = p_visible
      from jsonb_to_recordset(p_stock) as s (busy_code integer, stock_qty numeric)
     where b.busy_code = s.busy_code
    returning 1
  )
  select count(*)::integer from updated;
$$;
-- Functions in public are callable by anon through the API unless revoked.
revoke all on function public.apply_busy_stock(jsonb, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.apply_busy_stock(jsonb, timestamptz, boolean) to service_role;

-- Public read of one BUSY item for the website. The only way anon can see busy_items data.
--   * No row for inactive, missing or excluded items.
--   * price is NULL unless price_visible.
--   * stock_status / stock_qty are NULL unless stock_visible. When visible: 'in_stock' with the quantity if > 0,
--     otherwise 'ask' and NULL quantity (zero, negative or never-synced stock is never shown as a number).
--   * No cost or purchase data exists in busy_items, and this returns an explicit column list, never b.*.
-- security definer: busy_items has RLS with no policies, so the function reads it as its owner.
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
         case when b.stock_visible and b.stock_qty > 0 then b.stock_qty end
    from public.busy_items b
   where b.busy_code = p_busy_code
     and b.is_active
     and not b.exclude_from_catalog;
$$;
revoke all on function public.public_catalog_item(integer) from public;
-- Logged-in shoppers use the authenticated role, which does not inherit anon's grants.
grant execute on function public.public_catalog_item(integer) to anon, authenticated;
