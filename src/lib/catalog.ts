// Server-side catalog access. The ONLY read path is public.catalog_view over the publishable key (owner-privileged
// view that masks price/stock exactly like public_catalog_list(), explicit columns, active only). Never read busy_items directly.
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { classifyPart, isCategorySlug } from "./categories";
import { HIDDEN_CODES } from "./hidden-items";
import type { CatalogRow, Part, StockState } from "./catalog-types";
import { CATALOG_REVALIDATE_SECONDS, LOW_STOCK_THRESHOLD } from "./site";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase";

// PostgREST caps responses at 1000 rows; page until a short page comes back so nothing is silently dropped.
const RPC_PAGE_SIZE = 1000;

function stockState(row: CatalogRow): StockState {
  if (row.stock_status !== "in_stock" || row.stock == null) return "ask"; // hidden, zero, negative, never synced
  return row.stock <= LOW_STOCK_THRESHOLD ? "low" : "in";
}

function toPart(row: CatalogRow): Part {
  const manual = row.source === "manual";
  return {
    code: manual ? `m${row.product_key}` : row.product_key,
    source: row.source,
    key: row.product_key,
    sku: row.sku,
    name: row.name.replace(/\s+/g, " ").trim(),
    price: row.price != null && row.price > 0 ? Number(row.price) : null,
    gst: row.gst_pct == null ? null : Number(row.gst_pct),
    hsn: row.hsn_code?.trim() || null,
    unit: row.unit_name?.trim().replace(/\.$/, "").toLowerCase() || null, // BUSY mixes "Pcs." / "pcs" / "PACKS"
    stock: stockState(row),
    cat: manual && isCategorySlug(row.category) ? row.category : classifyPart(row.name, manual ? null : row.category),
    syncedAt: row.stock_synced_at,
    description: row.description?.trim() || null,
    imageUrl: row.primary_image_url,
  };
}

function anonSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

async function fetchAllRows(): Promise<CatalogRow[]> {
  const supabase = anonSupabase();
  const rows: CatalogRow[] = [];
  for (let from = 0; ; from += RPC_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("catalog_view")
      .select("*")
      .order("source")
      .order("product_key") // stable order across pages; names are not unique
      .range(from, from + RPC_PAGE_SIZE - 1);
    if (error) throw new Error(`catalog_view: ${error.message}`);
    rows.push(...((data ?? []) as CatalogRow[]));
    if (!data || data.length < RPC_PAGE_SIZE) break;
  }
  console.info(`[catalog] fetched ${rows.length} items from catalog_view`);
  return rows;
}

// ponytail: photo changes reach the site within CATALOG_REVALIDATE_SECONDS; add revalidateTag("catalog") calls if staff need instant.
const getCachedParts = unstable_cache(
  async (): Promise<Part[]> =>
    (await fetchAllRows())
      .filter((row) => !(row.source === "busy" && HIDDEN_CODES.has(Number(row.product_key))))
      .map(toPart)
      .sort((a, b) => a.name.localeCompare(b.name)),
  ["catalog-parts-v3"], // bumped: catalog_view rows + string codes change the cached shape
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

export async function getPart(code: string): Promise<Part | null> {
  return (await getParts()).find((p) => p.code === code) ?? null;
}

// Full gallery for the detail page: cover first, then staff order. Detail pages are ISR, so this rides the page cache.
export async function getPartPhotos(part: Pick<Part, "source" | "key">): Promise<string[]> {
  const { data, error } = await anonSupabase()
    .from("product_media")
    .select("url")
    .eq("source", part.source)
    .eq("product_key", part.key)
    .order("is_primary", { ascending: false })
    .order("sort_order");
  if (error) throw new Error(`product_media: ${error.message}`);
  return (data ?? []).map((r) => r.url as string);
}
