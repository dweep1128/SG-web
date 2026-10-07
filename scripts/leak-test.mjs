// Leak test against a RUNNING build (`npm run build && npm start`): crawls public pages (HTML + RSC payload), the
// sitemap, robots, public APIs and every JS chunk they load, and greps all of it for exact stock quantities, secrets
// and BUSY / infrastructure identifiers. Source maps must 404. Prints where and which rule, never the matched secret.
//
//   npm run check:leaks -- --site=http://localhost:3000 [--max-pages=300]
//
// Secret values to look for come from .env / .env.local / the environment (only the ones that are set).
import { existsSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
// --live: site from LIVE_SITE_URL and NO .env is read, so no secret value is loaded (only the shape rules run).
const LIVE = "live" in args;
const SITE = LIVE ? process.env.LIVE_SITE_URL : args.site;
const MAX_PAGES = Number(args["max-pages"] ?? 300);
if (!SITE) throw new Error("Usage: npm run check:leaks -- --site=http://localhost:3000   or   LIVE_SITE_URL=https://… npm run check:leaks -- --live");
if (!LIVE) for (const f of [".env", ".env.local"]) if (existsSync(f)) process.loadEnvFile(f);

const SECRET_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_API_KEY", "SYNC_RUNNER_TOKEN", "VERCEL_OIDC_TOKEN",
  "BUSY_PASSWORD", "BUSY_SQL_READONLY_PASSWORD", "BUSY_SQL_READWRITE_PASSWORD", "BUSY_SQL_SERVER", "BUSY_HOST", "HEALTHCHECK_URL",
];
const MIN_SECRET_LENGTH = 6; // shorter values would match ordinary text
const secrets = LIVE ? [] : SECRET_ENV.map((k) => [k, process.env[k]?.trim()]).filter(([, v]) => v && v.length >= MIN_SECRET_LENGTH && !/^(localhost|127\.0\.0\.1|YOUR_)/.test(v));

const RULES = [
  ["quantity field with a number", /"(stock|stock_qty|qty|quantity|available_quantity|available)"\s*:\s*-?\d/i],
  ["quantity column name", /\b(stock_qty|available_quantity)\b/],
  ["'only N left' style text", /\bonly \d+ (left|in stock|available)\b|\b\d+ (units? )?(left|in stock)\b/i],
  ["BUSY company database", /BusyComp\d{4}/i],
  ["BUSY SQL login", /webapp_read(only|write)/i],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["service-role JWT", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS[A-Za-z0-9_-]*/],
  ["Tailscale address", /\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b|\.ts\.net\b/],
  ["cost / purchase price", /\b(cost_price|purchase_price|purc_price|supplier)\b/i],
];

const QUANTITY_RULES = new Set(RULES.slice(0, 3).map(([name]) => name));
const origin = new URL(SITE).origin;
const findings = [];
const fetched = new Set();
let bytes = 0;

function scan(url, text) {
  bytes += text.length;
  // The matched text is shown only for quantity rules; a matched key is never printed.
  for (const [name, re] of RULES) if (re.test(text)) findings.push(`${url}: ${name}${QUANTITY_RULES.has(name) ? ` (${text.match(re)[0].slice(0, 40)})` : ""}`);
  for (const [k, v] of secrets) if (text.includes(v)) findings.push(`${url}: value of ${k}`);
}

async function get(url, headers = {}) {
  const res = await fetch(url, { headers, redirect: "manual" });
  const text = await res.text();
  scan(`${url}${headers.RSC ? " [RSC]" : ""}`, text);
  for (const [k, v] of res.headers) if (/set-cookie|location|x-/i.test(k)) scan(`${url} header ${k}`, v);
  return { res, text };
}

const pages = ["/", "/parts", "/parts?stock=in", "/parts?sort=price-desc", "/search?q=charger", "/about", "/consultancy", "/quote", "/sk-image/login", "/nope-404", "/parts/abc"];
const other = ["/sitemap.xml", "/robots.txt", "/api/search-index", "/api/sync-status", "/api/sk-image/sign", "/manifest.webmanifest"];
const scripts = new Set();

for (const path of other) {
  const { text } = await get(origin + path);
  if (path === "/sitemap.xml") for (const m of text.matchAll(/<loc>([^<]+)<\/loc>/g)) pages.push(new URL(m[1]).pathname + new URL(m[1]).search);
}

while (pages.length && fetched.size < MAX_PAGES) {
  const path = pages.shift();
  if (fetched.has(path)) continue;
  fetched.add(path);
  const { res, text } = await get(origin + path);
  await get(origin + path, { RSC: "1" });
  if (!(res.headers.get("content-type") ?? "").includes("html")) continue;
  for (const m of text.matchAll(/<script[^>]+src="([^"]+)"/g)) scripts.add(new URL(m[1], origin).href);
  for (const m of text.matchAll(/href="(\/[^"#]*)"/g)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (!href.startsWith("/_next/") && !href.startsWith("/sk-image/") && !fetched.has(href)) pages.push(href);
  }
}

// Every chunk the pages load, plus the build manifest's list (covers lazily loaded chunks such as the portal's).
for (const src of [...scripts]) {
  const { text } = await get(src);
  for (const m of text.matchAll(/"(static\/chunks\/[^"]+\.js)"/g)) scripts.add(`${origin}/_next/${m[1]}`);
}
for (const src of scripts) {
  if (!fetched.has(src)) {
    fetched.add(src);
    await get(src);
  }
  const map = await fetch(`${src}.map`);
  if (map.ok) findings.push(`${src}.map: source map is publicly served`);
}

console.log(`leak test: ${fetched.size} URLs (${scripts.size} JS chunks), ${(bytes / 1e6).toFixed(1)} MB scanned, ${secrets.length} secret values checked`);
if (findings.length) {
  for (const f of [...new Set(findings)]) console.error(`LEAK ${f}`);
  process.exitCode = 1;
} else {
  console.log("no quantities, secrets or BUSY identifiers found");
}
