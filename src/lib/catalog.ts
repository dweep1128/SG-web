// Server-side catalog access. The ONLY read path is public.public_catalog_list() over the publishable key
// (security definer, explicit columns, active + non-excluded only, no cost fields). Never read busy_items directly.
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { classifyPart } from "./categories";
import type { CatalogRow, Part, StockState } from "./catalog-types";
import { CATALOG_REVALIDATE_SECONDS, LOW_STOCK_THRESHOLD } from "./site";

// PostgREST caps responses at 1000 rows; page until a short page comes back so nothing is silently dropped.
const RPC_PAGE_SIZE = 1000;

function stockState(row: CatalogRow): StockState {
  if (row.stock_status !== "in_stock" || row.stock_qty == null) return "ask"; // hidden, zero, negative, never synced
  return row.stock_qty <= LOW_STOCK_THRESHOLD ? "low" : "in";
}

function toPart(row: CatalogRow): Part {
  return {
    code: row.busy_code,
    name: row.busy_name.replace(/\s+/g, " ").trim(),
    price: row.price != null && row.price > 0 ? Number(row.price) : null,
    gst: row.gst_pct == null ? null : Number(row.gst_pct),
    hsn: row.hsn_code?.trim() || null,
    unit: row.unit_name?.trim().replace(/\.$/, "").toLowerCase() || null, // BUSY mixes "Pcs." / "pcs" / "PACKS"
    stock: stockState(row),
    cat: classifyPart(row.busy_name, row.busy_group_name),
    syncedAt: row.stock_synced_at,
    imageUrl: null,
  };
}

async function fetchAllRows(): Promise<CatalogRow[]> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const rows: CatalogRow[] = [];
  for (let from = 0; ; from += RPC_PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc("public_catalog_list", { p_busy_code: null })
      .order("busy_code") // stable order across pages; busy_name is not unique
      .range(from, from + RPC_PAGE_SIZE - 1);
    if (error) throw new Error(`public_catalog_list: ${error.message}`);
    rows.push(...((data ?? []) as CatalogRow[]));
    if (!data || data.length < RPC_PAGE_SIZE) break;
  }
  console.info(`[catalog] fetched ${rows.length} items from public_catalog_list`);
  return rows;
}

export const getParts = unstable_cache(
  async (): Promise<Part[]> => (await fetchAllRows()).map(toPart).sort((a, b) => a.name.localeCompare(b.name)),
  ["catalog-parts-v1"],
  { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] },
);

export async function getPart(code: number): Promise<Part | null> {
  return (await getParts()).find((p) => p.code === code) ?? null;
}
