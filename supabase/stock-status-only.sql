-- Stock status only + two-source stock — MIGRATION FILE ONLY. NOT APPLIED. Run once in Supabase Dashboard -> SQL Editor,
-- after live-sync-admin.sql and display-name.sql. Re-runnable. Run it BEFORE deploying the matching site code.
--
-- Why: until now anyone holding the public (publishable) key could read exact quantities straight from Supabase:
-- catalog_view.stock, public_catalog_list().stock_qty, public_catalog_item().stock_qty and the legacy demo table
-- products.available_quantity. After this file the public role can only ever see a status:
-- 'in_stock' | 'low_stock' | 'out_of_stock' | 'ask' ("Check availability": stock not verified / not synced yet).

-- ─── The one stock config: low-stock threshold ─────────────────────────────────────────────────────────────
-- Summed quantity at or below this (and above 0) shows "Low stock". Change it here only; the site has no copy.
-- scripts/check-stock-status.mjs reads it through this function.
create or replace function public.stock_low_threshold()
returns numeric
language sql
immutable
as $$ select 10::numeric $$;

-- qty: known quantity (null = no count). flagged: "in stock" switch on a portal product without a count.
create or replace function public.stock_status_of(qty numeric, flagged boolean default false)
returns text
language sql
immutable
as $$
  select case
    when qty > public.stock_low_threshold() then 'in_stock'
    when qty > 0 then 'low_stock'
    when flagged then 'in_stock'
    else 'out_of_stock'
  end;
$$;
-- anon needs EXECUTE: Postgres checks function privileges as the caller even inside an owner-privileged view.
-- Both are pure: a number in, a label out. They read no table, so they can't leak a quantity.
grant execute on function public.stock_low_threshold() to anon, authenticated, service_role;
grant execute on function public.stock_status_of(numeric, boolean) to anon, authenticated, service_role;

-- ─── Two-source stock: a portal product can be linked to a BUSY item ───────────────────────────────────────
-- Linked = the same physical product. It is NOT listed separately; its stock is added to the BUSY item's.
-- SKUs don't have to match (that's why the link is explicit). The sync never writes products_manual.
alter table public.products_manual add column if not exists busy_code integer
  references public.busy_items (busy_code) on delete set null;
create index if not exists products_manual_busy_code on public.products_manual (busy_code) where busy_code is not null;

-- ─── Public catalog: status only, no quantity column at all ────────────────────────────────────────────────
-- Column list changed (stock removed), so drop + create. Still owner-privileged with explicit masking.
-- BUSY: 'ask' unless stock is verified (stock_visible) and synced. Negative BUSY stock counts as 0 in the sum.
-- Only active linked portal products add stock (hidden = not counted).
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
           case when b.stock_visible and b.stock_qty is not null
                then public.stock_status_of(greatest(b.stock_qty, 0) + coalesce(l.qty, 0), coalesce(l.flagged, false))
                else 'ask' end                       as stock_status,
           case when b.stock_visible then b.stock_synced_at end as stock_synced_at,
           b.hsn_code,
           b.unit_name,
           b.gst_pct,
           b.description,
           nullif(btrim(b.display_name), '')         as display_name,
           b.busy_name                               as source_name
      from public.busy_items b
      left join (
        select p.busy_code, sum(p.stock) filter (where p.stock > 0) as qty, bool_or(p.stock is null and p.in_stock) as flagged
          from public.products_manual p
         where p.is_active and p.busy_code is not null
         group by p.busy_code
      ) l on l.busy_code = b.busy_code
     where b.is_active and not b.exclude_from_catalog and not b.hidden
    union all
    select 'manual',
           p.id::text,
           coalesce(nullif(btrim(p.display_name), ''), p.name),
           p.sku,
           p.category,
           p.price,
           public.stock_status_of(p.stock, p.stock is null and p.in_stock),
           null::timestamptz,
           null::text,
           null::text,
           null::numeric,
           p.description,
           nullif(btrim(p.display_name), ''),
           p.name
      from public.products_manual p
     where p.is_active and p.busy_code is null
  ) c;
revoke all on public.catalog_view from public, anon, authenticated;
grant select on public.catalog_view to anon, authenticated;

-- ─── Close the other public paths to quantities ────────────────────────────────────────────────────────────
-- Legacy RPCs: the site stopped calling them (it reads catalog_view). Both return stock_qty. Revoke, don't drop.
revoke execute on function public.public_catalog_list(integer) from public, anon, authenticated;
revoke execute on function public.public_catalog_item(integer) from public, anon, authenticated;
-- Tables anon never needs. RLS already returns no rows to anon (no policy); revoking the grant is the second lock.
-- products: legacy demo table (unused by the site, has available_quantity), readable by anyone today.
do $$
declare t text;
begin
  foreach t in array array['products', 'product_images', 'product_compatibility', 'categories', 'scooter_models',
                           'products_manual', 'quote_requests', 'quote_items'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke select on public.%I from anon', t);
    end if;
  end loop;
end $$;
-- Legacy public write endpoint (AUDIT #10): anyone could insert quote rows with quantities. The site uses WhatsApp.
do $$
begin
  if to_regprocedure('public.create_quote_request(text, text, text, text, text, text, jsonb)') is not null then
    revoke execute on function public.create_quote_request(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
  end if;
end $$;

-- Realtime: no table with quantities may be broadcast (RLS already blocks anon, this removes the channel entirely).
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['busy_items', 'products_manual', 'sync_runs', 'sync_status', 'products'] loop
      if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ─── Portal list: + linked BUSY code (staff only; exact stock stays visible to staff) ─────────────────────
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
           nullif(btrim(b.display_name), '') as display_name, null::integer as linked_busy_code
      from public.busy_items b
     where b.is_active and not b.exclude_from_catalog
    union all
    select 'manual', p.id::text, coalesce(nullif(btrim(p.display_name), ''), p.name), p.name, p.sku, not p.is_active, p.price, p.stock,
           nullif(btrim(p.display_name), ''), p.busy_code
      from public.products_manual p
  ) c;
revoke all on public.admin_catalog from public, anon, authenticated;
grant select on public.admin_catalog to authenticated;

-- ─── Verify (read-only; run after the above, every result should be empty) ───────────────────────────────
-- 1. Tables in public without RLS:
--    select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- 2. Any quantity-like column anon can SELECT (tables and views):
--    select table_name, column_name from information_schema.column_privileges
--     where grantee in ('anon', 'PUBLIC') and privilege_type = 'SELECT' and table_schema = 'public'
--       and column_name ~* '(stock|qty|quantity)' and column_name <> 'stock_status' and column_name <> 'stock_synced_at';
-- 3. Functions anon can execute — review: only public_sync_status should return data to anon:
--    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
