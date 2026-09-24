// Server-only catalog data fetchers, sourced through public.public_catalog_list() (anon-key RPC).
// See supabase/busy-catalog-list.sql — that function is the only thing between the browser and busy_items.
// Server components import from here; client components import lib/catalog-types.ts directly (no next/headers).
import { createClient } from "@/lib/supabase/server";
import { CatalogItem } from "@/lib/catalog-types";

export async function getCatalogItems(): Promise<CatalogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_catalog_list");
  if (error) throw new Error(`public_catalog_list: ${error.message}`);
  return data ?? [];
}

export async function getCatalogItem(busyCode: number): Promise<CatalogItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_catalog_list", { p_busy_code: busyCode });
  if (error) throw new Error(`public_catalog_list: ${error.message}`);
  return data?.[0] ?? null;
}

export * from "@/lib/catalog-types";
