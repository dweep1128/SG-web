// Read-only probe of the LIVE project with the public (anon) key only. PASS = the call is denied, or it returns no
// quantity column at all. FAIL = any quantity-like column comes back (a null in one sampled row still means the
// column is readable). Env: LIVE_SUPABASE_URL, LIVE_SUPABASE_ANON_KEY.   npm run check:live-anon
//   --interim   after supabase/leak-stopgap.sql only: the two RPCs still return stock_qty, but it must be a bucket (1 or 11 or null).
import { isQuantityKey, liveEnv, STATUS_VALUES } from "./live-env.mjs";

const { url, key } = liveEnv();
const INTERIM = process.argv.includes("--interim");
const BUCKETS = [1, 11]; // low / in stock, see leak-stopgap.sql
const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };

async function call(label, path, body, { bucketOk = false } = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { method: body ? "POST" : "GET", headers, body: body && JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { label, pass: true, note: `denied (HTTP ${res.status}${json?.code ? ` ${json.code}` : ""})` };
  const rows = Array.isArray(json) ? json : json ? [json] : [];
  const isBucket = (v) => v == null || BUCKETS.includes(v);
  const bad = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => isQuantityKey(k) && !(INTERIM && bucketOk && isBucket(r[k])))))];
  const badStatus = rows.map((r) => r.stock_status).filter((s) => s != null && !STATUS_VALUES.includes(s));
  if (bad.length) {
    const numeric = rows.some((r) => bad.some((k) => typeof r[k] === "number"));
    return { label, pass: false, note: `exposes quantity column(s): ${bad.join(", ")}${numeric ? " (NUMERIC VALUE RETURNED)" : " (null in the sampled row, column still readable)"}` };
  }
  if (badStatus.length) return { label, pass: false, note: `unexpected stock_status value: ${badStatus[0]}` };
  return { label, pass: true, note: `${rows.length} row(s), ${INTERIM && bucketOk ? "bucket values only (1 / 11 / null)" : "no quantity column"}` };
}

const results = [
  await call("rpc public_catalog_item(1291)", "rpc/public_catalog_item", { p_busy_code: 1291 }, { bucketOk: true }),
  await call("rpc public_catalog_list()", "rpc/public_catalog_list", {}, { bucketOk: true }),
  await call("catalog_view?select=*&limit=1", "catalog_view?select=*&limit=1"),
  await call("catalog_view?select=stock&limit=1", "catalog_view?select=stock&limit=1"),
  await call("products?select=*&limit=1 (legacy demo)", "products?select=*&limit=1"),
];
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.label}  ${r.note}`);
if (results.some((r) => !r.pass)) process.exitCode = 1;
