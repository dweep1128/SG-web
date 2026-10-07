// Stock status correctness: for EVERY product, raw quantities (BUSY + linked portal products) → expected status,
// compared with (1) what public.catalog_view returns and (2) what the running site serves (/api/search-index carries
// the same per-product state the pages render). The expected status is recomputed here independently of the SQL.
//
//   npm run check:stock                    edge-case self-test only (no network)
//   npm run check:stock -- --db            + compare against Supabase  (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                                            NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
//   npm run check:stock -- --db --site=http://localhost:3000    + compare against the running site
//   npm run check:stock -- --live          LIVE, read-only, anon key only (LIVE_SUPABASE_URL, LIVE_SUPABASE_ANON_KEY,
//                                          LIVE_SITE_URL). It can't see raw quantities (by design), so it checks: no quantity
//                                          column readable, statuses valid, and the site shows the view's status per product.
//
// Quantities are only ever held in memory here; mismatches print codes and statuses, never a quantity.
import assert from "node:assert/strict";
import { loadDotEnv } from "./busy-sync/index.mjs";
import { isQuantityKey, liveEnv, STATUS_VALUES } from "./live-env.mjs";

const PAGE = 1000;
const SITE_STATE = { in: "in_stock", low: "low_stock", out: "out_of_stock", ask: "ask" };

/** The rule, written independently of supabase/stock-status-only.sql. */
export function expectedStatus({ busy, linked = [] }, threshold) {
  const active = linked.filter((p) => p.is_active);
  const flagged = active.some((p) => p.stock == null && p.in_stock);
  let qty;
  if (busy) {
    if (!busy.stock_visible || busy.stock_qty == null) return "ask"; // not verified / never synced: don't guess
    qty = Math.max(Number(busy.stock_qty), 0) + active.reduce((s, p) => s + (Number(p.stock) > 0 ? Number(p.stock) : 0), 0);
  } else {
    qty = Number(linked[0].stock ?? 0);
  }
  if (qty > threshold) return "in_stock";
  if (qty > 0) return "low_stock";
  return flagged ? "in_stock" : "out_of_stock";
}

function selfTest() {
  const T = 10;
  const busy = (stock_qty, stock_visible = true) => ({ busy: { stock_qty, stock_visible } });
  const portal = (stock, in_stock = false, is_active = true) => ({ stock, in_stock, is_active });
  assert.equal(expectedStatus(busy(0), T), "out_of_stock");
  assert.equal(expectedStatus(busy(-4), T), "out_of_stock"); // negative BUSY stock = out
  assert.equal(expectedStatus(busy(null), T), "ask"); // never synced
  assert.equal(expectedStatus(busy(50, false), T), "ask"); // not verified yet
  assert.equal(expectedStatus(busy(1), T), "low_stock");
  assert.equal(expectedStatus(busy(T), T), "low_stock"); // exactly at threshold = low
  assert.equal(expectedStatus(busy(T + 1), T), "in_stock");
  assert.equal(expectedStatus(busy(0.5), T), "low_stock"); // fractional units (kg, m)
  // two sources
  assert.equal(expectedStatus({ ...busy(6), linked: [portal(5)] }, T), "in_stock"); // 6 + 5 = 11
  assert.equal(expectedStatus({ ...busy(-3), linked: [portal(4)] }, T), "low_stock"); // negative clamps to 0
  assert.equal(expectedStatus({ ...busy(0), linked: [portal(null, true)] }, T), "in_stock"); // switch, no count
  assert.equal(expectedStatus({ ...busy(0), linked: [portal(20, false, false)] }, T), "out_of_stock"); // hidden link not counted
  assert.equal(expectedStatus({ ...busy(0, false), linked: [portal(20)] }, T), "ask"); // BUSY unverified wins
  // portal-only
  assert.equal(expectedStatus({ linked: [portal(null)] }, T), "out_of_stock");
  assert.equal(expectedStatus({ linked: [portal(null, true)] }, T), "in_stock");
  assert.equal(expectedStatus({ linked: [portal(0, true)] }, T), "out_of_stock"); // an explicit 0 beats the switch
  assert.equal(expectedStatus({ linked: [portal(T)] }, T), "low_stock");
  console.log("stock status self-test passed");
}

