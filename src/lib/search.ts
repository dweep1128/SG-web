// Fuzzy part search, shared by the header dropdown (client) and /search (server).
// Relative .ts imports only, so scripts/check-search.ts can run this file under plain Node.
import Fuse from "fuse.js";
import { categoryLabel, type CategorySlug } from "./categories.ts";
import { normalize } from "./normalize.ts";
import { SEARCH_ALIASES } from "./search-aliases.ts";

// The minimum a search result needs. Part satisfies it; the client index ships only these fields.
export type SearchDoc = { code: number; name: string; price: number | null; hsn: string | null; stock: "in" | "low" | "ask"; cat: CategorySlug };

const FUZZY_THRESHOLD = 0.34; // "chager" → "charger" passes; "48v" vs "60v" does not
const SUGGEST_THRESHOLD = 0.5;
const MIN_FUZZY_TOKEN = 3;

const aliasesByCode = new Map<number, string[]>();
for (const [alias, codes] of Object.entries(SEARCH_ALIASES)) for (const c of codes) aliasesByCode.set(c, [...(aliasesByCode.get(c) ?? []), alias]);

type Row<T> = { doc: T; hay: string };

export type SearchIndex<T extends SearchDoc> = { fuse: Fuse<Row<T>>; byCode: Map<number, T> };

export function buildIndex<T extends SearchDoc>(docs: T[]): SearchIndex<T> {
  const rows = docs.map((doc) => ({
    doc,
    hay: normalize([doc.name, doc.code, doc.hsn ?? "", categoryLabel(doc.cat), ...(aliasesByCode.get(doc.code) ?? [])].join(" ")),
  }));
  return {
    fuse: new Fuse(rows, { keys: ["hay"], useExtendedSearch: true, ignoreLocation: true, threshold: FUZZY_THRESHOLD, includeScore: true }),
    byCode: new Map(docs.map((d) => [d.code, d])),
  };
}

export function queryTokens(q: string): string[] {
  return normalize(q).split(" ").filter(Boolean);
}

// Every token must match (AND). Tokens with digits ("60v", "6200", HSN) or very short ones match exactly as
// substrings — fuzzy numbers are wrong numbers. Word tokens are fuzzy to absorb typos.
function extendedQuery(tokens: string[], joiner: " " | " | "): string {
  return tokens.map((t) => (/\d/.test(t) || t.length < MIN_FUZZY_TOKEN ? `'${t}` : t)).join(joiner);
}

export function search<T extends SearchDoc>(index: SearchIndex<T>, q: string, limit?: number): T[] {
  const tokens = queryTokens(q);
  if (!tokens.length) return [];
  const hits = index.fuse.search(extendedQuery(tokens, " "), limit ? { limit } : undefined).map((r) => r.item.doc);
  // An exact item code always wins.
  const exact = tokens.length === 1 && /^\d+$/.test(tokens[0]) ? index.byCode.get(Number(tokens[0])) : undefined;
  if (!exact) return hits;
  return [exact, ...hits.filter((d) => d !== exact)].slice(0, limit ?? Infinity);
}

// For "no results": any token (OR), looser threshold.
export function suggest<T extends SearchDoc>(index: SearchIndex<T>, q: string, limit: number): T[] {
  const tokens = queryTokens(q);
  if (!tokens.length) return [];
  return index.fuse
    .search(extendedQuery(tokens, " | "), { limit: limit * 4 })
    .filter((r) => (r.score ?? 1) <= SUGGEST_THRESHOLD)
    .slice(0, limit)
    .map((r) => r.item.doc);
}

// ── Highlighting ────────────────────────────────────────────────────────────
// Word-level, so typo matches light up too ("chager" highlights CHARGER). Returns alternating segments.
export type Segment = { text: string; hit: boolean };

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

function wordMatches(word: string, token: string): boolean {
  if (!word) return false;
  if (word.includes(token) || (word.length >= 2 && token.startsWith(word))) return true; // "60" of "60 V" for token "60v"
  if (token.length < 4 || /\d/.test(token)) return false;
  return editDistance(word, token) <= (token.length >= 7 ? 2 : 1);
}

export function highlight(text: string, q: string): Segment[] {
  const tokens = queryTokens(q);
  const out: Segment[] = [];
  for (const part of text.split(/(\s+)/)) {
    const hit = !!part.trim() && normalize(part).split(" ").some((w) => tokens.some((t) => wordMatches(w, t)));
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += part;
    else out.push({ text: part, hit });
  }
  return out;
}
