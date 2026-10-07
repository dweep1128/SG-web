// Shared by the live (read-only) checks. Reads ONLY LIVE_SUPABASE_URL, LIVE_SUPABASE_ANON_KEY, LIVE_SITE_URL from the
// process environment: no .env file is loaded, so no other secret can be read or used. Refuses anything that looks like
// a service-role / secret key. The key is never printed.
export function liveEnv({ needSite = false } = {}) {
  const { LIVE_SUPABASE_URL: url, LIVE_SUPABASE_ANON_KEY: key, LIVE_SITE_URL: site } = process.env;
  if (!url || !key || (needSite && !site)) throw new Error(`Set LIVE_SUPABASE_URL, LIVE_SUPABASE_ANON_KEY${needSite ? ", LIVE_SITE_URL" : ""} in the shell (nothing is read from .env).`);
  if (key.startsWith("sb_secret_")) throw new Error("LIVE_SUPABASE_ANON_KEY holds a secret key. Use the publishable/anon key only.");
  if (key.split(".").length === 3) {
    const role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
    if (role !== "anon") throw new Error(`LIVE_SUPABASE_ANON_KEY is a "${role}" JWT. Use the anon key only.`);
  }
  return { url: url.replace(/\/$/, ""), key, site };
}

// Quantity-like column names. stock_status / stock_synced_at are the allowed ones.
export const isQuantityKey = (k) => /stock|qty|quantity|available/i.test(k) && !["stock_status", "stock_synced_at"].includes(k);
export const STATUS_VALUES = ["in_stock", "low_stock", "out_of_stock", "ask"];
