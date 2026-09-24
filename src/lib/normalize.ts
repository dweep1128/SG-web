// Shared text normalizer for search + classification. Relative imports only in this file and lib/search.ts
// so scripts/check-search.ts can run them under plain `node --experimental-strip-types`.
const UNIT_SUFFIX = /(\d)\s+(v|volt|a|amp|ampere|ah|mah|w|kw|mm|cm|inch|pcs|pc|no)\b/g;

// "CHARGER  60 V / 3-AMP" → "charger 60v 3 amp" → units glued: "charger 60v 3amp".
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(UNIT_SUFFIX, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}
