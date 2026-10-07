// Sync runner for n8n. Runs on the cloud server that reaches the shop PC over Tailscale; n8n calls it every 60 s.
//   node scripts/busy-sync/server.mjs            (or: npm run sync:server)
//   POST /run/delta | /run/full   Authorization: Bearer $SYNC_RUNNER_TOKEN
//     200 → run OK, 500 → run failed (body = run record: status, error, status_changed, counts…),
//     409 → a previous run is still going (skipped, not an error), 401/404 → bad token / path.
//   GET /health → 200 "ok" (process is up; says nothing about BUSY).
// Always a live run: needs ALLOW_LIVE_WRITE=true + the Supabase service key, like `index.mjs <job> --live`.
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { loadConfig, loadDotEnv, runSync } from "./index.mjs";

const DEFAULT_PORT = 8787;
const MIN_TOKEN_LENGTH = 24;
const ROUTE = /^\/run\/(delta|full)$/;

loadDotEnv();
const token = process.env.SYNC_RUNNER_TOKEN ?? "";
if (token.length < MIN_TOKEN_LENGTH) throw new Error(`SYNC_RUNNER_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters.`);
loadConfig(["delta", "--live"]); // fail at startup, not on the first call, if live writes aren't allowed

const authorized = (header = "") => {
  const given = Buffer.from(header.replace(/^Bearer /, ""));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
};

// ponytail: one run at a time in this process; a second runner process would need a lock in the database.
let running = null;

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (!authorized(req.headers.authorization)) return send(res, 401, { error: "unauthorized" });
  const job = req.method === "POST" && ROUTE.exec(req.url ?? "")?.[1];
  if (!job) return send(res, 404, { error: "POST /run/delta or /run/full" });
  if (running) return send(res, 409, { status: "SKIPPED", reason: `${running} run still in progress` });

  running = job;
  try {
    const run = await runSync(loadConfig([job, "--live"]));
    console.log(`[runner] ${job} ${run.status} changes=${run.changes} ${run.duration_ms}ms${run.error ? ` — ${run.error}` : ""}`);
    send(res, run.status === "OK" ? 200 : 500, run);
  } catch (err) {
    // runSync never throws; this is config (e.g. .env edited to something invalid) — still a JSON 500 for n8n.
    send(res, 500, { status: "CONFIG_ERROR", error: err.message, status_changed: true });
  } finally {
    running = null;
  }
}).listen(Number(process.env.SYNC_RUNNER_PORT || DEFAULT_PORT), process.env.SYNC_RUNNER_HOST || "127.0.0.1", function () {
  console.log(`[runner] listening on ${this.address().address}:${this.address().port}`);
});
