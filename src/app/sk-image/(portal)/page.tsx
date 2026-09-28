import Link from "next/link";
import { Pagination } from "@/components/catalog-view";
import { PartImage } from "@/components/part-image";
import { SearchInput } from "@/components/sk-image/search-input";
import { SyncHealth } from "@/components/sk-image/sync-health";
import { Badge, CodeTag, EmptyState } from "@/components/ui";
import { filterHref, type SearchParams } from "@/lib/listing";
import { photosHref, type Source } from "@/lib/sk-image";
import { PAGE_SIZE } from "@/lib/site";
import { serverSupabase } from "@/lib/supabase-server";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "none", label: "No photo" },
  { value: "has", label: "Has photo" },
  { value: "busy", label: "BUSY" },
  { value: "manual", label: "Manual" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];
type Row = { source: Source; product_key: string; name: string; sku: string; primary_image_url: string | null };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// PostgREST or() syntax breaks on , ( ) and LIKE treats % _ as wildcards: drop them. Words are joined with %, so
// "charger 60v" still finds BUSY's "CHARGER  60V" (double space).
function likePattern(q: string): string | null {
  const words = q.replace(/[%_*,()\\"':.]/g, " ").split(/\s+/).filter(Boolean);
  return words.length ? `%${words.join("%")}%` : null;
}

export default async function PhotosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? "";
  const filter: Filter = FILTERS.find((f) => f.value === first(sp.f))?.value ?? "all";
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await serverSupabase();
  let query = supabase.from("catalog_view").select("source, product_key, name, sku, primary_image_url", { count: "exact" });
  const pattern = likePattern(q);
  if (pattern) query = query.or(`name.ilike.${pattern},sku.ilike.${pattern}`);
  if (filter === "none") query = query.is("primary_image_url", null);
  if (filter === "has") query = query.not("primary_image_url", "is", null);
  if (filter === "busy" || filter === "manual") query = query.eq("source", filter);

  const [list, all, withPhoto] = await Promise.all([
    query.order("name").order("product_key").range(from, from + PAGE_SIZE - 1),
    supabase.from("catalog_view").select("product_key", { count: "exact", head: true }),
    supabase.from("catalog_view").select("product_key", { count: "exact", head: true }).not("primary_image_url", "is", null),
  ]);
  // PGRST103 = page past the end (e.g. a stale ?page=): show the empty state, not an error.
  if (list.error && list.error.code !== "PGRST103") throw new Error(list.error.message);
  const rows = (list.data ?? []) as Row[];
  const total = list.count ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const current = { q: q || undefined, f: filter === "all" ? undefined : filter };

  return (
    <div className="shell page">
      <div className="page__head">
        <h1 className="sk-title">Photos</h1>
        <p className="sk-stats">
          <strong>{(withPhoto.count ?? 0).toLocaleString("en-IN")}</strong> of <strong>{(all.count ?? 0).toLocaleString("en-IN")}</strong> products have photos
        </p>
        <SyncHealth />
      </div>

      <SearchInput defaultValue={q} />

      <nav className="filters" aria-label="Filter products">
        <ul className="chips chips--wrap">
          {FILTERS.map((f) => (
            <li key={f.value}>
              <Link className="chip sk-chip" href={filterHref("/sk-image", current, { f: f.value === "all" ? undefined : f.value, page: undefined })} aria-current={filter === f.value ? "true" : undefined}>
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="results-count" aria-live="polite">
        {total.toLocaleString("en-IN")} product{total === 1 ? "" : "s"}
        {pageCount > 1 && ` · page ${page} of ${pageCount}`}
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No products found">Try another name or SKU, or switch the filter to All.</EmptyState>
      ) : (
        <ul className="part-grid" aria-label="Products">
          {rows.map((r, i) => (
            <li key={`${r.source}-${r.product_key}`}>
              <article className="part-card reveal" style={{ "--i": i } as React.CSSProperties}>
                <PartImage part={{ name: r.name, sku: r.sku, imageUrl: r.primary_image_url }} />
                <div className="part-card__body">
                  <div className="part-card__meta">
                    <CodeTag code={r.sku} />
                    <span className="part-card__cat">{r.source === "busy" ? "BUSY" : "Manual"}</span>
                  </div>
                  <h2 className="part-card__name">
                    <Link href={photosHref(r.source, r.product_key)} className="part-card__link">{r.name}</Link>
                  </h2>
                  {!r.primary_image_url && <div className="part-card__foot"><Badge tone="low">No photo</Badge></div>}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && <Pagination page={page} pageCount={pageCount} href={(n) => filterHref("/sk-image", current, { page: String(n) })} />}
    </div>
  );
}
