-- Optional SKU on portal products — MIGRATION FILE ONLY. Run in Supabase Dashboard -> SQL Editor AFTER stock-status-only.sql
-- (that file adds products_manual.busy_code and the catalog views). Re-runnable.
--
-- A blank SKU becomes 'M<id>' so standalone products need no code of their own. Typed SKUs are kept (still unique).
create or replace function public.products_manual_default_sku()
returns trigger
language plpgsql
as $$
begin
  if new.sku is null or btrim(new.sku) = '' then
    new.sku := 'M' || new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists products_manual_default_sku on public.products_manual;
create trigger products_manual_default_sku
  before insert or update of sku on public.products_manual
  for each row execute function public.products_manual_default_sku();

-- Make PostgREST see the new column (busy_code) and trigger straight away.
notify pgrst, 'reload schema';
