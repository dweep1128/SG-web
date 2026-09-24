-- Public LIST (+ single-item) read of BUSY catalog items — MIGRATION FILE ONLY. NOT APPLIED.
-- Review first, then run once in Supabase Dashboard -> SQL Editor (same flow as busy-sync.sql).
--
-- Sibling to public.public_catalog_item(integer) in busy-sync.sql: same security posture
-- (security definer, explicit column list, no cost/purchase data, same is_active / not excluded
-- filter). Does NOT touch that already-applied function or its signature.
--
-- One function serves the storefront grid (p_busy_code omitted) and a single item's detail page
-- (p_busy_code given) so there's only one anon-facing surface to reason about. Adds hsn_code and
-- busy_group_name to the column set public_catalog_item() doesn't expose, needed for the detail
-- page and category navigation, and stock_synced_at (only when stock_visible) for "Updated X min ago".
--
-- If an earlier draft of this function was already applied, `create or replace` cannot change its
-- return columns: run `drop function if exists public.public_catalog_list(integer);` first.

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
         case when b.stock_visible and b.stock_qty > 0 then b.stock_qty end,
         case when b.stock_visible then b.stock_synced_at end
    from public.busy_items b
   where b.is_active
     and not b.exclude_from_catalog
     and (p_busy_code is null or b.busy_code = p_busy_code)
   order by b.busy_name;
$$;
revoke all on function public.public_catalog_list(integer) from public;
grant execute on function public.public_catalog_list(integer) to anon, authenticated;
