import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { CatalogueSearch } from "@/components/catalogue-search";
import { catalogGroups, filterCatalogItems, getCatalogItems } from "@/lib/catalog";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const params = await searchParams;
  const allItems = await getCatalogItems();
  const groups = catalogGroups(allItems);
  const items = filterCatalogItems(allItems, { query: params.q, group: params.category });
  const title = params.q ? `Results for “${params.q}”` : params.category || "All e-scooter parts";

  return (
    <>
      <section className="catalogue-hero">
        <div className="shell">
          <span className="eyebrow">SK TRADERS PARTS CATALOGUE</span>
          <h1>{title}</h1>
          <p>Find the part faster: search its name, then add the items you need to one wholesale quote.</p>
          <CatalogueSearch initialQuery={params.q || ""} />
        </div>
      </section>
      <section className="shell section" style={{ paddingTop: 38 }}>
        <div className="category-pills">
          <Link className={`btn btn-ghost ${!params.category ? "active" : ""}`} href="/products">All ({allItems.length})</Link>
          {groups.map((group) => (
            <Link
              className={`btn btn-ghost ${params.category === group.name ? "active" : ""}`}
              key={group.name}
              href={`/products?category=${encodeURIComponent(group.name)}`}
            >
              {group.name} ({group.count})
            </Link>
          ))}
        </div>
        {items.length ? (
          <div className="product-grid">
            {items.map((item, index) => (
              <ProductCard key={item.busy_code} item={item} index={index} />
            ))}
          </div>
        ) : (
          <div className="empty">No matching parts. Try another search or contact SK Traders for help identifying the part.</div>
        )}
      </section>
    </>
  );
}
