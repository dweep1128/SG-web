import type { Metadata } from "next";
import Link from "next/link";
import { CatalogView, countByCategory } from "@/components/catalog-view";
import { PartGrid } from "@/components/part-card";
import { SearchBox } from "@/components/search-box";
import { ButtonLink, EmptyState, ExternalButton } from "@/components/ui";
import { getParts } from "@/lib/catalog";
import { CATEGORIES } from "@/lib/categories";
import { applyFilters, parseFilters, type SearchParams } from "@/lib/listing";
import { buildIndex, search, suggest } from "@/lib/search";
import { SITE, whatsappLink } from "@/lib/site";

const SUGGESTION_COUNT = 6;
type Props = { searchParams: Promise<SearchParams> };

const readQuery = (sp: SearchParams) => String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim().slice(0, 100);

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = readQuery(await searchParams);
  return { title: q ? `Search: ${q}` : "Search parts", robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = readQuery(sp);
  const filters = parseFilters(sp, "relevance");

  if (!q) {
    return (
      <div className="shell page">
        <header className="page__head">
          <p className="eyebrow">Search</p>
          <h1>Find a part</h1>
        </header>
        <div className="search-page__box"><SearchBox id="page-search" size="lg" /></div>
        <p className="search-page__hint">Try a part name (&ldquo;charger 60v&rdquo;), an item code, or an HSN code. Or browse:</p>
        <ul className="chips chips--wrap">
          {CATEGORIES.map((c) => <li key={c.slug}><Link className="chip" href={`/parts?cat=${c.slug}`}>{c.label}</Link></li>)}
        </ul>
      </div>
    );
  }

  const parts = await getParts();
  const index = buildIndex(parts);
  const matches = search(index, q);
  const stockScoped = applyFilters(matches, { ...filters, cat: null, sort: "relevance" });
  const results = applyFilters(matches, filters);
  const wa = whatsappLink(`Hello ${SITE.name}, I'm looking for: ${q}\nDo you have it?`);

  const noMatchesAtAll = matches.length === 0;
  const nearest = noMatchesAtAll ? suggest(index, q, SUGGESTION_COUNT) : [];

  return (
    <div className="shell page">
      <header className="page__head">
        <p className="eyebrow">Search results</p>
        <h1 className="search-page__title">&ldquo;{q}&rdquo;</h1>
      </header>
      <div className="search-page__box"><SearchBox id="page-search" size="lg" defaultValue={q} /></div>

      {noMatchesAtAll ? (
        <>
          <EmptyState
            title="No exact match"
            actions={
              <>
                <ExternalButton href={wa} variant="whatsapp">Ask us on WhatsApp</ExternalButton>
                <ButtonLink href="/parts">Browse all parts</ButtonLink>
              </>
            }
          >
            We couldn&apos;t find &ldquo;{q}&rdquo; in the catalog. Check the spelling, try fewer words, or ask us. Many parts go by more than one name.
          </EmptyState>
          {nearest.length > 0 && (
            <section className="section" aria-labelledby="nearest-heading">
              <div className="section__head"><h2 id="nearest-heading">Closest matches</h2></div>
              <PartGrid parts={nearest} label="Closest matches" />
            </section>
          )}
        </>
      ) : (
        <CatalogView
          path="/search"
          filters={filters}
          defaultSort="relevance"
          results={results}
          categoryCounts={countByCategory(stockScoped)}
          extraParams={{ q }}
          highlightQuery={q}
          empty={
            <EmptyState title="No parts with these filters" actions={<ButtonLink href={`/search?q=${encodeURIComponent(q)}`} variant="primary">Clear filters</ButtonLink>}>
              {matches.length} part{matches.length === 1 ? "" : "s"} match &ldquo;{q}&rdquo;, but none with the current filters.
            </EmptyState>
          }
        />
      )}
    </div>
  );
}
