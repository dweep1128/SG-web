import { updatedAgo } from "@/lib/catalog-types";
import { serverSupabase } from "@/lib/supabase-server";
import { Badge } from "../ui";

// Stock is meant to refresh every 15–30 min; past this, something (BUSY closed, PC off, scheduler) needs a look.
const STALE_MS = 2 * 60 * 60 * 1000;

type Row = { job: "items" | "stock" | "full"; last_ok_at: string | null; last_run_at: string | null; last_status: string | null; catalog_items: number };

const newest = (dates: (string | null)[]) => dates.filter(Boolean).sort().at(-1) ?? null;

// One line on the portal home: when BUSY stock/prices last reached the site. Hidden if supabase/handover-audit.sql
// (which creates sync_health()) hasn't been run yet.
export async function SyncHealth() {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc("sync_health");
  if (error || !data?.length) return null;
  const rows = data as Row[];
  const at = (job: Row["job"]) => rows.find((r) => r.job === job);
  const stockOk = newest([at("stock")?.last_ok_at ?? null, at("full")?.last_ok_at ?? null]);
  const now = Date.now();
  const stale = !stockOk || now - new Date(stockOk).getTime() > STALE_MS;
  const lastRun = rows.filter((r) => r.last_run_at).sort((a, b) => b.last_run_at!.localeCompare(a.last_run_at!))[0];
  const failed = lastRun && lastRun.last_status !== "OK" ? lastRun.last_status : null;

  return (
    <p className="sk-sync" role="status">
      <span>
        BUSY stock &amp; prices: {stockOk ? updatedAgo(stockOk, now).replace("Updated", "updated") : "never synced"} · {rows[0].catalog_items.toLocaleString("en-IN")} items
      </span>
      {stale && <Badge tone="low">Sync is late</Badge>}
      {failed && <Badge tone="low">Last run: {failed}</Badge>}
    </p>
  );
}
