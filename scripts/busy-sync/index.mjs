// BUSY → Supabase item/stock sync over the read-only BUSY SQL login.
//   node scripts/busy-sync/index.mjs <delta|items|stock|full> --dry-run   reads BUSY, writes only to SYNC_DATA_DIR (default ./local-data)
//   node scripts/busy-sync/index.mjs <delta|items|stock|full> --live      reads BUSY, writes Supabase (service role key, server-side only)
// Exactly one of --dry-run / --live is required, so nothing reaches Supabase by accident.
//   delta = every 60 s: items whose Stamp/price changed + stock rows whose quantity changed. Pushes only the changes.
//   full  = nightly safety net: re-pulls every item and pushes every stock row.
//   items / stock = the older partial jobs, kept for manual use.
// In production n8n calls these through scripts/busy-sync/server.mjs.
//
// Every run: company check → schema fingerprint → pull + strict parse → diff → sanity → company check again → save → run record.
// Any failure before "save" discards the whole pull; nothing partial is written. Rows are upserted, never deleted.
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { classifyBusyError, createBusyReader, SyncError } from "./busy.mjs";
import { connectBusySql } from "./sql.mjs";
import { createLocalStore, createSupabaseStore, mergeState } from "./store.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const BASELINE_PATH = join(import.meta.dirname, "busy-schema-baseline.json");
const EXCLUSIONS_PATH = join(import.meta.dirname, "catalog-exclusions.json");
export const JOBS = ["delta", "items", "stock", "full"];
const ACTIVE_DROP_LIMIT = 0.1;
const FIRST_RUN_ZERO_PRICE_LIMIT_PCT = 5; // only when there is no earlier successful item run to compare with
const ZERO_PRICE_RISE_LIMIT_PTS = 2; // percentage points above the last successful run
const FLOAT_TOLERANCE = 1e-9;
const STOCK_HIGH_QTY = 1000;
const TOP_GROUPS = 15;
const HEALTHCHECK_TIMEOUT_MS = 10_000;

export const searchName = (name) => name.toLowerCase().replace(/\s+/g, " ").trim();

