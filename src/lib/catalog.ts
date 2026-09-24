// Server-side catalog access. The ONLY read path is public.public_catalog_list() over the publishable key
// (security definer, explicit columns, active + non-excluded only, no cost fields). Never read busy_items directly.
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { classifyPart } from "./categories";
import { HIDDEN_CODES } from "./hidden-items";
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
  // Publishable key under either name (Vercel project uses NEXT_PUBLIC_SUPABASE_ANON_KEY). Never the service role key.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabase = createClient(url, key, {
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

const getCachedParts = unstable_cache(
  async (): Promise<Part[]> =>
    (await fetchAllRows())
      .filter((row) => !HIDDEN_CODES.has(row.busy_code))
      .map(toPart)
      .sort((a, b) => a.name.localeCompare(b.name)),
  ["catalog-parts-v2"], // bumped: the hidden-items filter changes the cached result
  { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] },
);

// A catalog outage (or missing env) during `next build` must not fail the deploy: connection() opts the
// calling route out of static prerendering, so it renders at request time instead. At runtime the error
// propagates to the route's error boundary as usual. Failures are never cached (unstable_cache skips throws).
export async function getParts(): Promise<Part[]> {
  try {
    return await getCachedParts();
  } catch (error) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      console.warn(`[catalog] unavailable at build time, deferring to request time: ${(error as Error).message}`);
      await connection();
    }
    throw error;
  }
}

export async function getPart(code: number): Promise<Part | null> {
  return (await getParts()).find((p) => p.code === code) ?? null;
}
