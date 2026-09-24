// BUSY side of the sync. READ ONLY: every request goes through scripts/busy-query.mjs (SC=1, SELECT/WITH only,
// DB guard before each query, >= 1s between requests). This module adds the sync-specific checks on top:
// company/FY classification, schema fingerprint, strict rowset validation, cost-column block, query timings.
import { createHash } from "node:crypto";
import { assertExpectedDb, query } from "../busy-query.mjs";
import { COST_COLUMN_PATTERN, ITEM_CODE_FIELDS, ITEM_FIELDS, STOCK_FIELDS } from "./mapping.mjs";

export const ITEM_BATCH_SIZE = 500;
export const SLOW_QUERY_MS = 15_000;
export const MAX_QUERY_CHARS = 8_000; // longest length proven to work (docs/busy-schema-report.md §4)
export const SCHEMA_TABLES = ["Folio1", "Master1", "MasterSupport", "Tran2"];

export class SyncError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const FY_DB = /^(.+_db1)(\d{4})$/i; // BusyComp0003_db12026 → company "BusyComp0003_db1", year "2026"

export function isSameCompanyOtherYear(actual, expected) {
  const a = FY_DB.exec(actual ?? "");
  const e = FY_DB.exec(expected ?? "");
  return Boolean(a && e && a[1].toLowerCase() === e[1].toLowerCase() && a[2] !== e[2]);
}

// busy-query.mjs reports guard failures as one message; this turns it into a run status.
// Its exact format is pinned by check.mjs so a wording change there fails loudly instead of misclassifying.
const GUARD_MESSAGE = /^DB guard failed: Result=(\S*) Description=(.*) DB_NAME\(\)=(\S*) expected=(\S*)$/s;
const NETWORK_ERROR = /TIMEOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|socket hang up/i;
const COMPANY_CLOSED = /open a company/i;

export function classifyBusyError(err) {
  const msg = String(err?.message ?? err);
  const m = GUARD_MESSAGE.exec(msg);
  if (m) {
    const [, result, description, actual, expected] = m;
    if (COMPANY_CLOSED.test(description)) return new SyncError("BUSY_CLOSED", `BUSY has no company open: ${description}`);
    if (result !== "T") return new SyncError("BUSY_ERROR", `DB check failed: Result=${result} ${description}`);
    if (isSameCompanyOtherYear(actual, expected)) {
      return new SyncError("NEW_FY_DETECTED", `BUSY is on ${actual}, sync expects ${expected}. Not switching automatically.`);
    }
    return new SyncError("WRONG_DATABASE", `BUSY is on ${actual}, sync expects ${expected}.`);
  }
  if (COMPANY_CLOSED.test(msg)) return new SyncError("BUSY_CLOSED", msg);
  if (msg.startsWith("Refusing:")) return new SyncError("QUERY_REFUSED", msg);
  if (NETWORK_ERROR.test(msg) || err?.code) return new SyncError("BUSY_UNREACHABLE", msg);
  return new SyncError("BUSY_ERROR", msg);
}

export function hashColumns(lines) {
  return { columns: lines.length, sha256: createHash("sha256").update(lines.join("\n")).digest("hex") };
}

const selectList = (fields) => fields.map((f) => `${f.sql} AS ${f.alias}`).join(", ");

export function buildItemsQuery(codes) {
  if (!codes.length || !codes.every(Number.isInteger)) throw new SyncError("INTERNAL_ERROR", "item codes must be integers");
  return (
    `SELECT ${selectList(ITEM_FIELDS)} FROM Master1 i` +
    ` LEFT JOIN Master1 g ON g.Code=i.ParentGrp AND g.MasterType=5` +
    ` LEFT JOIN Master1 u ON u.Code=i.CM1 AND u.MasterType=8` +
    ` LEFT JOIN MasterSupport ts ON ts.MasterCode=i.CM8 AND ts.MasterType=25` +
    ` WHERE i.MasterType=6 AND i.Code IN (${codes.join(",")}) ORDER BY i.Code`
  );
}

export const ITEM_CODES_QUERY = `SELECT ${selectList(ITEM_CODE_FIELDS)} FROM Master1 WHERE MasterType=6 ORDER BY Code`;

export const STOCK_QUERY =
  `SELECT ${selectList(STOCK_FIELDS)} FROM Master1 i` +
  ` LEFT JOIN Folio1 f ON f.MasterCode=i.Code AND f.MasterType=6` +
  ` LEFT JOIN (SELECT MasterCode1, SUM(Value1) AS Qty FROM Tran2 WHERE RecType=2 GROUP BY MasterCode1) t ON t.MasterCode1=i.Code` +
  ` WHERE i.MasterType=6 ORDER BY i.Code`;

const SCHEMA_FIELDS = [
  { field: "tbl", alias: "tbl", type: "text" },
  { field: "col", alias: "col", type: "text" },
  { field: "type", alias: "type", type: "text" },
];
const SCHEMA_QUERY =
  `SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col, DATA_TYPE AS type FROM INFORMATION_SCHEMA.COLUMNS` +
  ` WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME IN (${SCHEMA_TABLES.map((t) => `'${t}'`).join(",")})` +
  ` ORDER BY TABLE_NAME, ORDINAL_POSITION`;

/**
 * Strict check of one SC=1 response. Anything short of a complete, fully parsed rowset with exactly the
 * expected columns and value types throws PARSE_FAILED, and the caller discards the whole run.
 * Returns rows keyed by mapping field name. Never includes values in error text.
 */
