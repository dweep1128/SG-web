import Link from "next/link";
import type { ReactNode } from "react";
import { CATEGORIES } from "@/lib/categories";
import type { Part } from "@/lib/catalog-types";
import { filterHref, filtersToParams, paginate, type Filters, type SortValue } from "@/lib/listing";
import { Highlight } from "./highlight";
import { PartCard } from "./part-card";
import { SortSelect } from "./sort-select";

type Props = {
  path: "/parts" | "/search";
  filters: Filters;
  defaultSort: SortValue;
  results: Part[]; // already filtered + sorted
  categoryCounts: Map<string, number>; // counts before the category filter, so chips show what you'd get
  extraParams?: Record<string, string | undefined>; // e.g. { q }
  highlightQuery?: string;
  empty: ReactNode;
};

export function CatalogView({ path, filters, defaultSort, results, categoryCounts, extraParams = {}, highlightQuery, empty }: Props) {
  const params = filtersToParams(filters, defaultSort, extraParams);
  const { items, page, pageCount, total } = paginate(results, filters.page);
  const href = (patch: Record<string, string | undefined>) => filterHref(path, params, { page: undefined, ...patch });
  const allCount = [...categoryCounts.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <nav className="filters" aria-label="Filter parts">
        <ul className="chips">
          <li><Link className="chip" href={href({ cat: undefined })} aria-current={!filters.cat ? "true" : undefined}>All <span>{allCount}</span></Link></li>
          {CATEGORIES.filter((c) => categoryCounts.get(c.slug)).map((c) => (
            <li key={c.slug}>
              <Link className="chip" href={href({ cat: c.slug })} aria-current={filters.cat === c.slug ? "true" : undefined}>
                {c.label} <span>{categoryCounts.get(c.slug)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="filters__row">
          <Link className="toggle" href={href({ stock: filters.inStock ? undefined : "in" })} role="switch" aria-checked={filters.inStock}>
            <span className="toggle__track" aria-hidden="true" />
            In stock only
          </Link>
          <form action={path} className="filters__sort">
            {Object.entries({ ...params, sort: undefined, page: undefined }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
            <SortSelect value={filters.sort} withRelevance={path === "/search"} />
          </form>
        </div>
      </nav>

      <p className="results-count" aria-live="polite">
        {total === 0 ? "No parts match" : `${total.toLocaleString("en-IN")} part${total === 1 ? "" : "s"}`}
        {pageCount > 1 && ` · page ${page} of ${pageCount}`}
      </p>

      {total === 0 ? (
        empty
      ) : (
        <ul className="part-grid" aria-label="Parts">
          {items.map((p, i) => (
            <li key={p.code}><PartCard part={p} index={i} highlight={highlightQuery ? <Highlight text={p.name} query={highlightQuery} /> : undefined} /></li>
          ))}
        </ul>
      )}

      {pageCount > 1 && <Pagination page={page} pageCount={pageCount} href={(n) => filterHref(path, params, { page: String(n) })} />}
    </>
  );
}

const WINDOW = 1; // pages shown either side of the current one

function Pagination({ page, pageCount, href }: { page: number; pageCount: number; href: (n: number) => string }) {
  const pages = [...new Set([1, ...Array.from({ length: WINDOW * 2 + 1 }, (_, i) => page - WINDOW + i), pageCount])].filter((n) => n >= 1 && n <= pageCount);
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 ? <Link className="btn btn--sm" href={href(page - 1)} rel="prev">← Prev</Link> : <span className="btn btn--sm" aria-disabled="true">← Prev</span>}
      <ol>
        {pages.map((n, i) => (
          <li key={n}>
            {i > 0 && n - pages[i - 1] > 1 && <span className="pagination__gap" aria-hidden="true">…</span>}
            <Link href={href(n)} className="pagination__page" aria-current={n === page ? "page" : undefined}>{n}</Link>
          </li>
        ))}
      </ol>
      {page < pageCount ? <Link className="btn btn--sm" href={href(page + 1)} rel="next">Next →</Link> : <span className="btn btn--sm" aria-disabled="true">Next →</span>}
    </nav>
  );
}

export function countByCategory(parts: Part[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of parts) m.set(p.cat, (m.get(p.cat) ?? 0) + 1);
  return m;
}
