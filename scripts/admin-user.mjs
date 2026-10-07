// Create a portal login or change its role. Server-side only (service role key).
//   node scripts/admin-user.mjs <email> <owner|staff|none> [password]
// New user without a password → a random one is generated and printed ONCE. Existing user → only the role changes
// (plus the password, if one is given). "none" removes portal access without deleting the account.
// The role lives in app_metadata, which only the service role can write; the user must sign in again to pick it up.
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROLES = ["owner", "staff", "none"];
const MIN_PASSWORD = 12;
const GENERATED_PASSWORD_BYTES = 12;
const PAGE = 1000;

try {
  process.loadEnvFile(join(import.meta.dirname, "..", ".env"));
} catch {
  // env from the host
}
const [email, role, password] = process.argv.slice(2);
if (!email?.includes("@") || !ROLES.includes(role)) throw new Error("Usage: node scripts/admin-user.mjs <email> <owner|staff|none> [password]");
if (password && password.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
const app_metadata = { role: role === "none" ? null : role };

let existing = null;
for (let page = 1; !existing; page++) {
  const { data, error } = await admin.listUsers({ page, perPage: PAGE });
  if (error) throw error;
  existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (data.users.length < PAGE) break;
}

if (existing) {
  const { error } = await admin.updateUserById(existing.id, { app_metadata, ...(password && { password }) });
  if (error) throw error;
  console.log(`${email}: role ${role}${password ? ", password changed" : ""}. They must sign out and in again.`);
} else {
  if (role === "none") throw new Error(`${email} does not exist.`);
  const pw = password ?? randomBytes(GENERATED_PASSWORD_BYTES).toString("base64url");
  const { error } = await admin.createUser({ email, password: pw, email_confirm: true, app_metadata });
  if (error) throw error;
  console.log(`Created ${email} (${role}).${password ? "" : ` Password: ${pw}  ← give it to them in person; it is not stored anywhere else.`}`);
}
