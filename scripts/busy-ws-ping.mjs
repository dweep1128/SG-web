// BUSY Web Service health check. READ-ONLY: SC=1 only, and the query is asserted to be a SELECT.
// Run: node scripts/busy-ws-ping.mjs ["Select 1"] [--full]   (--full prints the whole body, untruncated)
import { request } from "node:http";

const TIMEOUT_MS = 10_000; // BUSY hangs (never refuses) when a modal dialog is open in its UI.
const PREVIEW_CHARS = 2000;
const args = process.argv.slice(2);
const full = args.includes("--full");
const qry = args.find((a) => a !== "--full") ?? "Select 1";

// Guard, not decoration: SC=1 is documented as "run SQL", not "run SELECT" (gap #4 in the report).
if (!/^\s*select\s/i.test(qry)) throw new Error(`Refusing non-SELECT query: ${qry}`);

process.loadEnvFile("D:/SG-web/.env");
const { BUSY_HOST: host, BUSY_PORT: port, BUSY_USERNAME, BUSY_PASSWORD } = process.env;
const missing = ["BUSY_HOST", "BUSY_PORT", "BUSY_USERNAME", "BUSY_PASSWORD"].filter((k) => !process.env[k]);
if (missing.length) throw new Error(`Missing env var(s): ${missing.join(", ")}`);

console.log(`GET http://${host}:${port}  SC=1  Qry=${qry}`);

const req = request({ host, port, method: "GET", headers: { SC: "1", UserName: BUSY_USERNAME, Pwd: BUSY_PASSWORD, Qry: qry } }, (res) => {
  console.log(`HTTP ${res.statusCode}`);
  console.log(`Result: ${res.headers.result ?? "(absent)"}`);
  console.log(`Description: ${res.headers.description ?? "(absent)"}`);
  res.setEncoding("utf8");
  let body = "";
  res.on("data", (c) => (body += c));
  res.on("end", () => console.log(`Body (${body.length} bytes):\n${full ? body : body.slice(0, PREVIEW_CHARS)}`));
});
req.setTimeout(TIMEOUT_MS, () => { console.error(`TIMEOUT after ${TIMEOUT_MS}ms — connected but no response.`); req.destroy(); });
req.on("error", (e) => console.error(`ERROR ${e.code ?? ""}: ${e.message}`));
req.end();
