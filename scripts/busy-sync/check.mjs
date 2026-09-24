// Offline self-check for the sync's decision logic. No BUSY or Supabase calls.
// Run: node scripts/busy-sync/check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { assertReadOnly, parseRowset } from "../busy-query.mjs";
import {
  buildItemsQuery, classifyBusyError, isSameCompanyOtherYear, ITEM_BATCH_SIZE, ITEM_CODES_QUERY, MAX_QUERY_CHARS, STOCK_QUERY, validateRowset,
} from "./busy.mjs";
import {
  assertServerSideKey, checkSanity, exclusionWarnings, loadConfig, parseExclusions, planItems, searchName, summarizeItems, summarizeStock, toItemRow,
} from "./index.mjs";
import { COST_COLUMN_PATTERN, ITEM_FIELDS, STOCK_FIELDS } from "./mapping.mjs";
import { createLocalStore, mergeState } from "./store.mjs";

const status = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.status ?? `untyped: ${e.message}`;
  }
  return "no error";
};

// --- company / FY classification, pinned to busy-query.mjs's exact guard message ---
const queryModule = readFileSync(join(import.meta.dirname, "..", "busy-query.mjs"), "utf8");
assert.ok(
  queryModule.includes("`DB guard failed: Result=${r.result} Description=${r.description} DB_NAME()=${actual} expected=${expected}`"),
  "busy-query.mjs guard message changed — update GUARD_MESSAGE in busy.mjs",
);
const guard = (result, desc, actual) => new Error(`DB guard failed: Result=${result} Description=${desc} DB_NAME()=${actual} expected=BusyComp0003_db12026`);
assert.equal(classifyBusyError(guard("F", "Please open a company", "null")).status, "BUSY_CLOSED");
assert.equal(classifyBusyError(guard("T", "null", "BusyComp0003_db12027")).status, "NEW_FY_DETECTED");
assert.equal(classifyBusyError(guard("T", "null", "BusyComp0004_db12026")).status, "WRONG_DATABASE");
assert.equal(classifyBusyError(guard("F", "Login failed for user", "null")).status, "BUSY_ERROR");
assert.equal(classifyBusyError(new Error("TIMEOUT after 60000ms")).status, "BUSY_UNREACHABLE");
assert.equal(classifyBusyError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })).status, "BUSY_UNREACHABLE");
assert.equal(classifyBusyError(new Error("Refusing: forbidden keyword 'delete'")).status, "QUERY_REFUSED");
assert.equal(isSameCompanyOtherYear("BusyComp0003_db12027", "BusyComp0003_db12026"), true);
assert.equal(isSameCompanyOtherYear("BusyComp0003_db12026", "BusyComp0003_db12026"), false);

// --- every query the sync sends is read-only, cost-free and within the proven length ---
const worstBatch = Array.from({ length: ITEM_BATCH_SIZE }, (_, i) => 9_000_000 + i); // 7-digit codes
for (const sql of [buildItemsQuery(worstBatch), STOCK_QUERY, ITEM_CODES_QUERY]) {
  assertReadOnly(sql);
  assert.equal(COST_COLUMN_PATTERN.test(sql), false);
  assert.ok(sql.length <= MAX_QUERY_CHARS, `query is ${sql.length} chars`);
}
assert.equal(COST_COLUMN_PATTERN.test("SELECT i.D4 FROM Master1 i"), true);
assert.equal(COST_COLUMN_PATTERN.test("SELECT i.D24, i.D3 FROM Master1 i"), false);
for (const f of [...ITEM_FIELDS, ...STOCK_FIELDS]) assert.equal(COST_COLUMN_PATTERN.test(`${f.sql} ${f.alias} ${f.field}`), false, f.field);
assert.equal(status(() => buildItemsQuery(["1; DROP"])), "INTERNAL_ERROR");

// --- strict rowset validation ---
const xml = (rows, cols = [["Code", "int"], ["StockQty", "float"]]) =>
  `<xml><s:Schema id='RowsetSchema'><s:ElementType name='row'>` +
  cols.map(([n, t]) => `<s:AttributeType name='${n}'><s:datatype dt:type='${t}'/></s:AttributeType>`).join("") +
  `</s:ElementType></s:Schema><rs:data>${rows}</rs:data></xml>`;
