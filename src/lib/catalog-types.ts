// Pure types + helpers shared by server pages and client components. No server-only imports here.
import { categoryLabel, type CategorySlug } from "./categories";
import { PRICE_INCLUDES_GST } from "./site";

// Row shape of public.catalog_view — see supabase/stock-status-only.sql. The view has no quantity column at all:
// stock_status is computed in the database, so an exact count never leaves Supabase.
export type CatalogRow = {
  source: "busy" | "manual";
  product_key: string;
  name: string;
  sku: string;
  category: string | null; // BUSY group name, or a category slug for manual products
  hsn_code: string | null;
  unit_name: string | null;
  gst_pct: number | null;
  price: number | null;
  stock_status: "in_stock" | "low_stock" | "out_of_stock" | "ask" | null; // ask = stock not verified yet
  stock_synced_at: string | null;
  description: string | null;
  display_name: string | null; // staff override, null when blank
  source_name: string; // BUSY name (busy) or the portal product's own name (manual)
  primary_image_url: string | null;
};

// The one rule for what a customer sees as a product's name: staff display_name if set, else the BUSY (or portal) name.
export function getDisplayName(p: { display_name?: string | null; busy_name?: string; name?: string }): string {
  return (p.display_name?.trim() || p.busy_name || p.name || "").replace(/\s+/g, " ").trim();
}

export type StockState = "in" | "low" | "out" | "ask";

// Lean public shape. Deliberately has no quantity and no cost field of any kind.
export type Part = {
  code: string; // URL slug: BUSY code as-is ("1291"), manual products "m<id>" ("m12")
  source: "busy" | "manual";
  key: string; // product_key in catalog_view / product_media
  sku: string; // shown to shoppers as the item code
  name: string;
  altName: string | null; // BUSY name when a display name replaces it; search-only, never shown
  price: number | null; // null = hidden by visibility flag or zero in BUSY → "Price on request"
  gst: number | null;
  hsn: string | null;
  unit: string | null;
  stock: StockState;
  cat: CategorySlug;
  syncedAt: string | null;
  description: string | null;
  imageUrl: string | null; // primary Cloudinary photo (untransformed secure_url)
};

export const STOCK_LABEL: Record<StockState, string> = {
  in: "In stock",
  low: "Low stock",
  out: "Out of stock",
  ask: "Check availability",
};

export const isInStock = (s: StockState) => s === "in" || s === "low";

const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ₹504 for whole rupees, ₹529.20 otherwise — never "₹529.2".
export function formatPrice(price: number | null): string {
  if (price == null) return "Price on request";
  return Number.isInteger(price) ? inrWhole.format(price) : inrPaise.format(price);
}

export const GST_NOTE = PRICE_INCLUDES_GST ? "incl. GST" : "+ GST";

// Price the dealer actually pays, for the detail page. Only meaningful when prices exclude GST.
export function priceWithGst(part: Pick<Part, "price" | "gst">): number | null {
  if (part.price == null || part.gst == null || PRICE_INCLUDES_GST) return null;
  return Math.round(part.price * (1 + part.gst / 100) * 100) / 100;
}

export function partHref(code: string): string {
  return `/parts/${code}`;
}

export { categoryLabel };

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];

// "Updated 12 minutes ago". Rendered on the server at request/revalidate time, so it can lag by ≤ the cache window.
export function updatedAgo(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  if (Math.abs(diff) < 60_000) return "Updated just now";
  const [unit, ms] = UNITS.find(([, ms]) => Math.abs(diff) >= ms)!;
  return `Updated ${rtf.format(Math.round(diff / ms), unit)}`;
}