export function loadConfig(argv, env = process.env) {
  const [job, ...flags] = argv;
  const usage = `Usage: index.mjs <${JOBS.join("|")}> --dry-run|--live`;
  if (!JOBS.includes(job)) throw new SyncError("CONFIG_ERROR", usage);
  const unknown = flags.filter((f) => f !== "--dry-run" && f !== "--live");
  if (unknown.length) throw new SyncError("CONFIG_ERROR", `Unknown flag(s) ${unknown.join(" ")}. ${usage}`);
  const dryRun = flags.includes("--dry-run");
  if (dryRun === flags.includes("--live")) throw new SyncError("CONFIG_ERROR", `Pass exactly one of --dry-run or --live. ${usage}`);
  // Two independent switches: the flag is per command, the env var is per machine. Either alone never writes.
  if (!dryRun && env.ALLOW_LIVE_WRITE !== "true") throw new SyncError("CONFIG_ERROR", "Live writes need both --live and ALLOW_LIVE_WRITE=true.");
  return {
    job,
    dryRun,
    expectedDb: env.BUSY_EXPECTED_DB,
    priceVerified: env.PRICE_VERIFIED === "true", // anything but the exact string "true" keeps prices hidden
    stockVerified: env.STOCK_VERIFIED === "true",
    dataDir: resolve(ROOT, env.SYNC_DATA_DIR || "local-data"),
    // Local testing against a fake BUSY only; production uses the committed baseline.
    baselinePath: resolve(ROOT, env.BUSY_SCHEMA_BASELINE || BASELINE_PATH),
    healthcheckUrl: env.HEALTHCHECK_URL || null,
    supabaseUrl: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/** The service role key bypasses RLS: refuse to run if it could end up in the browser bundle. Prints names, never values. */
export function assertServerSideKey({ supabaseUrl, serviceKey }, env = process.env) {
  if (!supabaseUrl || !serviceKey) throw new SyncError("CONFIG_ERROR", "--live needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  if (serviceKey.startsWith("sb_publishable_")) throw new SyncError("CONFIG_ERROR", "SUPABASE_SERVICE_ROLE_KEY holds a publishable key.");
  const exposed = Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_") && env[k] === serviceKey);
  if (exposed.length) throw new SyncError("CONFIG_ERROR", `The service role key is also in ${exposed.join(", ")}, which ships to the browser.`);
}

/** catalog-exclusions.json → Map(busy_code → busy_name). A malformed list stops the run rather than guessing. */
export function parseExclusions(json) {
  const items = json?.items;
  if (!Array.isArray(items)) throw new SyncError("CONFIG_ERROR", "catalog-exclusions.json: `items` must be an array.");
  const byCode = new Map();
  for (const { busy_code, busy_name } of items) {
    if (!Number.isInteger(busy_code) || byCode.has(busy_code)) throw new SyncError("CONFIG_ERROR", `catalog-exclusions.json: bad or duplicate busy_code ${busy_code}.`);
    byCode.set(busy_code, busy_name);
  }
  return byCode;
}

/** Codes BUSY no longer has, or whose name no longer matches (a reused code would silently hide the wrong item). */
export function exclusionWarnings(exclusions, codeRows, items) {
  const inBusy = new Set(codeRows.map((r) => r.busy_code));
  const nameByCode = new Map(items.map((r) => [r.busy_code, r.busy_name]));
  const warnings = [];
  for (const [code, name] of exclusions) {
    if (!inBusy.has(code)) warnings.push(`catalog exclusion ${code} is not in BUSY`);
    else if (nameByCode.has(code) && nameByCode.get(code) !== name) warnings.push(`catalog exclusion ${code}: list says "${name}", BUSY says "${nameByCode.get(code)}"`);
  }
  return warnings;
}

/**
 * Which items to re-pull: new codes, changed Stamp or price, previously missing ones that came back, or ones whose
 * exclude_from_catalog / price_visible flag no longer matches (so list or env edits apply on the next run). `force` re-pulls all.
 */
export function planItems(state, codeRows, force, exclusions = new Map(), priceVisible = undefined) {
  const prevByCode = new Map(state.map((r) => [r.busy_code, r]));
  const inBusy = new Set(codeRows.map((r) => r.busy_code));
  const fetchCodes = [];
  let newCount = 0;
  for (const { busy_code, busy_stamp, sale_price } of codeRows) {
    const prev = prevByCode.get(busy_code);
    if (!prev) newCount++;
    const changed =
      !prev ||
      prev.busy_stamp !== busy_stamp ||
      (sale_price !== undefined && Number(prev.sale_price) !== sale_price) ||
      prev.missing_from_busy ||
      Boolean(prev.exclude_from_catalog) !== exclusions.has(busy_code) ||
      (priceVisible !== undefined && Boolean(prev.price_visible) !== priceVisible);
    if (force || changed) fetchCodes.push(busy_code);
  }
  const missingCodes = state.filter((r) => !inBusy.has(r.busy_code) && !r.missing_from_busy).map((r) => r.busy_code);
  return { fetchCodes, newCount, missingCodes };
}

export function toItemRow(item, syncedAt, priceVisible, exclusions = new Map()) {
  return {
    ...item, // exactly the ITEM_FIELDS columns from mapping.mjs
    search_name: searchName(item.busy_name),
    is_active: !item.busy_deactivated && !item.busy_blocked,
    missing_from_busy: false,
    exclude_from_catalog: exclusions.has(item.busy_code),
    price_visible: priceVisible,
    price_synced_at: syncedAt, // covers the whole item pull (name/HSN/GST/price), not price alone
    last_synced_at: syncedAt,
  };
}

/** Stock rows to push: quantity or visibility changed, or the item has no stock yet. `force` sends all. */
export function diffStock(state, rows, visible, force) {
  if (force) return rows;
  const prev = new Map(state.map((r) => [r.busy_code, r]));
  return rows.filter(({ busy_code, stock_qty }) => {
    const p = prev.get(busy_code);
    return !p || p.stock_qty == null || Number(p.stock_qty) !== stock_qty || Boolean(p.stock_visible) !== visible;
  });
}

export function summarizeItems(state, merged) {
  const present = merged.filter((r) => !r.missing_from_busy);
  const active = merged.filter((r) => r.is_active);
  const zeroOrMissingPrice = (rows) => rows.filter((r) => !r.sale_price).length;
  const groups = new Map();
  for (const r of present) {
    const g = groups.get(r.busy_group_code) ?? { code: r.busy_group_code, name: r.busy_group_name, items: 0, active: 0 };
    g.items++;
    if (r.is_active) g.active++;
    groups.set(r.busy_group_code, g);
  }
  return {
    previous_active: state.filter((r) => r.is_active).length,
    total: merged.length,
    present_in_busy: present.length,
    active: active.length,
    inactive: merged.length - active.length,
    deactivated: present.filter((r) => r.busy_deactivated).length,
    blocked: present.filter((r) => r.busy_blocked).length,
    missing_from_busy: merged.length - present.length,
    excluded_from_catalog: merged.filter((r) => r.exclude_from_catalog).length,
    price_zero_or_missing: zeroOrMissingPrice(present),
    price_zero_or_missing_active: zeroOrMissingPrice(active),
    groups_top15: [...groups.values()].sort((a, b) => b.items - a.items || a.code - b.code).slice(0, TOP_GROUPS),
  };
}

export function summarizeStock(rows) {
  const qty = rows.map((r) => r.stock_qty);
  return {
    rows: rows.length,
    negative: qty.filter((q) => q < 0).length,
    zero: qty.filter((q) => q === 0).length,
    one_to_1000: qty.filter((q) => q > 0 && q <= STOCK_HIGH_QTY).length,
    over_1000: qty.filter((q) => q > STOCK_HIGH_QTY).length,
    non_integer: qty.filter((q) => !Number.isInteger(q)).length,
  };
}

/** Share (0–100) of items still in BUSY whose price is 0 or missing. Derived from counts so older run records work too. */
export const zeroPriceSharePct = ({ present_in_busy, price_zero_or_missing }) => (present_in_busy > 0 ? (100 * price_zero_or_missing) / present_in_busy : 0);

/** `lastOk` = counts.items of the last successful items/full run, or null if there is none yet. */
export function checkSanity(items, lastOk) {
  const { previous_active, active } = items;
  if (previous_active > 0 && active < previous_active * (1 - ACTIVE_DROP_LIMIT)) {
    throw new SyncError("SANITY_FAILED", `Active items fell from ${previous_active} to ${active} (limit ${ACTIVE_DROP_LIMIT * 100}% drop).`);
  }
  const share = zeroPriceSharePct(items);
  if (lastOk) {
    const before = zeroPriceSharePct(lastOk);
    if (share - before > ZERO_PRICE_RISE_LIMIT_PTS + FLOAT_TOLERANCE) {
      throw new SyncError("SANITY_FAILED", `Zero/missing prices rose from ${before.toFixed(2)}% to ${share.toFixed(2)}% (limit +${ZERO_PRICE_RISE_LIMIT_PTS} points vs last successful run).`);
    }
  } else if (share > FIRST_RUN_ZERO_PRICE_LIMIT_PCT + FLOAT_TOLERANCE) {
    throw new SyncError("SANITY_FAILED", `${share.toFixed(2)}% of prices are 0 or missing (first-run limit ${FIRST_RUN_ZERO_PRICE_LIMIT_PCT}%).`);
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

async function pingHealthcheck(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS) });
    if (!res.ok) console.warn(`[sync] healthcheck ping returned HTTP ${res.status}`); // URL not printed: it can carry a token
  } catch (err) {
    console.warn(`[sync] healthcheck ping failed: ${err.message}`);
  }
}

/** Loads .env from the repo root. Existing env vars win, so a server can inject real ones. */
export function loadDotEnv() {
  try {
    process.loadEnvFile(join(ROOT, ".env"));
  } catch {
    // No .env file: env comes from the host.
  }
}

/**
 * One sync run. Never throws: the outcome is the returned run record (status "OK" or an error status).
 * `connect` opens the BUSY connection (read-only SQL login by default).
 */
export async function runSync(cfg, { connect = connectBusySql } = {}) {
  const startedAt = new Date();
  const localStore = createLocalStore(cfg.dataDir);
  const phasesMs = {};
  const phase = async (name, fn) => {
    const t = Date.now();
    try {
      return await fn();
    } finally {
      phasesMs[name] = Date.now() - t;
    }
  };
  const run = { job: cfg.job, status: "RUNNING", dry_run: cfg.dryRun, busy_db: cfg.expectedDb ?? null, started_at: startedAt.toISOString(), changes: 0, counts: {}, error: null };
  const warnings = [];
  let store = null;
  let conn = null;
  let busy = null;
  console.log(`[sync] ${cfg.job} ${cfg.dryRun ? "DRY-RUN (local files only)" : "LIVE"} — PRICE_VERIFIED=${cfg.priceVerified} STOCK_VERIFIED=${cfg.stockVerified}`);

  try {
    if (!cfg.expectedDb) throw new SyncError("CONFIG_ERROR", "BUSY_EXPECTED_DB is not set.");
    if (!cfg.dryRun) assertServerSideKey(cfg);
    store = cfg.dryRun ? localStore : await createSupabaseStore(cfg);

    conn = await phase("connect", async () => {
      try {
        return await connect();
      } catch (err) {
        throw classifyBusyError(err);
      }
    });
    busy = createBusyReader({ exec: conn.exec, expectedDb: cfg.expectedDb });
    await phase("company_check_start", () => busy.checkCompany("company_check_start"));
    const schema = await phase("schema_check", () => busy.checkSchema(JSON.parse(readFileSync(cfg.baselinePath, "utf8")).tables));
    if (!schema.ok) {
      await writeJson(join(cfg.dataDir, "busy-schema-observed.json"), { captured_at: new Date().toISOString(), busy_db: cfg.expectedDb, tables: schema.observed });
      throw new SyncError("SCHEMA_CHANGED", `BUSY column fingerprint changed: ${schema.diffs.join("; ")}`);
    }

    const state = await store.loadItemState();
    const toSave = { upserts: [], missingCodes: [], stock: null };

    if (cfg.job !== "stock") {
      await phase("items", async () => {
        const exclusions = parseExclusions(JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf8")));
        const lastOk = await store.loadLastSuccessfulItemCounts();
        const codeRows = await busy.pullItemCodes();
        const plan = planItems(state, codeRows, cfg.job === "full", exclusions, cfg.priceVerified);
        const items = plan.fetchCodes.length ? await busy.pullItems(plan.fetchCodes) : [];
        for (const w of exclusionWarnings(exclusions, codeRows, items)) {
          warnings.push(w);
          console.log(`[sync] WARN ${w}`);
        }
        const syncedAt = new Date().toISOString();
        toSave.upserts = items.map((it) => toItemRow(it, syncedAt, cfg.priceVerified, exclusions));
        toSave.missingCodes = plan.missingCodes;
        run.counts.items = {
          busy_item_codes: codeRows.length,
          fetched: items.length,
          new: plan.newCount,
          newly_missing: plan.missingCodes.length,
          ...summarizeItems(state, mergeState(state, toSave.upserts, toSave.missingCodes)),
        };
        run.counts.items.price_zero_share_pct = Number(zeroPriceSharePct(run.counts.items).toFixed(3));
        run.counts.items.last_ok_price_zero_share_pct = lastOk ? Number(zeroPriceSharePct(lastOk).toFixed(3)) : null;
        checkSanity(run.counts.items, lastOk);
      });
    }

    if (cfg.job !== "items") {
      await phase("stock", async () => {
        const rows = await busy.pullStock();
        const changed = diffStock(state, rows, cfg.stockVerified, cfg.job !== "delta");
        toSave.stock = { rows: changed, synced_at: new Date().toISOString(), visible: cfg.stockVerified };
        run.counts.stock = { ...summarizeStock(rows), changed: changed.length };
      });
    }

    run.changes = toSave.upserts.length + toSave.missingCodes.length + (toSave.stock?.rows.length ?? 0);
    if (run.changes > 0) {
      await phase("company_check_before_save", () => busy.checkCompany("company_check_before_save"));
      const saved = await phase("save", () => store.save(toSave));
      run.counts.saved = { store: store.kind, item_upserts: toSave.upserts.length, flagged_missing: toSave.missingCodes.length, ...saved };
    }
    run.status = "OK";
  } catch (err) {
    run.status = err instanceof SyncError ? err.status : "ERROR";
    run.error = err.message;
  } finally {
    await conn?.close().catch(() => {});
  }

  const finishedAt = new Date();
  Object.assign(run, {
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt - startedAt,
    details: { phases_ms: phasesMs, busy_requests: busy?.stats.requests ?? 0, queries: busy?.stats.timings ?? [], warnings: [...(busy?.stats.warnings ?? []), ...warnings] },
  });
  let previous = null;
  try {
    previous = await (store ?? localStore).recordRun(run);
  } catch (err) {
    console.error(`[sync] could not record run in ${store?.kind}: ${err.message} — writing it locally instead`);
    previous = await localStore.recordRun(run).catch(() => null);
  }
  run.previous_status = previous;
  run.status_changed = previous !== run.status; // alert on transitions, not on every failed minute
  if (run.status === "OK" && !cfg.dryRun && cfg.healthcheckUrl) await pingHealthcheck(cfg.healthcheckUrl);
  return run;
}

async function main() {
  loadDotEnv();
  let cfg;
  try {
    cfg = loadConfig(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  const run = await runSync(cfg);
  console.log(JSON.stringify(run, null, 2));
  if (run.status !== "OK") {
    console.error(`\n*** SYNC FAILED: ${run.status} ${run.error ?? ""}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
