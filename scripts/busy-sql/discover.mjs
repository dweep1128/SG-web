// BUSY SQL Server — Step 1 discovery. READ-ONLY: this script issues SELECT only.
//
// Separate mechanism from `Integration using BUSY Web Service/` (that folder is the outbound
// header-based Web Service API relay). This one talks straight to the SQL Server underneath BUSY
// to close schema gaps #9/#16 in the integration report: nobody has ever confirmed that the item
// master really is Master1/MasterType=6, or that vouchers really are Tran1/Tran2.
//
// Run:  node scripts/busy-sql/discover.mjs
// Env comes from .env via process.loadEnvFile() — no dotenv dependency needed on Node >= 20.12.

import sql from "mssql";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SAMPLE_ROW_LIMIT = 5;
const REPORT_PATH = join(import.meta.dirname, "discovery-report.json");

// Name fragments we expect the real tables to contain, best guess first. Used only when the
// documented name is absent — we report what we find, we never force-fit.
const ITEM_TABLE_PATTERNS = [/^master1$/i, /item/i, /stock/i, /product/i, /master/i];
const VOUCHER_TABLE_PATTERNS = [/^tran[12]$/i, /tran/i, /vch|voucher/i, /sale|invoice|bill/i];

const REQUIRED_ENV = [
  "BUSY_SQL_SERVER",
  "BUSY_SQL_DATABASE",
  "BUSY_SQL_READONLY_USER",
  "BUSY_SQL_READONLY_PASSWORD",
];

function fail(message, detail) {
  console.error(`\n✗ ${message}`);
  if (detail) console.error(`\n${detail}\n`);
  process.exit(1);
}

