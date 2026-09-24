import type { Metadata } from "next";
import { CatalogView, countByCategory } from "@/components/catalog-view";
import { ButtonLink, EmptyState } from "@/components/ui";
import { getParts } from "@/lib/catalog";
import { categoryLabel } from "@/lib/catalog-types";
import { applyFilters, parseFilters, type SearchParams } from "@/lib/listing";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { cat } = parseFilters(await searchParams);
  const title = cat ? categoryLabel(cat) : "All parts";
  return {
    title,
    description: cat ? `${categoryLabel(cat)} for e-scooters — stock from our billing system, GST invoice, PAN-India dispatch.` : "Browse every e-scooter spare part we stock, with stock from our billing system and GST billing.",
    alternates: { canonical: cat ? `/parts?cat=${cat}` : "/parts" },
  };
}

export default async function PartsPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams, "name");
  const parts = await getParts();
  const stockScoped = applyFilters(parts, { ...filters, cat: null, sort: "relevance" });

  return (
    <div className="shell page">
      <header className="page__head">
        <p className="eyebrow">Catalog</p>
        <h1>{filters.cat ? categoryLabel(filters.cat) : "All parts"}</h1>
      </header>
      <CatalogView
        path="/parts"
        filters={filters}
        defaultSort="name"
        results={applyFilters(parts, filters)}
        categoryCounts={countByCategory(stockScoped)}
        empty={
          <EmptyState title="Nothing here yet" actions={<ButtonLink href="/parts" variant="primary">Clear filters</ButtonLink>}>
            No parts match these filters. Try switching off &ldquo;In stock only&rdquo; or picking another category.
          </EmptyState>
        }
      />
    </div>
  );
}