const resp = (body) => ({ http: 200, result: "T", body, ...parseRowset(body) });
assert.deepEqual(validateRowset(resp(xml(`<z:row Code='1291' StockQty='1796'/>`)), STOCK_FIELDS, "t"), [{ busy_code: 1291, stock_qty: 1796 }]);
assert.equal(status(() => validateRowset(resp(xml(`<z:row Code='1291' StockQty='1796'/>`).slice(0, -6)), STOCK_FIELDS, "t")), "PARSE_FAILED"); // truncated
assert.equal(status(() => validateRowset(resp(xml(`<z:row Code='1291' StockQty='1796'/><z:row Code='2' StockQty='1' x=/>`)), STOCK_FIELDS, "t")), "PARSE_FAILED"); // unparseable row
assert.equal(status(() => validateRowset(resp(xml(`<z:row Code='1291'/>`)), STOCK_FIELDS, "t")), "PARSE_FAILED"); // NULL qty
assert.equal(status(() => validateRowset(resp(xml(`<z:row Code='x' StockQty='1'/>`, [["Code", "string"], ["StockQty", "float"]])), STOCK_FIELDS, "t")), "PARSE_FAILED");
assert.equal(status(() => validateRowset(resp(xml(`<z:row Code='1' Qty='1'/>`, [["Code", "int"], ["Qty", "float"]])), STOCK_FIELDS, "t")), "PARSE_FAILED"); // wrong column
assert.equal(status(() => validateRowset({ ...resp(xml("")), http: 500 }, STOCK_FIELDS, "t")), "PARSE_FAILED");

// --- item planning, rows, counts, sanity ---
assert.equal(searchName("CHARGER  60V"), "charger 60v");
const prev = [
  { busy_code: 1, busy_stamp: 1, is_active: true, missing_from_busy: false, sale_price: 10, busy_group_code: 401, busy_group_name: "General" },
  { busy_code: 2, busy_stamp: 1, is_active: true, missing_from_busy: false, sale_price: 10, busy_group_code: 401, busy_group_name: "General" },
  { busy_code: 3, busy_stamp: 4, is_active: false, missing_from_busy: true, sale_price: 10, busy_group_code: 401, busy_group_name: "General" },
];
const codes = [{ busy_code: 1, busy_stamp: 1 }, { busy_code: 2, busy_stamp: 2 }, { busy_code: 3, busy_stamp: 4 }, { busy_code: 4, busy_stamp: 1 }];
assert.deepEqual(planItems(prev, codes, false), { fetchCodes: [2, 3, 4], newCount: 1, missingCodes: [] });
assert.deepEqual(planItems(prev, codes, true).fetchCodes, [1, 2, 3, 4]);
assert.deepEqual(planItems(prev, [{ busy_code: 2, busy_stamp: 1 }], false).missingCodes, [1]); // never deleted, only flagged

// --- catalog exclusions ---
const realList = parseExclusions(JSON.parse(readFileSync(join(import.meta.dirname, "catalog-exclusions.json"), "utf8")));
assert.ok(realList.size > 0);
assert.equal(status(() => parseExclusions({ items: [{ busy_code: 1 }, { busy_code: 1 }] })), "CONFIG_ERROR");
assert.equal(status(() => parseExclusions({ items: [{ busy_code: "1333" }] })), "CONFIG_ERROR");
assert.equal(status(() => parseExclusions({})), "CONFIG_ERROR");
const exclusions = new Map([[1, "X"], [9, "GONE"]]);
assert.deepEqual(planItems(prev, codes, false, exclusions).fetchCodes, [1, 2, 3, 4]); // 1 re-pulled only because its flag changed
assert.deepEqual(planItems([{ ...prev[0], exclude_from_catalog: true }], [codes[0]], false, exclusions).fetchCodes, []); // already flagged
assert.deepEqual(planItems([{ ...prev[0], exclude_from_catalog: true }], [codes[0]], false).fetchCodes, [1]); // removed from list → re-pulled
assert.deepEqual(exclusionWarnings(exclusions, codes, [{ busy_code: 1, busy_name: "Y" }]), [
  'catalog exclusion 1: list says "X", BUSY says "Y"',
  "catalog exclusion 9 is not in BUSY",
]);

const item = { busy_code: 5, busy_name: "A  B", busy_alias: "", busy_print_name: "A  B", hsn_code: "8504", busy_stamp: 1, sale_price: 0, busy_group_code: 401, busy_group_name: "General", unit_name: "pcs", gst_pct: 5, busy_deactivated: false, busy_blocked: true };
const row = toItemRow(item, "2026-09-17T00:00:00Z", false, new Map([[5, "A  B"]]));
assert.equal(row.is_active, false);
assert.equal(row.busy_name, "A  B");
assert.equal(row.price_visible, false);
assert.equal(row.exclude_from_catalog, true);
assert.equal(toItemRow(item, "t", false).exclude_from_catalog, false);
assert.ok(!Object.keys(row).some((k) => /d4|purc|cost/i.test(k)));
const merged = mergeState(prev, [row], [1]);
const counts = summarizeItems(prev, merged);
assert.equal(counts.previous_active, 2);
assert.equal(counts.blocked, 1);
assert.equal(counts.missing_from_busy, 2);
assert.equal(counts.excluded_from_catalog, 1);
assert.equal(counts.price_zero_or_missing, 1);
assert.deepEqual(summarizeStock([{ stock_qty: -1 }, { stock_qty: 0 }, { stock_qty: 5 }, { stock_qty: 1001 }]), { rows: 4, negative: 1, zero: 1, one_to_1000: 1, over_1000: 1, non_integer: 0 });

