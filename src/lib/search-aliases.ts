// Slang / shop-floor name → BUSY item codes. The alias text is added to those items' search text, so typing
// the slang finds them (fuzzy, like any other word). Keys are matched after normalize(): lower-case, no punctuation.
// Example: { "bhompu": [1475], "accelerator": [1683, 2476] }
export const SEARCH_ALIASES: Record<string, number[]> = {};
