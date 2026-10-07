"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LIVE_REFRESH_SECONDS, SHOP_TIME_ZONE, STALE_AFTER_MINUTES } from "@/lib/site";

type Status = { lastOkAt: string | null; lastChangeAt: string | null };

const STALE_MS = STALE_AFTER_MINUTES * 60_000;
const DAY_MS = 86_400_000;
const time = new Intl.DateTimeFormat("en-IN", { timeZone: SHOP_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dateTime = new Intl.DateTimeFormat("en-IN", { timeZone: SHOP_TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// "Stock updated at 3:42 pm" + a quiet out-of-date note. Polls /api/sync-status while the tab is visible
// and re-renders the server data (router.refresh, no page reload) only when a sync actually changed something.
export function StockFreshness({ initial }: { initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [now, setNow] = useState<number | null>(null); // null until mounted, so server and first client render match
  // Version the server rendered this page with. Compared on every poll (not remembered once), so if a refresh comes
  // back from a still-stale ISR copy, the next poll simply refreshes again until the page matches.
  const rendered = useRef(initial.lastChangeAt);
  rendered.current = initial.lastChangeAt;

  useEffect(() => {
    let alive = true;
    async function poll() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/sync-status", { cache: "no-store" });
        const json = await res.json();
        if (!alive || !res.ok) return;
        setStatus({ lastOkAt: json.last_success_at, lastChangeAt: json.last_change_at });
        if (json.last_change_at && json.last_change_at !== rendered.current) router.refresh();
      } catch {
        // Offline or site down: keep showing what we have; the stale note covers it.
      } finally {
        if (alive) setNow(Date.now());
      }
    }
    setNow(Date.now());
    const id = setInterval(poll, LIVE_REFRESH_SECONDS * 1000);
    const onVisible = () => void (!document.hidden && poll());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const okAt = status.lastOkAt ? Date.parse(status.lastOkAt) : null;
  const stale = now != null && (okAt == null || now - okAt > STALE_MS);
  return (
    <p className="stock-fresh">
      {okAt == null ? (
        "Stock update time not available"
      ) : (
        <>
          Stock updated at <time dateTime={status.lastOkAt!}>{(now != null && now - okAt > DAY_MS ? dateTime : time).format(okAt)}</time>
        </>
      )}
      {stale && <span className="stock-fresh__stale"> · data may be out of date</span>}
    </p>
  );
}
