import Link from "next/link";
import { Pagination } from "@/components/catalog-view";
import { PartImage } from "@/components/part-image";
import { SearchInput } from "@/components/sk-image/search-input";
import { DisplayNameInput } from "@/components/sk-image/display-name-input";
import { SyncHealth } from "@/components/sk-image/sync-health";
import { Badge, CodeTag, EmptyState } from "@/components/ui";
import { filterHref, type SearchParams } from "@/lib/listing";
import { photosHref, SOURCE_LABEL, type Source } from "@/lib/sk-image";
import { PAGE_SIZE } from "@/lib/site";
import { serverSupabase } from "@/lib/supabase-server";

// Three independent filters, each its own URL param. First option of each = no filter.
const FILTERS = {
  src: [{ value: "all", label: "All sources" }, { value: "busy", label: "BUSY" }, { value: "manual", label: "Portal" }],
  vis: [{ value: "all", label: "Visible + hidden" }, { value: "shown", label: "Visible" }, { value: "hidden", label: "Hidden" }],
  photo: [{ value: "all", label: "Any photo" }, { value: "none", label: "Missing photo" }, { value: "has", label: "Has photo" }],
  dn: [{ value: "all", label: "Any display name" }, { value: "none", label: "Missing display name" }, { value: "has", label: "Has display name" }],
} as const;
type Key = keyof typeof FILTERS;
type Row = { source: Source; product_key: string; name: string; source_name: string; display_name: string | null; sku: string; hidden: boolean; primary_image_url: string | null };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pick = (sp: SearchParams, key: Key) => FILTERS[key].find((f) => f.value === first(sp[key]))?.value ?? "all";

// PostgREST or() syntax breaks on , ( ) and LIKE treats % _ as wildcards: drop them. Words are joined with %, so
// "charger 60v" still finds BUSY's "CHARGER  60V" (double space).
function likePattern(q: string): string | null {
  const words = q.replace(/[%_*,()\\"':.]/g, " ").split(/\s+/).filter(Boolean);
  return words.length ? `%${words.join("%")}%` : null;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? "";
  const f = { src: pick(sp, "src"), vis: pick(sp, "vis"), photo: pick(sp, "photo"), dn: pick(sp, "dn") };
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await serverSupabase();
  let query = supabase.from("admin_catalog").select("source, product_key, name, source_name, display_name, sku, hidden, primary_image_url", { count: "exact" });
  const pattern = likePattern(q);
  if (pattern) query = query.or(`name.ilike.${pattern},source_name.ilike.${pattern},sku.ilike.${pattern}`);
  if (f.src !== "all") query = query.eq("source", f.src);
  if (f.vis !== "all") query = query.eq("hidden", f.vis === "hidden");
  if (f.photo === "none") query = query.is("primary_image_url", null);
  if (f.photo === "has") query = query.not("primary_image_url", "is", null);
  if (f.dn === "none") query = query.is("display_name", null);
  if (f.dn === "has") query = query.not("display_name", "is", null);

  const [list, all, withPhoto, noName] = await Promise.all([
    query.order("name").order("product_key").range(from, from + PAGE_SIZE - 1),
    supabase.from("admin_catalog").select("product_key", { count: "exact", head: true }),
    supabase.from("admin_catalog").select("product_key", { count: "exact", head: true }).not("primary_image_url", "is", null),
    supabase.from("admin_catalog").select("product_key", { count: "exact", head: true }).is("display_name", null),
  ]);
  // PGRST103 = page past the end (e.g. a stale ?page=): show the empty state, not an error.
  if (list.error && list.error.code !== "PGRST103") throw new Error(list.error.message);
  const rows = (list.data ?? []) as Row[];
  const total = list.count ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const current = { q: q || undefined, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "all" ? undefined : v])) };

  return (
    <div className="shell page">
      <div className="page__head">
        <h1 className="sk-title">Products</h1>
        <p className="sk-stats">
          <strong>{(withPhoto.count ?? 0).toLocaleString("en-IN")}</strong> of <strong>{(all.count ?? 0).toLocaleString("en-IN")}</strong> products have photos · <strong>{(noName.count ?? 0).toLocaleString("en-IN")}</strong> missing a display name
        </p>
        <SyncHealth />
      </div>

      <SearchInput defaultValue={q} />

      <nav className="filters" aria-label="Filter products">
        {(Object.keys(FILTERS) as Key[]).map((key) => (
          <ul key={key} className="chips chips--wrap">
            {FILTERS[key].map((o) => (
              <li key={o.value}>
                <Link className="chip sk-chip" href={filterHref("/sk-image", current, { [key]: o.value === "all" ? undefined : o.value, page: undefined })} aria-current={f[key] === o.value ? "true" : undefined}>
                  {o.label}
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </nav>

      <p className="results-count" aria-live="polite">
        {total.toLocaleString("en-IN")} product{total === 1 ? "" : "s"}
        {pageCount > 1 && ` · page ${page} of ${pageCount}`}
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No products found">Try another name or SKU, or clear the filters.</EmptyState>
      ) : (
        <ul className="part-grid" aria-label="Products">
          {rows.map((r, i) => (
            <li key={`${r.source}-${r.product_key}`}>
              <article className="part-card reveal" style={{ "--i": i } as React.CSSProperties}>
                <PartImage part={{ name: r.name, sku: r.sku, imageUrl: r.primary_image_url }} />
                <div className="part-card__body">
                  <div className="part-card__meta">
                    <CodeTag code={r.sku} />
                    <span className="part-card__cat">{SOURCE_LABEL[r.source]}</span>
                  </div>
                  <h2 className="part-card__name">
                    <Link href={photosHref(r.source, r.product_key)} className="part-card__link">{r.name}</Link>
                  </h2>
                  <DisplayNameInput id={`dn-${r.source}-${r.product_key}`} source={r.source} productKey={r.product_key} value={r.display_name} sourceName={r.source_name} />
                  {(r.hidden || !r.primary_image_url) && (
                    <div className="part-card__foot">
                      {r.hidden && <Badge tone="out">Hidden</Badge>}
                      {!r.primary_image_url && <Badge tone="low">No photo</Badge>}
                    </div>
                  )}
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