export function validateRowset(r, fields, label) {
  const fail = (why) => {
    throw new SyncError("PARSE_FAILED", `${label}: ${why}`);
  };
  if (r.http !== 200) fail(`HTTP ${r.http}`);
  const body = String(r.body ?? "").trim();
  if (!body.startsWith("<xml") || !body.endsWith("</xml>")) fail("body is not a complete ADO rowset document");
  const rowTags = body.match(/<z:row\b/g)?.length ?? 0;
  if (rowTags !== r.rows.length) fail(`${rowTags} <z:row> tags but ${r.rows.length} parsed rows`);
  const got = r.columns.map((c) => c.name).join(",");
  const want = fields.map((f) => f.alias).join(",");
  if (got !== want) fail(`columns [${got}] differ from expected [${want}]`);

  return r.rows.map((row, n) => {
    const out = {};
    for (const f of fields) {
      const v = row[f.alias];
      const nullable = f.type.endsWith("?");
      const base = f.type.replace("?", "");
      if (v === null || v === undefined) {
        if (!nullable) fail(`row ${n}: ${f.alias} is NULL`);
        out[f.field] = null;
        continue;
      }
      const ok =
        base === "int" ? Number.isInteger(v)
        : base === "number" ? Number.isFinite(v)
        : base === "bool" ? typeof v === "boolean"
        : typeof v === "string" && (nullable || v !== "");
      if (!ok) fail(`row ${n}: ${f.alias} is not a valid ${f.type}`);
      out[f.field] = v;
    }
    return out;
  });
}

function assertUniqueCodes(rows, label) {
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.busy_code)) throw new SyncError("PARSE_FAILED", `${label}: duplicate item code ${r.busy_code}`);
    seen.add(r.busy_code);
  }
}

/** Reader bound to one run: counts requests, records timings and warnings. */
export function createBusyReader({ log = console.log } = {}) {
  const stats = { requests: 0, timings: [], warnings: [] };

  const warn = (msg) => {
    stats.warnings.push(msg);
    log(`[busy] WARN ${msg}`);
  };

  async function run(label, sql, fields) {
    if (COST_COLUMN_PATTERN.test(sql)) throw new SyncError("COST_FIELD_BLOCKED", `${label}: query references a cost/purchase column`);
    if (sql.length > MAX_QUERY_CHARS) throw new SyncError("QUERY_TOO_LONG", `${label}: ${sql.length} chars > ${MAX_QUERY_CHARS}`);
    const started = Date.now();
    let r;
    try {
      r = await query(sql); // DB guard request + the query itself
    } catch (err) {
      stats.requests += 2; // upper bound: guard and/or query may have been sent
      throw classifyBusyError(err);
    }
    stats.requests += 2;
    stats.timings.push({ label, ms: r.ms, total_ms: Date.now() - started, rows: r.rows.length, bytes: r.bytes });
    log(`[busy] ${label}: ${r.rows.length} rows, ${r.bytes} B, ${r.ms} ms`);
    if (r.ms > SLOW_QUERY_MS) warn(`${label} took ${r.ms} ms (> ${SLOW_QUERY_MS} ms)`);
    if (r.result !== "T") {
      const desc = r.description ?? "(no description)";
      throw new SyncError(COMPANY_CLOSED.test(desc) ? "BUSY_CLOSED" : "BUSY_QUERY_FAILED", `${label}: Result=${r.result} ${desc}`);
    }
    return validateRowset(r, fields, label);
  }

  return {
    stats,

    async checkCompany(label) {
      const started = Date.now();
      try {
        await assertExpectedDb();
      } catch (err) {
        throw classifyBusyError(err);
      } finally {
        stats.requests += 1;
      }
      stats.timings.push({ label, ms: Date.now() - started });
      log(`[busy] ${label}: OK`);
    },

    /** Compares column fingerprints with the baseline. Column names are hashed, never returned or printed. */
    async checkSchema(baseline) {
      const rows = await run("schema_check", SCHEMA_QUERY, SCHEMA_FIELDS);
      const observed = {};
      for (const t of SCHEMA_TABLES) observed[t] = hashColumns(rows.filter((r) => r.tbl === t).map((r) => `${r.col}:${r.type}`));
      const diffs = SCHEMA_TABLES.filter((t) => baseline?.[t]?.sha256 !== observed[t].sha256).map(
        (t) => `${t}: baseline ${baseline?.[t]?.columns ?? "?"} cols ${String(baseline?.[t]?.sha256).slice(0, 12)}, now ${observed[t].columns} cols ${observed[t].sha256.slice(0, 12)}`,
      );
      return { ok: diffs.length === 0, observed, diffs };
    },

    async pullItemCodes() {
      const rows = await run("item_codes", ITEM_CODES_QUERY, ITEM_CODE_FIELDS);
      assertUniqueCodes(rows, "item_codes");
      return rows;
    },

    async pullItems(codes) {
      const out = [];
      for (let i = 0; i < codes.length; i += ITEM_BATCH_SIZE) {
        const batch = codes.slice(i, i + ITEM_BATCH_SIZE);
        const label = `items_batch_${i / ITEM_BATCH_SIZE + 1}`;
        const rows = await run(label, buildItemsQuery(batch), ITEM_FIELDS);
        const wanted = new Set(batch);
        if (rows.some((r) => !wanted.has(r.busy_code))) throw new SyncError("PARSE_FAILED", `${label}: returned a code that was not requested`);
        if (rows.length !== batch.length) warn(`${label}: asked for ${batch.length} items, got ${rows.length} (deleted mid-run?)`);
        out.push(...rows);
      }
      assertUniqueCodes(out, "items");
      return out;
    },

    async pullStock() {
      const rows = await run("stock", STOCK_QUERY, STOCK_FIELDS);
      assertUniqueCodes(rows, "stock");
      return rows;
    },
  };
}
