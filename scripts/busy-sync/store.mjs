// Where sync results go. Two stores with the same shape:
//  - local (dry-run): simulates the busy_items / sync_runs tables as files under SYNC_DATA_DIR. No network.
//  - supabase (live): writes busy_items + sync_runs with the service role key. Server-side only.
// The sync owns busy_items outright and never writes public.products (see supabase/busy-sync.sql).
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UPSERT_CHUNK = 500;
const READ_PAGE = 1000; // PostgREST default max rows per request
// Columns the sync needs back from the last run to plan the next one (stamps, sanity baselines, counts).
const STATE_COLUMNS =
  "busy_code, busy_name, busy_stamp, busy_group_code, busy_group_name, sale_price, is_active, busy_blocked, busy_deactivated, missing_from_busy, exclude_from_catalog";

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/** What busy_items looks like after an item save: upsert by busy_code, then flag codes BUSY no longer has. Never deletes. */
export function mergeState(state, upserts, missingCodes) {
  const byCode = new Map(state.map((r) => [r.busy_code, r]));
  for (const row of upserts) byCode.set(row.busy_code, { ...byCode.get(row.busy_code), ...row });
  for (const code of missingCodes) {
    if (byCode.has(code)) byCode.set(code, { ...byCode.get(code), is_active: false, missing_from_busy: true });
  }
  return [...byCode.values()].sort((a, b) => a.busy_code - b.busy_code);
}

export function createLocalStore(dir) {
  const itemsPath = join(dir, "busy_items.json");
  const runsPath = join(dir, "sync_runs.jsonl");

  async function loadItemState() {
    try {
      return JSON.parse(await readFile(itemsPath, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }

  return {
    kind: "local",
    loadItemState,

    /** counts.items of the newest OK run that pulled items (items or full), or null. */
    async loadLastSuccessfulItemCounts() {
      let text;
      try {
        text = await readFile(runsPath, "utf8");
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
      const runs = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
      return runs.findLast((r) => r.status === "OK" && r.counts?.items)?.counts.items ?? null;
    },

    /** Mirrors the live semantics: upsert by busy_code, flag missing codes, update stock only on existing rows. */
    async save({ upserts, missingCodes, stock }) {
      const rows = mergeState(await loadItemState(), upserts, missingCodes);
      const byCode = new Map(rows.map((r) => [r.busy_code, r]));
      let stockUpdated = 0;
      for (const s of stock?.rows ?? []) {
        const r = byCode.get(s.busy_code);
        if (!r) continue; // same as the live RPC: stock never creates an item row
        Object.assign(r, { stock_qty: s.stock_qty, stock_synced_at: stock.synced_at, stock_visible: stock.visible });
        stockUpdated++;
      }
      await mkdir(dir, { recursive: true });
      const tmp = `${itemsPath}.tmp`; // write-then-rename so a crash never leaves half a state file
      await writeFile(tmp, JSON.stringify(rows, null, 1));
      await rename(tmp, itemsPath);
      return { stock_updated: stockUpdated };
    },

    async recordRun(run) {
      await mkdir(dir, { recursive: true });
      await appendFile(runsPath, JSON.stringify(run) + "\n");
    },
  };
}

export async function createSupabaseStore({ supabaseUrl, serviceKey }) {
  // Imported lazily so a dry-run never even loads the Supabase client.
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = (what, { error }) => {
    if (error) throw new Error(`Supabase ${what}: ${error.message}`);
  };

  return {
    kind: "supabase",

    async loadItemState() {
      const rows = [];
      for (let from = 0; ; from += READ_PAGE) {
        const res = await db.from("busy_items").select(STATE_COLUMNS).order("busy_code").range(from, from + READ_PAGE - 1);
        check("read busy_items", res);
        rows.push(...res.data);
        if (res.data.length < READ_PAGE) return rows;
      }
    },

    async loadLastSuccessfulItemCounts() {
      const res = await db.from("sync_runs").select("counts").eq("status", "OK").in("job", ["items", "full"]).order("finished_at", { ascending: false }).limit(1);
      check("read sync_runs", res);
      return res.data[0]?.counts?.items ?? null;
    },

    // ponytail: chunked writes are not one transaction; a failure mid-way leaves earlier chunks applied.
    // Safe because every write is an idempotent upsert/flag the next run repeats. Move to a single RPC if that stops being true.
    async save({ upserts, missingCodes, stock }) {
      for (const chunk of chunks(upserts, UPSERT_CHUNK)) check("upsert busy_items", await db.from("busy_items").upsert(chunk, { onConflict: "busy_code" }));
      for (const chunk of chunks(missingCodes, UPSERT_CHUNK)) {
        check("flag missing items", await db.from("busy_items").update({ is_active: false, missing_from_busy: true }).in("busy_code", chunk));
      }
      if (!stock) return { stock_updated: 0 };
      // RPC updates existing rows only; a plain upsert would fail NOT NULL busy_name for codes not synced yet.
      const res = await db.rpc("apply_busy_stock", { p_stock: stock.rows, p_synced_at: stock.synced_at, p_visible: stock.visible });
      check("apply_busy_stock", res);
      return { stock_updated: res.data };
    },

    async recordRun(run) {
      const { job, status, started_at, finished_at, duration_ms, busy_db, counts, details, error } = run;
      check("insert sync_runs", await db.from("sync_runs").insert({ job, status, started_at, finished_at, duration_ms, busy_db, counts, details, error }));
    },
  };
}
