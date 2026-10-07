// BUSY SQL Server transport for the sync. Read-only by three independent locks:
//  1. the login (webapp_readonly) should only have db_datareader on the BUSY company database;
//  2. every statement passes assertReadOnly (one SELECT/WITH, no write/DDL/exec keywords) before it is sent;
//  3. the connection asks for read-only intent.
// The company database is pinned twice: the connection names it, and busy.mjs checks DB_NAME() on every run.
import sql from "mssql";
import { assertReadOnly } from "../busy-query.mjs";

const CONNECT_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_PORT = 1433;

export function sqlConfig(env = process.env) {
  const missing = ["BUSY_SQL_SERVER", "BUSY_SQL_DATABASE", "BUSY_SQL_READONLY_USER", "BUSY_SQL_READONLY_PASSWORD"].filter((k) => !env[k]);
  if (missing.length) throw Object.assign(new Error(`Missing env var(s): ${missing.join(", ")}`), { status: "CONFIG_ERROR" });
  return {
    server: env.BUSY_SQL_SERVER,
    port: Number(env.BUSY_SQL_PORT || DEFAULT_PORT),
    database: env.BUSY_SQL_DATABASE,
    user: env.BUSY_SQL_READONLY_USER,
    password: env.BUSY_SQL_READONLY_PASSWORD,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    requestTimeout: REQUEST_TIMEOUT_MS,
    pool: { max: 1, min: 0 },
    // BUSY runs on SQL Server Express with a self-signed cert; traffic already rides the Tailscale tunnel.
    options: { encrypt: env.BUSY_SQL_ENCRYPT === "true", trustServerCertificate: true, readOnlyIntent: true, appName: "sk-website-sync" },
  };
}

/** Opens one connection. exec(text) → { rows, columns (names in select order), ms }. */
export async function connectBusySql(env = process.env) {
  const pool = await new sql.ConnectionPool(sqlConfig(env)).connect();
  return {
    async exec(text) {
      assertReadOnly(text);
      const started = Date.now();
      const { recordset } = await pool.request().query(text);
      const columns = Object.values(recordset.columns).sort((a, b) => a.index - b.index).map((c) => c.name);
      return { rows: [...recordset], columns, ms: Date.now() - started };
    },
    close: () => pool.close(),
  };
}
