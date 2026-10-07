// LOCAL TESTING ONLY — prepares a local Supabase (`npx supabase start`) with this repo's schema and test data.
// Refuses to run unless SUPABASE_URL is this machine, so test rows can never reach the production project.
//   node scripts/local/seed.mjs
// Env: SUPABASE_URL=http://127.0.0.1:54321, SUPABASE_SERVICE_ROLE_KEY (local key from `npx supabase status`),
//      LOCAL_DB_CONTAINER (e.g. supabase_db_<folder>), LOCAL_TEST_PASSWORD (used for all three test logins).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(import.meta.dirname, "..", "..");
const LOCAL = new Set(["localhost", "127.0.0.1"]);
// Same order as HANDOVER.md §3. schema.sql + finish-setup.sql are one-shot, so they run only on an empty database.
const ONE_SHOT = ["schema.sql", "finish-setup.sql"];
const MIGRATIONS = ["busy-sync.sql", "busy-catalog-list.sql", "sk-image.sql", "handover-audit.sql", "live-sync-admin.sql", "display-name.sql", "stock-status-only.sql"];

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOCAL_DB_CONTAINER, LOCAL_TEST_PASSWORD } = process.env;
if (!SUPABASE_URL || !LOCAL.has(new URL(SUPABASE_URL).hostname)) throw new Error("seed.mjs only runs against a local Supabase (SUPABASE_URL=http://127.0.0.1:54321).");
if (!SUPABASE_SERVICE_ROLE_KEY || !LOCAL_DB_CONTAINER || !LOCAL_TEST_PASSWORD) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY, LOCAL_DB_CONTAINER and LOCAL_TEST_PASSWORD.");

const psql = (sqlText) =>
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"], { input: sqlText, encoding: "utf8" }).trim();

const fresh = psql("select to_regclass('public.products') is null;") === "t";
for (const file of [...(fresh ? ONE_SHOT : []), ...MIGRATIONS]) {
  psql(readFileSync(join(ROOT, "supabase", file), "utf8"));
  console.log(`applied supabase/${file}`);
}
// The live project has "Allow new users to sign up" OFF; mirror it by never creating users except below.

for (const [email, role] of [["owner@local.test", "owner"], ["staff@local.test", "staff"], ["norole@local.test", "none"]]) {
  const create = role === "none" ? ["staff"] : [role]; // create with a role, then strip it: exercises the "no access" path
  execFileSync("node", [join(ROOT, "scripts", "admin-user.mjs"), email, ...create, LOCAL_TEST_PASSWORD], { stdio: "inherit" });
  if (role === "none") execFileSync("node", [join(ROOT, "scripts", "admin-user.mjs"), email, "none"], { stdio: "inherit" });
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await db.from("products_manual").upsert(
  [
    { sku: "LT-MIRROR", name: "Rear view mirror set", display_name: "Rear-view mirror set (pair)", category: null, price: 240, stock: null, in_stock: true, description: "Local test portal product.", is_active: true },
    { sku: "LT-HIDDEN", name: "Hidden portal product", display_name: null, category: null, price: 99, stock: 5, in_stock: false, description: "Must never show on the site.", is_active: false },
  ],
  { onConflict: "sku" },
);
if (error) throw error;
console.log("seeded 2 portal products (1 visible, 1 hidden). Now: fake-busy.mjs setup, then the sync.");