async function readAll(query) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function compareDb(siteUrl) {
  const { createClient } = await import("@supabase/supabase-js");
  const env = process.env;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  for (const [k, v] of Object.entries({ SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, "publishable key": anonKey })) {
    if (!v) throw new Error(`${k} is not set`);
  }
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, anonKey, opts);

  const version = async () => (await admin.from("sync_status").select("last_change_at").maybeSingle()).data?.last_change_at ?? null;
  const before = await version();
  const { data: threshold, error: tErr } = await admin.rpc("stock_low_threshold");
  if (tErr) throw new Error(`stock_low_threshold(): ${tErr.message} — is supabase/stock-status-only.sql applied?`);

  const busyRows = await readAll(() => admin.from("busy_items").select("busy_code, stock_qty, stock_visible, is_active, exclude_from_catalog, hidden").order("busy_code"));
  const manualRows = await readAll(() => admin.from("products_manual").select("id, stock, in_stock, is_active, busy_code").order("id"));
  const view = await readAll(() => anon.from("catalog_view").select("source, product_key, stock_status").order("source").order("product_key"));

  // 1. anon must not be able to read a quantity at all
  const probe = await anon.from("catalog_view").select("stock").limit(1);
  const leaks = [];
  if (!probe.error) leaks.push("catalog_view.stock is readable by anon");
  for (const fn of ["public_catalog_list", "public_catalog_item"]) {
    const r = await anon.rpc(fn, fn === "public_catalog_item" ? { p_busy_code: busyRows[0]?.busy_code ?? 1 } : {});
    if (!r.error) leaks.push(`${fn}() is callable by anon`);
  }
  for (const t of ["busy_items", "products_manual", "products"]) {
    const r = await anon.from(t).select("*").limit(1);
    if (!r.error && r.data.length) leaks.push(`${t} rows are readable by anon`);
  }

  // 2. expected vs view, every product
  const linkedTo = new Map();
  for (const p of manualRows) if (p.busy_code != null) linkedTo.set(p.busy_code, [...(linkedTo.get(p.busy_code) ?? []), p]);
  const expected = new Map();
  for (const b of busyRows) {
    if (b.is_active && !b.exclude_from_catalog && !b.hidden) expected.set(`busy:${b.busy_code}`, expectedStatus({ busy: b, linked: linkedTo.get(b.busy_code) }, Number(threshold)));
  }
  for (const p of manualRows) if (p.is_active && p.busy_code == null) expected.set(`manual:${p.id}`, expectedStatus({ linked: [p] }, Number(threshold)));

  const mismatches = [];
  const seen = new Set();
  for (const v of view) {
    const key = `${v.source}:${v.product_key}`;
    seen.add(key);
    if (!expected.has(key)) mismatches.push(`${key}: in catalog_view but should not be listed`);
    else if (expected.get(key) !== v.stock_status) mismatches.push(`${key}: view says ${v.stock_status}, expected ${expected.get(key)}`);
  }
  for (const key of expected.keys()) if (!seen.has(key)) mismatches.push(`${key}: missing from catalog_view`);

  // 3. expected vs the running site
  if (siteUrl) {
    const res = await fetch(new URL("/api/search-index", siteUrl));
    if (!res.ok) throw new Error(`site /api/search-index: HTTP ${res.status}`);
    const site = await res.json();
    for (const [code, , , , , state] of site) {
      const key = code.startsWith("m") ? `manual:${code.slice(1)}` : `busy:${code}`;
      const exp = expected.get(key);
      if (exp && SITE_STATE[state] !== exp) mismatches.push(`${key}: site shows ${state}, expected ${exp}`);
    }
    console.log(`site: ${site.length} products checked (hidden-by-launch-gate items are absent there by design)`);
  }

  // 4. edge-case census (counts only)
  const visible = busyRows.filter((b) => b.is_active && !b.exclude_from_catalog && !b.hidden);
  const census = {
    threshold: Number(threshold),
    busy_zero: visible.filter((b) => b.stock_visible && Number(b.stock_qty) === 0).length,
    busy_negative: visible.filter((b) => b.stock_visible && Number(b.stock_qty) < 0).length,
    busy_null: visible.filter((b) => b.stock_qty == null).length,
    busy_unverified: visible.filter((b) => !b.stock_visible).length,
    at_threshold: visible.filter((b) => b.stock_visible && Number(b.stock_qty) === Number(threshold)).length,
    linked_portal_products: [...linkedTo.values()].flat().length,
  };
  const after = await version();
  console.log(JSON.stringify({ products: expected.size, view_rows: view.length, census }, null, 2));
  if (before !== after) console.warn("A sync changed data while this ran: rerun before trusting any mismatch below.");
  for (const l of leaks) console.error(`LEAK: ${l}`);
  for (const m of mismatches.slice(0, 50)) console.error(`MISMATCH ${m}`);
  if (mismatches.length > 50) console.error(`… ${mismatches.length - 50} more`);
  if (leaks.length || mismatches.length) process.exitCode = 1;
  else console.log("stock status: every product matches, no quantity readable by anon");
}

