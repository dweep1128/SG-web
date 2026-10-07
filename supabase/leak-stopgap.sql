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
