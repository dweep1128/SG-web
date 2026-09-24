// URL-synced catalog filters shared by /parts and /search. Pure: parse → apply → paginate.
import { isCategorySlug, type CategorySlug } from "./categories";
import type { Part } from "./catalog-types";
import { PAGE_SIZE } from "./site";

export const SORTS = [
  { value: "relevance", label: "Best match" }, // /search only
  { value: "name", label: "Name A–Z" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
] as const;
export type SortValue = (typeof SORTS)[number]["value"];

export type Filters = { cat: CategorySlug | null; inStock: boolean; sort: SortValue; page: number };
export type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseFilters(sp: SearchParams, defaultSort: SortValue = "name"): Filters {
  const cat = first(sp.cat);
  const sort = first(sp.sort);
  const page = Number.parseInt(first(sp.page) ?? "1", 10);
  return {
    cat: isCategorySlug(cat) ? cat : null,
    inStock: first(sp.stock) === "in",
    sort: SORTS.some((s) => s.value === sort) ? (sort as SortValue) : defaultSort,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

// Items without a price sort last in both directions — "Price on request" is not ₹0.
function byPrice(dir: 1 | -1) {
  return (a: Part, b: Part) => (a.price == null ? 1 : b.price == null ? -1 : (a.price - b.price) * dir);
}

// `parts` arrives in relevance order from search, or name order from the catalog.
export function applyFilters(parts: Part[], f: Filters): Part[] {
  const out = parts.filter((p) => (!f.cat || p.cat === f.cat) && (!f.inStock || p.stock !== "ask"));
  if (f.sort === "name") return out.sort((a, b) => a.name.localeCompare(b.name));
  if (f.sort === "price-asc") return out.sort(byPrice(1));
  if (f.sort === "price-desc") return out.sort(byPrice(-1));
  return out;
}

export function paginate<T>(items: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  return { items: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), page: current, pageCount, total: items.length };
}

// Build a URL that keeps every other filter. Defaults are dropped so shared links stay short.
export function filterHref(path: string, current: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const merged = { ...current, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v && !(k === "page" && v === "1")) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export function filtersToParams(f: Filters, defaultSort: SortValue, extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { ...extra, cat: f.cat ?? undefined, stock: f.inStock ? "in" : undefined, sort: f.sort === defaultSort ? undefined : f.sort, page: String(f.page) };
}
