// Wire format for the client search index: positional tuples instead of objects (~45% smaller for 1,400+ rows).
// Contains only public fields — no quantity, no cost.
import type { CategorySlug } from "./categories";
import type { SearchDoc } from "./search";

type Tuple = [code: number, name: string, price: number | null, hsn: string | null, stock: SearchDoc["stock"], cat: CategorySlug];

export function encodeSearchIndex(docs: SearchDoc[]): Tuple[] {
  return docs.map((d) => [d.code, d.name, d.price, d.hsn, d.stock, d.cat]);
}

export function decodeSearchIndex(rows: Tuple[]): SearchDoc[] {
  return rows.map(([code, name, price, hsn, stock, cat]) => ({ code, name, price, hsn, stock, cat }));
}
