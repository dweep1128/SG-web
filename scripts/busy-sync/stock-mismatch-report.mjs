// Writes local-data/stock-mismatch-report.{json,md} — informational only, per SK Traders sync task step 5.
// Does NOT query BUSY: routes B (DailySum) and C (Folio1 monthly buckets) were derived by hand during the
// 2026-09-17 discovery (docs/busy-schema-report.md §3) and are not part of the regular sync's SQL. Route A
// (Folio1.D1 + SUM(Tran2.Value1), i.e. STOCK_QUERY in busy.mjs) is re-read from the latest local-data/busy_items.json
// dry-run/sync output, so it reflects today's stock, not the 2026-09-17 snapshot.
// Run after a dry-run or sync: node scripts/busy-sync/stock-mismatch-report.mjs
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const ITEMS_PATH = join(ROOT, process.env.SYNC_DATA_DIR || "local-data", "busy_items.json");
const OUT_JSON = join(ROOT, process.env.SYNC_DATA_DIR || "local-data", "stock-mismatch-report.json");
const OUT_MD = join(ROOT, process.env.SYNC_DATA_DIR || "local-data", "stock-mismatch-report.md");

// Transcribed verbatim from docs/busy-schema-report.md §3 (2026-09-17 discovery). Do not "fix" these — report only.
const KNOWN_MISMATCHES = [
  { busy_code: 1338, route_b_2026_09_17: -72, route_c_2026_09_17: -4, cause: "Stock Journal VchCode 660 (2026-04-01): Tran2 counts these items' positive lines as inward, DailySum counts them as outward. Gap = 2x line qty.", tag: "stock_journal_sign" },
  { busy_code: 1500, route_b_2026_09_17: 333, route_c_2026_09_17: 335, cause: "Stock Journal VchCode 660 sign mismatch (see 1338). Also appears below under the stale-voucher cause — this code has two compounding causes.", tag: "stock_journal_sign+stale_voucher" },
  { busy_code: 1640, route_b_2026_09_17: 39, route_c_2026_09_17: 61, cause: "Stock Journal VchCode 660 sign mismatch (see 1338).", tag: "stock_journal_sign" },
  { busy_code: 1702, route_b_2026_09_17: -10, route_c_2026_09_17: -6, cause: "Stock Journal VchCode 660 sign mismatch (see 1338).", tag: "stock_journal_sign" },
  { busy_code: 2252, route_b_2026_09_17: null, route_c_2026_09_17: 0, cause: "Purchases exist in Tran2, but DailySum has no rows and Folio1 month buckets are zero.", tag: "dailysum_no_rows" },
  { busy_code: 2253, route_b_2026_09_17: null, route_c_2026_09_17: 0, cause: "Purchases exist in Tran2, but DailySum has no rows and Folio1 month buckets are zero.", tag: "dailysum_no_rows" },
  { busy_code: 1324, route_b_2026_09_17: null, route_c_2026_09_17: null, cause: "Tran2 has a line under orphaned VchCode 880 (no Tran1 header), same VchNo '2026-27/305' as live voucher 883 — a stale copy of a re-saved sale.", tag: "stale_voucher_880" },
  { busy_code: 1357, route_b_2026_09_17: null, route_c_2026_09_17: null, cause: "Same VchCode 880 / VchNo 2026-27/305 stale-line cause as 1324.", tag: "stale_voucher_880" },
  { busy_code: 1498, route_b_2026_09_17: null, route_c_2026_09_17: null, cause: "Same VchCode 880 / VchNo 2026-27/305 stale-line cause as 1324.", tag: "stale_voucher_880" },
  { busy_code: 1544, route_b_2026_09_17: null, route_c_2026_09_17: null, cause: "Same VchCode 880 / VchNo 2026-27/305 stale-line cause as 1324.", tag: "stale_voucher_880" },
  { busy_code: 1583, route_b_2026_09_17: null, route_c_2026_09_17: null, cause: "Same VchCode 880 / VchNo 2026-27/305 stale-line cause as 1324. Example from the report: excluding the stale lines raises stock 138 -> 158.", tag: "stale_voucher_880" },
  { busy_code: 1595, route_b_2026_09_17: null, route_c_2026_09_17: null, cause: "Same VchCode 880 / VchNo 2026-27/305 stale-line cause as 1324.", tag: "stale_voucher_880" },
  { busy_code: 1663, route_b_2026_09_17: null, route_c_2026_09_17: null, cause: "Same VchCode 880 / VchNo 2026-27/305 stale-line cause as 1324.", tag: "stale_voucher_880" },
  { busy_code: 1677, route_b_2026_09_17: null, route_c_2026_09_17: null, cause: "Same VchCode 880 / VchNo 2026-27/305 stale-line cause as 1324. Example from the report: excluding the stale lines raises stock 95 -> 115.", tag: "stale_voucher_880" },
];

async function main() {
  const items = JSON.parse(await readFile(ITEMS_PATH, "utf8"));
  const byCode = new Map(items.map((r) => [r.busy_code, r]));

  const rows = KNOWN_MISMATCHES.map((m) => {
    const item = byCode.get(m.busy_code);
    return {
      busy_code: m.busy_code,
      busy_name: item?.busy_name ?? "(not found in latest local sync output)",
      route_a_today: item?.stock_qty ?? null, // Folio1.D1 + SUM(Tran2.Value1), from today's/latest sync
      stock_synced_at: item?.stock_synced_at ?? null,
      route_b_2026_09_17: m.route_b_2026_09_17,
      route_c_2026_09_17: m.route_c_2026_09_17,
      cause: m.cause,
      tag: m.tag,
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    source: "docs/busy-schema-report.md §3 (2026-09-17 discovery, all values DATA not GUESS)",
    note: "Informational only, per task instructions — not fixed. Route A is refreshed from the latest sync output; B and C are the 2026-09-17 hand-derived values and are not re-queried by the regular sync.",
    voucher_note: "Rows tagged stale_voucher_880 share VchNo 2026-27/305 with live voucher 883 via an orphaned VchCode 880 (no Tran1 header).",
    count: rows.length,
    items: rows,
  };

  await writeFile(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

  const md = [
    `# BUSY stock mismatch report (informational — not fixed)`,
    ``,
    `Generated: ${report.generated_at}`,
    `Source: ${report.source}`,
    ``,
    report.note,
    ``,
    report.voucher_note,
    ``,
    `| Code | Name | Route A (today) | Route B (2026-09-17) | Route C (2026-09-17) | Cause |`,
    `|---|---|---|---|---|---|`,
    ...rows.map((r) => `| ${r.busy_code} | ${r.busy_name} | ${r.route_a_today ?? "?"} | ${r.route_b_2026_09_17 ?? "n/a"} | ${r.route_c_2026_09_17 ?? "n/a"} | ${r.cause} |`),
    ``,
  ].join("\n");
  await writeFile(OUT_MD, md);

  console.log(`Wrote ${OUT_JSON} and ${OUT_MD} (${rows.length} items)`);
}

await main();
