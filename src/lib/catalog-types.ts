// Pure types + helpers shared by server pages and client components. No server-only imports here —
// anything that touches Supabase belongs in lib/catalog.ts instead, or client components pull in
// next/headers transitively and the build breaks.
export type CatalogItem = {
  busy_code: number;
  busy_name: string;
  hsn_code: string | null;
  unit_name: string | null;
  gst_pct: number | null;
  busy_group_name: string | null;
  price: number | null;
  stock_status: "in_stock" | "ask" | null;
  stock_qty: number | null;
};

// ponytail: arbitrary demo default — confirm the real "low stock" cutoff with Dweep before launch.
const LOW_STOCK_THRESHOLD = 10;

export type StockLabel = "In stock" | "Low stock" | "Check availability";
export function stockLabel(item: Pick<CatalogItem, "stock_status" | "stock_qty">): StockLabel {
  if (item.stock_status === "in_stock") return (item.stock_qty ?? 0) <= LOW_STOCK_THRESHOLD ? "Low stock" : "In stock";
  return "Check availability";
}

export function formatPrice(price: number | null): string {
  if (!price) return "Price on request";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(price)}`;
}

export type CategoryCount = { name: string; count: number };
export function catalogGroups(items: CatalogItem[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = item.busy_group_name || "Other";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export function filterCatalogItems(items: CatalogItem[], { query, group }: { query?: string; group?: string }): CatalogItem[] {
  const q = query?.trim().toLowerCase();
  return items.filter((item) => {
    if (group && item.busy_group_name !== group) return false;
    if (q && !item.busy_name.toLowerCase().includes(q)) return false;
    return true;
  });
}
