import { getSyncStatus } from "@/lib/catalog";
import { StockFreshness } from "./stock-freshness";

// Server half: hands the current sync status to the live client line.
export async function StockUpdated() {
  const s = await getSyncStatus();
  return <StockFreshness initial={{ lastOkAt: s?.lastOkAt ?? null, lastChangeAt: s?.lastChangeAt ?? null }} />;
}
