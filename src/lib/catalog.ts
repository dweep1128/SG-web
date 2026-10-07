// Server-side catalog access. The ONLY read path is public.catalog_view over the publishable key (owner-privileged
// view: explicit columns, active only, stock as a status — no quantity). Never read busy_items directly.
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { connection } from "next/server";
import { classifyPart, isCategorySlug } from "./categories";
import { HIDDEN_CODES } from "./hidden-items";
import { getDisplayName, type CatalogRow, type Part, type StockState } from "./catalog-types";
import { CATALOG_REVALIDATE_SECONDS, REQUIRE_DISPLAY_NAME_AND_PHOTO } from "./site";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase";

// PostgREST caps responses at 1000 rows; page until a short page comes back so nothing is silently dropped.
const RPC_PAGE_SIZE = 1000;
// Explicit list: a column added to the view later never reaches the site by accident.
const CATALOG_COLUMNS =
  "source, product_key, name, sku, category, hsn_code, unit_name, gst_pct, price, stock_status, stock_synced_at, description, display_name, source_name, primary_image_url";

// The status is computed in the database (threshold: public.stock_low_threshold()). Unknown values fail safe to "ask".
const STOCK_STATE: Partial<Record<string, StockState>> = { in_stock: "in", low_stock: "low", out_of_stock: "out" };
const stockState = (row: CatalogRow): StockState => STOCK_STATE[row.stock_status ?? ""] ?? "ask";

function toPart(row: CatalogRow): Part {
  const manual = row.source === "manual";
  return {
    code: manual ? `m${row.product_key}` : row.product_key,
    source: row.source,
    key: row.product_key,
    sku: row.sku,
    name: getDisplayName({ display_name: row.display_name, name: row.source_name }),
    altName: row.display_name ? row.source_name.replace(/\s+/g, " ").trim() : null,
    price: row.price != null && row.price > 0 ? Number(row.price) : null,
    gst: row.gst_pct == null ? null : Number(row.gst_pct),
    hsn: row.hsn_code?.trim() || null,
    unit: row.unit_name?.trim().replace(/\.$/, "").toLowerCase() || null, // BUSY mixes "Pcs." / "pcs" / "PACKS"
    stock: stockState(row),
    cat: manual && isCategorySlug(row.category) ? row.category : classifyPart(row.source_name, manual ? null : row.category),
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
      .select(CATALOG_COLUMNS)
      .order("source")
      .order("product_key") // stable order across pages; names are not unique
      .range(from, from + RPC_PAGE_SIZE - 1);
    if (error) throw new Error(`catalog_view: ${error.message}`);
    rows.push(...((data ?? []) as unknown as CatalogRow[]));
    if (!data || data.length < RPC_PAGE_SIZE) break;
  }
  console.info(`[catalog] fetched ${rows.length} items from catalog_view`);
  return rows;
}

// Global BUSY sync health (public_sync_status() in supabase/live-sync-admin.sql). lastOkAt = when every item was
// last confirmed against BUSY; lastChangeAt = when a sync last actually changed data.
export type SyncStatus = { lastOkAt: string | null; lastChangeAt: string | null; lastRunAt: string | null; lastStatus: string | null };

// Read fresh on every request (a one-row RPC), deduped within a request by React cache(). Deliberately NOT a data
// cache: a stale-while-revalidate copy would let a refresh render the catalog of an older version.
/** null = status unavailable (Supabase down, or the migration not applied yet). Never throws. */
export const getSyncStatus = cache(async (): Promise<SyncStatus | null> => {
  try {
    const { data, error } = await anonSupabase().rpc("public_sync_status").maybeSingle<Record<string, string | null>>();
    if (error) throw new Error(error.message);
    return { lastOkAt: data?.last_ok_at ?? null, lastChangeAt: data?.last_change_at ?? null, lastRunAt: data?.last_run_at ?? null, lastStatus: data?.last_status ?? null };
  } catch (error) {
    console.warn(`[catalog] sync status unavailable: ${(error as Error).message}`);
    return null;
  }
});

// Keyed by the sync's lastChangeAt (unstable_cache puts arguments in the key): a BUSY change starts a fresh entry
// right away instead of waiting out CATALOG_REVALIDATE_SECONDS. Portal edits use revalidateTag("catalog").
const getCachedParts = unstable_cache(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only there to be part of the cache key
  async (_version: string): Promise<Part[]> =>
    (await fetchAllRows())
      .filter((row) => !(row.source === "busy" && HIDDEN_CODES.has(Number(row.product_key))))
      .filter((row) => !REQUIRE_DISPLAY_NAME_AND_PHOTO || (row.display_name && row.primary_image_url))
      .map(toPart)
      .sort((a, b) => a.name.localeCompare(b.name)),
  ["catalog-parts-v6"], // bumped: stock arrives as a status only (low_stock from the DB)
  { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] },
);

// A catalog outage (or missing env) during `next build` must not fail the deploy: connection() opts the
// calling route out of static prerendering, so it renders at request time instead. At runtime the error
// propagates to the route's error boundary as usual. Failures are never cached (unstable_cache skips throws).
export async function getParts(): Promise<Part[]> {
  try {
    return await getCachedParts((await getSyncStatus())?.lastChangeAt ?? "none");
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
