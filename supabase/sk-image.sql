-- SK-image: staff photo portal + manual products — MIGRATION FILE ONLY. NOT APPLIED.
-- Review first, then run once in Supabase Dashboard -> SQL Editor (same flow as busy-sync.sql). Re-runnable.
--
-- The BUSY sync (scripts/busy-sync) owns busy_items and never touches anything created here: it only writes
-- busy_items / sync_runs via the service role. Photos and manual products are written by signed-in staff only.
--
-- ALSO REQUIRED (not SQL): Dashboard -> Authentication -> Sign In / Providers -> turn OFF "Allow new users to sign up",
-- then create each staff login under Authentication -> Users -> Add user. The policies below trust any signed-in user.

-- ─── Manual products (items not in BUSY) ────────────────────────────────────────────────────────────────────
create table if not exists public.products_manual (
  id          bigint generated always as identity primary key,
  sku         text not null unique check (btrim(sku) <> ''),
  name        text not null check (btrim(name) <> ''),
  category    text,                                  -- a site category slug (src/lib/categories.ts); null = auto-classify
  price       numeric check (price >= 0),            -- null = "Price on request"
  stock       numeric check (stock >= 0),            -- null or 0 = "Check availability"
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── Photos for both sources ────────────────────────────────────────────────────────────────────────────────
-- product_key: busy_items.busy_code::text for source 'busy', products_manual.id::text for 'manual'.
-- No FK on purpose: one column points into two tables. (source, product_key) is the product identity everywhere.
create table if not exists public.product_media (
  id                   bigint generated always as identity primary key,
  source               text not null check (source in ('busy', 'manual')),
  product_key          text not null,
  cloudinary_public_id text not null,
  url                  text not null,
  is_primary           boolean not null default false,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  unique (source, product_key, cloudinary_public_id)  -- also serves lookups by (source, product_key)
);

-- Enforced here, not just in the UI: max 8 photos per product, first photo becomes primary, new photos go last.
-- The advisory lock serialises inserts per product, so two parallel uploads can't both be "first" or overshoot 8.
create or replace function public.product_media_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  existing integer;
  next_order integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.source || ':' || new.product_key));
  select count(*), coalesce(max(sort_order) + 1, 0) into existing, next_order
    from public.product_media
   where source = new.source and product_key = new.product_key;
  if existing >= 8 then
    raise exception 'A product can have at most 8 photos' using errcode = 'check_violation';
  end if;
  new.is_primary := existing = 0;
  new.sort_order := next_order;
  return new;
end;
$$;

drop trigger if exists product_media_before_insert on public.product_media;
create trigger product_media_before_insert before insert on public.product_media
  for each row execute function public.product_media_before_insert();

-- ─── RLS ────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.product_media enable row level security;
drop policy if exists "product_media public read" on public.product_media;
drop policy if exists "product_media staff insert" on public.product_media;
drop policy if exists "product_media staff update" on public.product_media;
drop policy if exists "product_media staff delete" on public.product_media;
create policy "product_media public read" on public.product_media for select using (true);
create policy "product_media staff insert" on public.product_media for insert to authenticated with check (true);
create policy "product_media staff update" on public.product_media for update to authenticated using (true) with check (true);
create policy "product_media staff delete" on public.product_media for delete to authenticated using (true);

-- Anon never reads this table directly; the site sees active rows through catalog_view below.
alter table public.products_manual enable row level security;
drop policy if exists "products_manual staff all" on public.products_manual;
create policy "products_manual staff all" on public.products_manual for all to authenticated using (true) with check (true);

-- ─── Unified catalog ────────────────────────────────────────────────────────────────────────────────────────
-- The website's only catalog read path (replaces public_catalog_list() in the app; that function is left in place).
--
-- Deliberately NOT security_invoker: busy_items has RLS with no policies, so the view reads it as its owner, exactly
-- like public_catalog_list(). It therefore applies the same masking itself:
--   * active, non-excluded BUSY items only; active manual products only
--   * explicit column list, no cost/purchase data, never b.*
--   * BUSY price only when price_visible; stock only when stock_visible, and a quantity only when > 0
-- category: busy_group_name for BUSY (fed to the keyword classifier), a site category slug for manual.
-- If an earlier version exists with different columns, `drop view public.catalog_view;` first.
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
           coalesce(b.display_name, b.busy_name)     as name,
           b.busy_code::text                         as sku,
           b.busy_group_name                         as category,
           case when b.price_visible then b.sale_price end as price,
           case when b.stock_visible and b.stock_qty > 0 then b.stock_qty end as stock,
           case when b.stock_visible then case when b.stock_qty > 0 then 'in_stock' else 'ask' end end as stock_status,
           case when b.stock_visible then b.stock_synced_at end as stock_synced_at,
           b.hsn_code,
           b.unit_name,
           b.gst_pct,
           null::text                                as description
      from public.busy_items b
     where b.is_active and not b.exclude_from_catalog
    union all
    select 'manual',
           p.id::text,
           p.name,
           p.sku,
           p.category,
           p.price,
           case when p.stock > 0 then p.stock end,
           case when p.stock > 0 then 'in_stock' else 'ask' end,
           null::timestamptz,
           null::text,
           null::text,
           null::numeric,
           p.description
      from public.products_manual p
     where p.is_active
  ) c;

-- Supabase's default privileges grant everything on new objects to anon/authenticated. Read-only here.
revoke all on public.catalog_view from public, anon, authenticated;
grant select on public.catalog_view to anon, authenticated;