function loadConfig() {
  try {
    process.loadEnvFile();
  } catch {
    // No .env on disk is fine as long as the vars are already exported.
  }

  // Report every missing var at once — finding them one failed run at a time is miserable.
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    fail(
      `Missing required env var(s): ${missing.join(", ")}`,
      `Add them to .env (see .env.example). This script will not guess or fall back to defaults\n` +
        `for credentials — a silent connection to the wrong database is worse than no connection.`,
    );
  }

  return {
    server: process.env.BUSY_SQL_SERVER,
    port: Number(process.env.BUSY_SQL_PORT || 1433),
    database: process.env.BUSY_SQL_DATABASE,
    user: process.env.BUSY_SQL_READONLY_USER,
    password: process.env.BUSY_SQL_READONLY_PASSWORD,
    options: {
      // Legacy on-prem BUSY installs typically run SQL Server Express with a self-signed cert.
      encrypt: process.env.BUSY_SQL_ENCRYPT === "true",
      trustServerCertificate: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
}

/** Bracket-quote an identifier that came back from INFORMATION_SCHEMA, so odd names still work. */
function quoteIdent(name) {
  return `[${String(name).replace(/]/g, "]]")}]`;
}

async function listTables(pool) {
  const { recordset } = await pool.request().query(
    `select TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
       from INFORMATION_SCHEMA.TABLES
      order by TABLE_SCHEMA, TABLE_NAME`,
  );
  return recordset.map((r) => ({
    schema: r.TABLE_SCHEMA,
    name: r.TABLE_NAME,
    type: r.TABLE_TYPE,
    full: `${r.TABLE_SCHEMA}.${r.TABLE_NAME}`,
  }));
}

/** Columns from INFORMATION_SCHEMA (works even when the table is empty) plus a small row sample. */
async function describeTable(pool, table) {
  const columns = (
    await pool
      .request()
      .input("schema", sql.NVarChar, table.schema)
      .input("table", sql.NVarChar, table.name)
      .query(
        `select COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION,
                NUMERIC_SCALE, IS_NULLABLE, ORDINAL_POSITION
           from INFORMATION_SCHEMA.COLUMNS
          where TABLE_SCHEMA = @schema and TABLE_NAME = @table
          order by ORDINAL_POSITION`,
      )
  ).recordset.map((c) => ({
    name: c.COLUMN_NAME,
    type: c.CHARACTER_MAXIMUM_LENGTH
      ? `${c.DATA_TYPE}(${c.CHARACTER_MAXIMUM_LENGTH})`
      : c.NUMERIC_PRECISION
        ? `${c.DATA_TYPE}(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE})`
        : c.DATA_TYPE,
    nullable: c.IS_NULLABLE === "YES",
  }));

  const qualified = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
  const rowCount = (await pool.request().query(`select count(*) as n from ${qualified}`)).recordset[0].n;
  const sample = (await pool.request().query(`select top ${SAMPLE_ROW_LIMIT} * from ${qualified}`)).recordset;

  return { table: table.full, rowCount, columns, sample };
}

/**
 * Test the MasterType=6 hypothesis directly: show every MasterType present with its row count,
 * so we can see which one actually holds items rather than trusting the doc.
 */
async function masterTypeBreakdown(pool, table, columnNames) {
  const typeColumn = columnNames.find((c) => /^mastertype$/i.test(c));
  if (!typeColumn) return null;
  const qualified = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
  const nameColumn = columnNames.find((c) => /^name$/i.test(c));
  const example = nameColumn ? `, min(${quoteIdent(nameColumn)}) as ExampleName` : "";
  const { recordset } = await pool.request().query(
    `select ${quoteIdent(typeColumn)} as MasterType, count(*) as RowCount${example}
       from ${qualified} group by ${quoteIdent(typeColumn)} order by count(*) desc`,
  );
  return { column: typeColumn, values: recordset };
}

/** First table matching the highest-priority pattern that hits. Reports alternates too. */
function findCandidates(tables, patterns) {
  for (const pattern of patterns) {
    const matches = tables.filter((t) => pattern.test(t.name));
    if (matches.length) return { pattern: String(pattern), matches };
  }
  return { pattern: null, matches: [] };
}

function printTable(described) {
  console.log(`\n--- ${described.table}  (${described.rowCount} rows, ${described.columns.length} columns) ---`);
  console.log("  COLUMNS: " + described.columns.map((c) => `${c.name}:${c.type}`).join(", "));
  described.sample.forEach((row, i) => {
    console.log(`  [row ${i + 1}]`);
    for (const [k, v] of Object.entries(row)) {
      const shown = v instanceof Date ? v.toISOString() : typeof v === "string" ? v.trim() : v;
      if (shown !== null && shown !== "") console.log(`    ${k.padEnd(28)} = ${JSON.stringify(shown)}`);
    }
  });
  if (!described.sample.length) console.log("  (table is empty)");
}

async function main() {
  const config = loadConfig();
  console.log(`Connecting to ${config.server}:${config.port}/${config.database} as ${config.user} …`);

  let pool;
  try {
    pool = await sql.connect(config);
  } catch (err) {
    fail(
      `Could not connect to BUSY SQL Server at ${config.server}:${config.port}`,
      `${err.code ? err.code + ": " : ""}${err.message}\n\n` +
        `Check: the host is reachable (VPN/Tailscale up?), the SQL Browser/TCP port is open,\n` +
        `SQL Server authentication is enabled, and the read-only login has CONNECT on the database.`,
    );
  }

  const report = { generatedAt: new Date().toISOString(), database: config.database };

  try {
    const tables = await listTables(pool);
    report.tables = tables;
    console.log(`\n=== ${tables.length} tables/views in ${config.database} ===`);
    console.log(tables.map((t) => t.full).join(", "));

    for (const [label, patterns] of [
      ["item", ITEM_TABLE_PATTERNS],
      ["voucher", VOUCHER_TABLE_PATTERNS],
    ]) {
      const { pattern, matches } = findCandidates(tables, patterns);
      console.log(`\n=== ${label} candidates (matched ${pattern || "nothing"}) ===`);
      console.log(matches.length ? matches.map((t) => t.full).join(", ") : "  NONE FOUND");

      report[`${label}Candidates`] = { pattern, matches: matches.map((t) => t.full), described: [] };

      // Describe the top few matches rather than only the first — the documented name may exist
      // but hold something else entirely, and we want that visible in one run.
      for (const table of matches.slice(0, 3)) {
        const described = await describeTable(pool, table);
        printTable(described);
        if (label === "item") {
          const breakdown = await masterTypeBreakdown(pool, table, described.columns.map((c) => c.name));
          if (breakdown) {
            described.masterTypes = breakdown;
            console.log(`  MasterType breakdown (${breakdown.column}):`);
            for (const v of breakdown.values) {
              console.log(`    ${String(v.MasterType).padStart(4)} → ${String(v.RowCount).padStart(7)} rows` +
                (v.ExampleName ? `   e.g. ${String(v.ExampleName).trim()}` : ""));
            }
          }
        }
        report[`${label}Candidates`].described.push(described);
      }
    }

    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n✓ Discovery complete. Full report written to ${REPORT_PATH}`);
  } finally {
    await pool.close();
  }
}

await main();
