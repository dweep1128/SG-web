// BUSY Web Service SC=1 query runner. READ-ONLY by construction, not by intent:
//  - SC is a constant "1"; there is no way to send any other service code.
//  - The query must be one SELECT/WITH statement with no write, DDL or exec keywords (assertReadOnly).
//  - DB_NAME() must equal BUSY_EXPECTED_DB before the query runs (assertExpectedDb).
//  - Requests are spaced >= 1s apart, across processes too — staff use BUSY live.
// Run:  node scripts/busy-query.mjs "SELECT TOP 5 Code, Name FROM Master1 WHERE MasterType=6"
// Out:  JSON { result, description, bytes, ms, columns, rows } on stdout.
import { request } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const SERVICE_CODE = "1";
const TIMEOUT_MS = 60_000; // BUSY's own CommandTimeout is 30s; leave room for transfer of big rowsets.
const MIN_GAP_MS = 1_000;
const LAST_REQUEST_FILE = join(tmpdir(), "busy-ws-last-request"); // shared by every process on this machine

// Blocked even inside a SELECT: T-SQL needs no ';' between statements ("SELECT 1 DELETE FROM x" runs both),
// SELECT ... INTO creates a table, and NEXT VALUE FOR advances a sequence.
const FORBIDDEN =
  /\b(insert|update|delete|merge|truncate|drop|alter|create|exec|execute|declare|set|grant|revoke|deny|into|dbcc|backup|restore|shutdown|kill|use|waitfor|bulk|reconfigure|openrowset|opendatasource|openquery|next\s+value|sp_\w*|xp_\w*)\b/i;
// One left-to-right pass so a '/*' inside a string can't hide code, and vice versa.
const NON_CODE = /'(?:[^']|'')*'|\[(?:[^\]]|\]\])*\]|"(?:[^"]|"")*"|--.*$|\/\*[\s\S]*?\*\//gm;

export function assertReadOnly(qry) {
  const code = qry.replace(NON_CODE, " ").trim();
  if (!/^(select|with)\b/i.test(code)) throw new Error(`Refusing: query must start with SELECT or WITH: ${qry.slice(0, 200)}`);
  if (code.includes(";")) throw new Error(`Refusing: ';' (multiple statements) not allowed: ${qry.slice(0, 200)}`);
  const hit = code.match(FORBIDDEN);
  if (hit) throw new Error(`Refusing: forbidden keyword '${hit[0]}': ${qry.slice(0, 200)}`);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] !== "#" ? (ENTITIES[e] ?? m) : String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))),
  );
const ATTR = /([\w:.-]+)\s*=\s*(?:'([^']*)'|"([^"]*)")/g;
const attrs = (s) => Object.fromEntries([...s.matchAll(ATTR)].map((m) => [m[1], decode(m[2] ?? m[3])]));
// decimal ("number") stays a string so money values keep their exact digits.
const NUMERIC = new Set(["i1", "i2", "i4", "i8", "ui1", "ui2", "ui4", "ui8", "r4", "r8", "float", "int"]);

/** ADO persisted rowset XML → { columns, rows }. NULLs are absent attributes in ADO, so they come back as null. */
export function parseRowset(xml) {
  const columns = [...xml.matchAll(/<s:AttributeType\s([^>]*)>[\s\S]*?<s:datatype\s([^>]*?)\/?>/g)].map((m) => {
    const a = attrs(m[1]);
    const d = attrs(m[2]);
    // ADO renames columns that aren't valid XML names (e.g. 'c0') and keeps the real name in rs:name.
    return { attr: a.name, name: a["rs:name"] ?? a.name, type: d["dt:type"], maxLength: d["dt:maxLength"] };
  });
  const rows = [...xml.matchAll(/<z:row((?:\s+[\w:.-]+\s*=\s*(?:'[^']*'|"[^"]*"))*)\s*\/>/g)].map((m) => {
    const raw = attrs(m[1]);
    return Object.fromEntries(
      columns.map((c) => {
        const v = raw[c.attr];
        if (v === undefined) return [c.name, null];
        if (NUMERIC.has(c.type)) return [c.name, Number(v)];
        if (c.type === "boolean") return [c.name, v === "True" || v === "true" || v === "1"];
        return [c.name, v];
      }),
    );
  });
  return { columns: columns.map(({ name, type, maxLength }) => ({ name, type, maxLength })), rows };
}

function loadEnv() {
  process.loadEnvFile(join(import.meta.dirname, "..", ".env"));
  const keys = ["BUSY_HOST", "BUSY_PORT", "BUSY_USERNAME", "BUSY_PASSWORD", "BUSY_EXPECTED_DB"];
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env var(s): ${missing.join(", ")}`);
  return process.env;
}

async function waitForGap() {
  let last = 0;
  try {
    last = Number(readFileSync(LAST_REQUEST_FILE, "utf8")) || 0;
  } catch {
    // No file yet = no recent request.
  }
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
}

/** Sends one guarded SC=1 request. Does NOT check the database — use query() unless you are the guard. */
async function send(qry) {
  assertReadOnly(qry);
  const { BUSY_HOST: host, BUSY_PORT: port, BUSY_USERNAME, BUSY_PASSWORD } = loadEnv();
  await waitForGap();
  const started = Date.now();
  try {
    return await new Promise((resolve, reject) => {
      const headers = { SC: SERVICE_CODE, UserName: BUSY_USERNAME, Pwd: BUSY_PASSWORD, Qry: qry };
      const req = request({ host, port, method: "GET", headers }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const body = buf.toString("utf8");
          const { result = null, description = null } = res.headers;
          resolve({ http: res.statusCode, result, description, bytes: buf.length, ms: Date.now() - started, ...parseRowset(body), body });
        });
        res.on("error", reject);
      });
      req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`TIMEOUT after ${TIMEOUT_MS}ms`)));
      req.on("error", reject);
      req.end();
    });
  } finally {
    writeFileSync(LAST_REQUEST_FILE, String(Date.now()));
  }
}

/** Throws unless BUSY is answering for the expected company DB ("Please open a company" lands here too). */
export async function assertExpectedDb() {
  const expected = loadEnv().BUSY_EXPECTED_DB;
  const r = await send("SELECT DB_NAME() AS db");
  const actual = r.rows[0]?.db ?? null;
  if (r.result !== "T" || actual !== expected) {
    throw new Error(`DB guard failed: Result=${r.result} Description=${r.description} DB_NAME()=${actual} expected=${expected}`);
  }
}

/** Guarded read: DB check, then the query. Returns the send() result (body included). */
export async function query(qry) {
  assertReadOnly(qry); // fail before spending a request on the guard
  await assertExpectedDb();
  return send(qry);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const qry = process.argv[2];
  if (!qry) throw new Error('Usage: node scripts/busy-query.mjs "SELECT ..."');
  const { body, ...out } = await query(qry);
  console.log(JSON.stringify(out, null, 2));
  if (out.result !== "T") process.exitCode = 1;
}
