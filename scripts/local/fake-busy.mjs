// LOCAL TESTING ONLY — a fake BUSY SQL Server (Docker) with just the columns the sync reads.
// Refuses to run unless BUSY_SQL_SERVER is this machine. Never point it at the shop PC.
//   node scripts/local/fake-busy.mjs setup                 two company DBs (Comp0003 = right, Comp0001 = decoy), the
//                                                          webapp_readonly login, and a schema baseline for the sync
//   node scripts/local/fake-busy.mjs sell <code> <qty>     a sale in "BUSY": stock of <code> goes down by <qty>
//   node scripts/local/fake-busy.mjs price <code> <price>  a price edit in "BUSY" (Stamp moves, like BUSY does)
// Env: FAKE_BUSY_SA_PASSWORD (container admin), BUSY_SQL_SERVER/PORT, BUSY_SQL_READONLY_USER/PASSWORD, BUSY_EXPECTED_DB.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { createBusyReader } from "../busy-sync/busy.mjs";

const DECOY_DB = "BusyComp0001_db12026"; // the similarly named wrong company
const LOCAL = new Set(["localhost", "127.0.0.1"]);
const BASELINE_PATH = join(import.meta.dirname, "..", "..", "local-data", "fake-busy-schema-baseline.json");

const env = process.env;
if (!LOCAL.has(env.BUSY_SQL_SERVER)) throw new Error("fake-busy only runs against a local SQL Server (BUSY_SQL_SERVER=127.0.0.1).");
for (const k of ["FAKE_BUSY_SA_PASSWORD", "BUSY_SQL_READONLY_USER", "BUSY_SQL_READONLY_PASSWORD", "BUSY_EXPECTED_DB"]) if (!env[k]) throw new Error(`${k} is not set.`);
const ident = (s) => {
  if (!/^\w+$/.test(s)) throw new Error(`Bad identifier ${s}`);
  return s;
};
const connect = (database = "master") =>
  new sql.ConnectionPool({
    server: env.BUSY_SQL_SERVER, port: Number(env.BUSY_SQL_PORT || 1433), database, user: "sa", password: env.FAKE_BUSY_SA_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
  }).connect();

// [code, name, opening stock, price]. Group 401 / unit 501 / 18% tax category 601.
const ITEMS = {
  [env.BUSY_EXPECTED_DB]: [
    [1001, "CONTROLLER 48V 20A", 12, 1850], [1002, "CHARGER  60V 3A", 4, 1320], [1003, "BRAKE SHOE SET FRONT", 0, 145],
    [1004, "HEADLIGHT LED 12V", 25, 390], [1005, "THROTTLE ASSEMBLY", 7, 260], [1006, "HUB MOTOR 1000W", 2, 7400],
  ],
  [DECOY_DB]: [[1001, "WRONG COMPANY ITEM", 99, 1]],
};

async function setup() {
  const master = await connect();
  const q = (s) => master.request().query(s);
  const ro = ident(env.BUSY_SQL_READONLY_USER);
  const pw = env.BUSY_SQL_READONLY_PASSWORD.replace(/'/g, "''");
  await q(`IF SUSER_ID('${ro}') IS NULL CREATE LOGIN [${ro}] WITH PASSWORD = '${pw}', CHECK_POLICY = OFF`);
  for (const [dbName, items] of Object.entries(ITEMS)) {
    const db = ident(dbName);
    await q(`IF DB_ID('${db}') IS NOT NULL BEGIN ALTER DATABASE [${db}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${db}]; END`);
    await q(`CREATE DATABASE [${db}]`);
    const pool = await connect(db);
    await pool.request().batch(`
      CREATE TABLE Master1 (Code int PRIMARY KEY, MasterType int NOT NULL, Name nvarchar(200) NOT NULL, Alias nvarchar(50) NULL,
        PrintName nvarchar(200) NULL, HSNCode nvarchar(20) NULL, Stamp int NOT NULL DEFAULT 1, D3 float NOT NULL DEFAULT 0,
        ParentGrp int NULL, CM1 int NULL, CM8 int NULL, DeactiveMaster bit NOT NULL DEFAULT 0, BlockedMaster bit NOT NULL DEFAULT 0);
      CREATE TABLE MasterSupport (MasterCode int NOT NULL, MasterType int NOT NULL, D2 float NULL);
      CREATE TABLE Folio1 (MasterCode int NOT NULL, MasterType int NOT NULL, D1 float NULL);
      CREATE TABLE Tran2 (MasterCode1 int NOT NULL, RecType int NOT NULL, Value1 float NOT NULL);
      INSERT Master1 (Code, MasterType, Name) VALUES (401, 5, 'General'), (501, 8, 'Pcs.');
      INSERT MasterSupport VALUES (601, 25, 18);
      CREATE USER [${ro}] FOR LOGIN [${ro}];
      ALTER ROLE db_datareader ADD MEMBER [${ro}];`);
    for (const [code, name, stock, price] of items) {
      await pool.request().input("code", code).input("name", name).input("stock", stock).input("price", price).query(
        `INSERT Master1 (Code, MasterType, Name, PrintName, HSNCode, D3, ParentGrp, CM1, CM8) VALUES (@code, 6, @name, @name, '8714', @price, 401, 501, 601);
         INSERT Folio1 VALUES (@code, 6, @stock);`,
      );
    }
    await pool.close();
  }
  await master.close();

  // Baseline = this fake's column fingerprint, so the sync's schema check passes here (production keeps the real one).
  const pool = await connect(env.BUSY_EXPECTED_DB);
  const exec = async (text) => {
    const { recordset } = await pool.request().query(text);
    return { rows: [...recordset], columns: Object.values(recordset.columns).sort((a, b) => a.index - b.index).map((c) => c.name), ms: 0 };
  };
  const { observed } = await createBusyReader({ exec, expectedDb: env.BUSY_EXPECTED_DB, log: () => {} }).checkSchema({});
  mkdirSync(join(BASELINE_PATH, ".."), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify({ note: "LOCAL fake BUSY only", tables: observed }, null, 2));
  await pool.close();
  console.log(`Fake BUSY ready: ${Object.keys(ITEMS).join(" + ")}; login ${ro} (db_datareader). Baseline: ${BASELINE_PATH}`);
}

async function change(kind, code, value) {
  if (!Number.isInteger(code) || !Number.isFinite(value)) throw new Error("Usage: sell <code> <qty> | price <code> <price>");
  const pool = await connect(env.BUSY_EXPECTED_DB);
  const r = pool.request().input("code", code).input("v", value);
  await r.query(kind === "sell" ? "INSERT Tran2 VALUES (@code, 2, -@v)" : "UPDATE Master1 SET D3 = @v, Stamp = Stamp + 1 WHERE Code = @code AND MasterType = 6");
  await pool.close();
  console.log(`${kind} ${code} ${value}: done in ${env.BUSY_EXPECTED_DB}`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "setup") await setup();
else if (cmd === "sell" || cmd === "price") await change(cmd, Number(a), Number(b));
else throw new Error("Usage: fake-busy.mjs setup | sell <code> <qty> | price <code> <price>");