// First run (no earlier successful item run): absolute 5% limit on zero/missing prices.
const sane = { previous_active: 100, active: 90, present_in_busy: 100, price_zero_or_missing: 5 };
assert.equal(status(() => checkSanity(sane, null)), "no error");
assert.equal(status(() => checkSanity({ ...sane, active: 89 }, null)), "SANITY_FAILED");
assert.equal(status(() => checkSanity({ ...sane, price_zero_or_missing: 6 }, null)), "SANITY_FAILED");
assert.equal(status(() => checkSanity({ ...sane, previous_active: 0, active: 1 }, null)), "no error");
// Later runs: stop only if the share rises more than 2 points over the last successful run; 5% no longer applies.
const lastOk = { present_in_busy: 1590, price_zero_or_missing: 57 }; // 3.585%
assert.equal(status(() => checkSanity({ ...sane, present_in_busy: 1590, price_zero_or_missing: 88 }, lastOk)), "no error"); // +1.95
assert.equal(status(() => checkSanity({ ...sane, present_in_busy: 1590, price_zero_or_missing: 89 }, lastOk)), "SANITY_FAILED"); // +2.01
assert.equal(status(() => checkSanity({ ...sane, price_zero_or_missing: 7 }, { present_in_busy: 100, price_zero_or_missing: 5 })), "no error"); // exactly +2
assert.equal(status(() => checkSanity({ ...sane, price_zero_or_missing: 11 }, { present_in_busy: 100, price_zero_or_missing: 10 })), "no error"); // 11% ok after first run
assert.equal(status(() => checkSanity({ ...sane, price_zero_or_missing: 1 }, lastOk)), "no error"); // falling is fine

// --- config and key handling ---
assert.equal(status(() => loadConfig(["full"], {})), "CONFIG_ERROR");
assert.equal(status(() => loadConfig(["full", "--dry-run", "--live"], {})), "CONFIG_ERROR");
assert.equal(loadConfig(["full", "--dry-run"], { PRICE_VERIFIED: "TRUE" }).priceVerified, false);
assert.equal(status(() => loadConfig(["stock", "--live"], {})), "CONFIG_ERROR"); // flag alone never writes
assert.equal(status(() => loadConfig(["stock", "--live"], { ALLOW_LIVE_WRITE: "TRUE" })), "CONFIG_ERROR"); // exact "true" only
assert.equal(loadConfig(["full", "--dry-run"], { ALLOW_LIVE_WRITE: "true" }).dryRun, true); // env alone never writes
assert.equal(loadConfig(["stock", "--live"], { ALLOW_LIVE_WRITE: "true", STOCK_VERIFIED: "true" }).stockVerified, true);
assert.equal(status(() => assertServerSideKey({ supabaseUrl: "u", serviceKey: "k" }, { NEXT_PUBLIC_X: "k" })), "CONFIG_ERROR");
assert.equal(status(() => assertServerSideKey({ supabaseUrl: "u", serviceKey: "sb_publishable_x" }, {})), "CONFIG_ERROR");
assert.equal(status(() => assertServerSideKey({ supabaseUrl: "u", serviceKey: "k" }, {})), "no error");

// --- local store mirrors live semantics: stock never creates rows ---
const dir = join(import.meta.dirname, "..", "..", "local-data", "check-store");
await rm(dir, { recursive: true, force: true }); // only this check's own scratch folder
const store = createLocalStore(dir);
await store.save({ upserts: [row], missingCodes: [], stock: null });
const saved = await store.save({ upserts: [], missingCodes: [], stock: { rows: [{ busy_code: 5, stock_qty: 7 }, { busy_code: 999, stock_qty: 1 }], synced_at: "t", visible: false } });
assert.equal(saved.stock_updated, 1);
const state = await store.loadItemState();
assert.deepEqual(state.map((r) => [r.busy_code, r.stock_qty, r.stock_visible]), [[5, 7, false]]);
assert.equal(await store.loadLastSuccessfulItemCounts(), null);
await store.recordRun({ status: "OK", counts: { items: { present_in_busy: 10, price_zero_or_missing: 1 } } });
await store.recordRun({ status: "SANITY_FAILED", counts: { items: { present_in_busy: 10, price_zero_or_missing: 9 } } });
await store.recordRun({ status: "OK", counts: { stock: { rows: 10 } } });
assert.deepEqual(await store.loadLastSuccessfulItemCounts(), { present_in_busy: 10, price_zero_or_missing: 1 });

console.log("busy-sync checks passed");
