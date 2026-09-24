// Pure types + helpers shared by server pages and client components. No server-only imports here.
import { categoryLabel, type CategorySlug } from "./categories";
import { PRICE_INCLUDES_GST } from "./site";

// Row shape of public.public_catalog_list(p_busy_code) — see supabase/busy-catalog-list.sql.
// Server-only: stock_qty is used to derive the stock label and then dropped.
export type CatalogRow = {
  busy_code: number;
  busy_name: string;
  hsn_code: string | null;
  unit_name: string | null;
  gst_pct: number | null;
  busy_group_name: string | null;
  price: number | null;
  stock_status: "in_stock" | "ask" | null;
  stock_qty: number | null;
  stock_synced_at: string | null;
};

export type StockState = "in" | "low" | "ask";

// Lean public shape. Deliberately has no quantity and no cost field of any kind.
export type Part = {
  code: number;
  name: string;
  price: number | null; // null = hidden by visibility flag or zero in BUSY → "Price on request"
  gst: number | null;
  hsn: string | null;
  unit: string | null;
  stock: StockState;
  cat: CategorySlug;
  syncedAt: string | null;
  imageUrl: string | null; // always null until Cloudinary photos land
};

export const STOCK_LABEL: Record<StockState, string> = {
  in: "In stock",
  low: "Low stock",
  ask: "Check availability",
};

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatPrice(price: number | null): string {
  return price == null ? "Price on request" : inr.format(price);
}

export const GST_NOTE = PRICE_INCLUDES_GST ? "incl. GST" : "+ GST";

// Price the dealer actually pays, for the detail page. Only meaningful when prices exclude GST.
export function priceWithGst(part: Pick<Part, "price" | "gst">): number | null {
  if (part.price == null || part.gst == null || PRICE_INCLUDES_GST) return null;
  return Math.round(part.price * (1 + part.gst / 100) * 100) / 100;
}

export function partHref(code: number): string {
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
