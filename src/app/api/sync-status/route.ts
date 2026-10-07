import { getSyncStatus } from "@/lib/catalog";
import { STALE_AFTER_MINUTES } from "@/lib/site";

// Public health check for the BUSY sync: used by the site's live stock line and by n8n's stale-data alert.
// Timestamps and a status code only; error details stay in sync_runs / the runner log.
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSyncStatus();
  if (!s) return Response.json({ status: "UNAVAILABLE", stale: true }, { status: 503, headers: { "cache-control": "no-store" } });
  const ageSeconds = s.lastOkAt ? Math.round((Date.now() - Date.parse(s.lastOkAt)) / 1000) : null;
  return Response.json(
    {
      status: s.lastStatus ?? "NEVER_RUN", // status of the most recent run, OK or an error code
      last_success_at: s.lastOkAt,
      last_change_at: s.lastChangeAt,
      last_run_at: s.lastRunAt,
      age_seconds: ageSeconds,
      stale: ageSeconds == null || ageSeconds > STALE_AFTER_MINUTES * 60,
    },
    // 10 s at the CDN: absorbs floods of this public endpoint (one DB read per 10 s at most); the site polls every 30 s.
    { headers: { "cache-control": "public, max-age=0, s-maxage=10" } },
  );
}
