import { updatedAgo } from "@/lib/catalog-types";
import { serverSupabase } from "@/lib/supabase-server";
import { Badge } from "../ui";

// The sync runs every minute; past this, something (PC off, Tailscale, BUSY SQL, n8n) needs a look.
// Same threshold as n8n's stale-data alert.
const STALE_MS = 10 * 60 * 1000;

type Row = { last_ok_at: string | null; last_run_at: string | null; last_status: string | null; last_error: string | null; consecutive_failures: number; catalog_items: number };

// One line on the portal home: when BUSY stock/prices last reached the site. Hidden if portal_sync_status()
// (supabase/live-sync-admin.sql) isn't there yet.
export async function SyncHealth() {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc("portal_sync_status").maybeSingle<Row>();
  if (error || !data) return null;
  const now = Date.now();
  const stale = !data.last_ok_at || now - new Date(data.last_ok_at).getTime() > STALE_MS;
  const failed = data.last_status && data.last_status !== "OK";

  return (
    <p className="sk-sync" role="status">
      <span>
        BUSY stock &amp; prices: {data.last_ok_at ? updatedAgo(data.last_ok_at, now).replace("Updated", "updated") : "never synced"} · {data.catalog_items.toLocaleString("en-IN")} items
      </span>
      {stale && <Badge tone="low">Sync is late</Badge>}
      {failed && <span title={data.last_error ?? undefined}><Badge tone="out">Last run: {data.last_status} ×{data.consecutive_failures}</Badge></span>}
    </p>
  );
}
