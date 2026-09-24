// TEMPORARY demo filter: BUSY codes hidden from the site without a re-sync. Source: docs/exclusions-draft.md
// sections A (not parts) + B (whole vehicles). Section C (unsure) stays visible.
// TODO: move these into scripts/busy-sync/catalog-exclusions.json, re-sync, then delete this file.
export const HIDDEN_CODES: ReadonlySet<number> = new Set([
  // A. Not parts
  1296, 1301, 1499, 2851, 1706, 1581, 1561, 1700, 1468, 2651, 2652, 2841, 3084, 2860, 3080, 3110, 3242, 3244,
  // B. Whole vehicles
  1386, 1387, 1389, 2826,
]);