async function compareLive() {
  const { url, key, site } = liveEnv({ needSite: true });
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (path) => {
    const res = await fetch(url + path, { headers });
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
  };
  const problems = [];
  if ((await get("/rest/v1/catalog_view?select=stock&limit=1")).ok) problems.push("catalog_view.stock is readable by anon");
  const view = [];
  for (let from = 0; ; from += PAGE) {
    const page = await get(`/rest/v1/catalog_view?select=*&order=source,product_key&limit=${PAGE}&offset=${from}`);
    if (!page.ok) throw new Error(`catalog_view: HTTP ${page.status}`);
    view.push(...page.json);
    if (page.json.length < PAGE) break;
  }
  const cols = new Set(view.flatMap((r) => Object.keys(r)));
  for (const c of cols) if (isQuantityKey(c)) problems.push(`catalog_view exposes column "${c}"`);
  for (const v of view) if (!STATUS_VALUES.includes(v.stock_status)) problems.push(`${v.source}:${v.product_key}: stock_status "${v.stock_status}" is not one of ${STATUS_VALUES.join("/")}`);
  const res = await fetch(new URL("/api/search-index", site));
  if (!res.ok) throw new Error(`site /api/search-index: HTTP ${res.status}`);
  const onSite = new Map((await res.json()).map(([code, , , , , state]) => [code.startsWith("m") ? `manual:${code.slice(1)}` : `busy:${code}`, SITE_STATE[state]]));
  let compared = 0;
  for (const v of view) {
    const shown = onSite.get(`${v.source}:${v.product_key}`);
    if (shown === undefined) continue; // hidden by the launch gate / HIDDEN_CODES
    compared++;
    if (shown !== v.stock_status) problems.push(`${v.source}:${v.product_key}: view says ${v.stock_status}, site shows ${shown}`);
  }
  if (view.length && compared === 0) problems.push("no product of the view is on the site: wrong LIVE_SITE_URL, a stale cache, or the launch gate hides everything. Nothing could be compared.");
  console.log(`live: ${view.length} view rows, ${onSite.size} on the site, ${compared} compared`);
  for (const p of [...new Set(problems)].slice(0, 50)) console.error(`PROBLEM ${p}`);
  if (problems.length) process.exitCode = 1;
  else console.log("PASS: status only, no quantity column readable by anon, site matches the view");
}

selfTest();
const args = process.argv.slice(2);
if (args.includes("--live")) {
  await compareLive();
} else if (args.includes("--db")) {
  loadDotEnv();
  await compareDb(args.find((a) => a.startsWith("--site="))?.slice(7));
}
