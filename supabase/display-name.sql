-- Display-name override — MIGRATION FILE ONLY. NOT APPLIED. Run once in Supabase Dashboard -> SQL Editor,
-- after live-sync-admin.sql. Re-runnable. Run it BEFORE deploying the matching site code (the site reads the new columns).
--
-- display_name already exists on busy_items (busy-sync.sql) and products_manual (live-sync-admin.sql); the `if not exists`
-- lines are no-ops there. The BUSY name column (busy_name) is untouched, and the sync never sends display_name.
-- Guard: stock-status-only.sql removed the quantity column from catalog_view. Re-running this file would re-create the
-- view WITH it. If you see this error, skip this file: it is already applied.
do $$
begin
  if to_regprocedure('public.stock_status_of(numeric, boolean)') is not null then
    raise exception 'stock-status-only.sql is already applied; re-running this file would put the stock column back. Skip it.';
  end if;
end $$;

alter table public.busy_items add column if not exists display_name text;
alter table public.products_manual add column if not exists display_name text;

-- Public catalog: + display_name (trimmed, null when blank) and source_name (the BUSY / original name), appended in the
-- inner select. Column order changed, so the view is dropped and recreated (create or replace can't reorder columns).
-- `name` stays the resolved name for older readers. Still owner-privileged with explicit masking.
drop view if exists public.catalog_view;
create view public.catalog_view as
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
           b.description,
           nullif(btrim(b.display_name), '')         as display_name,
           b.busy_name                               as source_name
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
           p.description,
           nullif(btrim(p.display_name), ''),
           p.name
      from public.products_manual p
     where p.is_active
  ) c;
revoke all on public.catalog_view from public, anon, authenticated;
grant select on public.catalog_view to anon, authenticated;

-- Portal list: + display_name (raw, null when blank) for the inline editor and the "missing display name" filter.
drop view if exists public.admin_catalog;
create view public.admin_catalog with (security_invoker = true) as
select c.*,
       (select m.url
          from public.product_media m
         where m.source = c.source and m.product_key = c.product_key
         order by m.is_primary desc, m.sort_order, m.id
         limit 1) as primary_image_url
  from (
    select 'busy'::text as source, b.busy_code::text as product_key,
           coalesce(nullif(btrim(b.display_name), ''), b.busy_name) as name, b.busy_name as source_name,
           b.busy_code::text as sku, b.hidden, b.sale_price as price, b.stock_qty as stock,
           nullif(btrim(b.display_name), '') as display_name
      from public.busy_items b
     where b.is_active and not b.exclude_from_catalog
    union all
    select 'manual', p.id::text, coalesce(nullif(btrim(p.display_name), ''), p.name), p.name, p.sku, not p.is_active, p.price, p.stock,
           nullif(btrim(p.display_name), '')
      from public.products_manual p
  ) c;
revoke all on public.admin_catalog from public, anon, authenticated;
grant select on public.admin_catalog to authenticated;
