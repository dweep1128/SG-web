// Wire format for the client search index: positional tuples instead of objects (~45% smaller for 1,400+ rows).
// Contains only public fields — no quantity, no cost.
import type { CategorySlug } from "./categories";
import type { SearchDoc } from "./search";

type Tuple = [code: string, sku: string, name: string, price: number | null, hsn: string | null, stock: SearchDoc["stock"], cat: CategorySlug, altName: string | null];

export function encodeSearchIndex(docs: SearchDoc[]): Tuple[] {
  return docs.map((d) => [d.code, d.sku, d.name, d.price, d.hsn, d.stock, d.cat, d.altName ?? null]);
}

export function decodeSearchIndex(rows: Tuple[]): SearchDoc[] {
  return rows.map(([code, sku, name, price, hsn, stock, cat, altName]) => ({ code, sku, name, altName, price, hsn, stock, cat }));
}
