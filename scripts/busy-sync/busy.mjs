// BUSY side of the sync. READ ONLY: every statement goes through an exec() transport (sql.mjs: read-only login +
// assertReadOnly). This module adds the sync-specific checks on top: company/FY guard, schema fingerprint, strict
// row validation, cost-column block, query timings.
import { createHash } from "node:crypto";
import { COST_COLUMN_PATTERN, ITEM_CODE_FIELDS, ITEM_FIELDS, STOCK_FIELDS } from "./mapping.mjs";

export const ITEM_BATCH_SIZE = 500;
export const SLOW_QUERY_MS = 15_000;
export const SCHEMA_TABLES = ["Folio1", "Master1", "MasterSupport", "Tran2"];

export class SyncError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const FY_DB = /^(\w+_db1)(\d{4})$/i; // BusyComp0003_db12026 → company "BusyComp0003_db1", year "2026"
// S.K. TRADERS is BUSY company 0003. Pinned in code, not only in env: a BUSY_EXPECTED_DB naming any other company
// (Comp0001 is a different business) is refused before anything is read. Only the FY suffix may change.
export const EXPECTED_COMPANY_DB = /^BusyComp0003_db1\d{4}$/;

export function isSameCompanyOtherYear(actual, expected) {
  const a = FY_DB.exec(actual ?? "");
  const e = FY_DB.exec(expected ?? "");
  return Boolean(a && e && a[1].toLowerCase() === e[1].toLowerCase() && a[2] !== e[2]);
}

/** Databases of the SAME company with a later financial year than the one we sync. */
export function newerYears(names, expected) {
  const e = FY_DB.exec(expected);
  return names.filter((n) => isSameCompanyOtherYear(n, expected) && FY_DB.exec(n)[2] > e[2]);
}

// mssql error codes: ELOGIN = bad login / database not accessible, ETIMEOUT/ESOCKET/EINSTLOOKUP = network.
const NETWORK_ERROR = /ETIMEOUT|ESOCKET|EINSTLOOKUP|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|ECONNCLOSED/;

export function classifyBusyError(err) {
  if (err instanceof SyncError) return err;
  const msg = String(err?.message ?? err);
  if (err?.status === "CONFIG_ERROR") return new SyncError("CONFIG_ERROR", msg);
  if (msg.startsWith("Refusing:")) return new SyncError("QUERY_REFUSED", msg);
  if (/Cannot open database/i.test(msg)) return new SyncError("WRONG_DATABASE", msg); // configured DB missing / no access
  if (err?.code === "ELOGIN") return new SyncError("BUSY_LOGIN_FAILED", msg);
  if (NETWORK_ERROR.test(`${err?.code} ${msg}`)) return new SyncError("BUSY_UNREACHABLE", msg);
  return new SyncError("BUSY_QUERY_FAILED", msg);
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
 * Strict check of one result set. Anything short of exactly the expected columns (names and order) and value types
 * throws PARSE_FAILED, and the caller discards the whole run. Returns rows keyed by mapping field name.
 * Never includes values in error text.
 */
export function validateRows({ rows, columns }, fields, label) {
  const fail = (why) => {
    throw new SyncError("PARSE_FAILED", `${label}: ${why}`);
  };
  const got = columns.join(",");
  const want = fields.map((f) => f.alias).join(",");
  if (got !== want) fail(`columns [${got}] differ from expected [${want}]`);

  return rows.map((row, n) => {
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

/** Reader bound to one run and one connection: counts requests, records timings and warnings. */
export function createBusyReader({ exec, expectedDb, log = console.log }) {
  const stats = { requests: 0, timings: [], warnings: [] };

  const warn = (msg) => {
    stats.warnings.push(msg);
    log(`[busy] WARN ${msg}`);
  };

  async function send(label, sql) {
    if (COST_COLUMN_PATTERN.test(sql)) throw new SyncError("COST_FIELD_BLOCKED", `${label}: query references a cost/purchase column`);
    stats.requests++;
    try {
      return await exec(sql);
    } catch (err) {
      throw classifyBusyError(err);
    }
  }

  async function run(label, sql, fields) {
    const r = await send(label, sql);
    stats.timings.push({ label, ms: r.ms, rows: r.rows.length });
    log(`[busy] ${label}: ${r.rows.length} rows, ${r.ms} ms`);
    if (r.ms > SLOW_QUERY_MS) warn(`${label} took ${r.ms} ms (> ${SLOW_QUERY_MS} ms)`);
    return validateRows(r, fields, label);
  }

  return {
    stats,

    /**
     * The company guard, run at the start and again right before saving. Refuses unless DB_NAME() is exactly
     * BUSY_EXPECTED_DB (so Comp0001 or any other company never reaches the site), and stops if BUSY has moved on to
     * a later financial year of the same company (the pinned DB would silently freeze).
     */
    async checkCompany(label) {
      if (!FY_DB.test(expectedDb ?? "")) throw new SyncError("CONFIG_ERROR", `BUSY_EXPECTED_DB must look like BusyComp0003_db12026, got "${expectedDb}".`);
      if (!EXPECTED_COMPANY_DB.test(expectedDb)) throw new SyncError("WRONG_DATABASE", `BUSY_EXPECTED_DB=${expectedDb} is not S.K. TRADERS (BusyComp0003_db1YYYY). Refusing to sync another company.`);
      const started = Date.now();
      const [{ db: actual } = {}] = (await send(label, "SELECT DB_NAME() AS db")).rows;
      if (actual !== expectedDb) {
        if (isSameCompanyOtherYear(actual, expectedDb)) throw new SyncError("NEW_FY_DETECTED", `Connected to ${actual}, sync expects ${expectedDb}. Not switching automatically.`);
        throw new SyncError("WRONG_DATABASE", `Connected to ${actual}, sync expects ${expectedDb}. Refusing to sync another company.`);
      }
      const prefix = FY_DB.exec(expectedDb)[1].replace(/_/g, "[_]"); // LIKE treats _ as a wildcard
      const { rows } = await send(label, `SELECT name FROM sys.databases WHERE name LIKE '${prefix}%'`);
      const later = newerYears(rows.map((r) => r.name), expectedDb);
      if (later.length) throw new SyncError("NEW_FY_DETECTED", `BUSY has a later financial year (${later.join(", ")}); sync is pinned to ${expectedDb}. Update BUSY_EXPECTED_DB.`);
      stats.timings.push({ label, ms: Date.now() - started });
      log(`[busy] ${label}: OK (${actual})`);
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
