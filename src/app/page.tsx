import Link from "next/link";
import { catalogGroups, getCatalogItems } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { CatalogueSearch } from "@/components/catalogue-search";

const FEATURED_COUNT = 8;

export default async function Home() {
  const items = await getCatalogItems();
  const groups = catalogGroups(items).slice(0, 8);
  const featured = [...items]
    .filter((item) => item.stock_status === "in_stock")
    .sort((a, b) => (b.stock_qty ?? 0) - (a.stock_qty ?? 0))
    .slice(0, FEATURED_COUNT);

  return (
    <>
      <section className="hero">
        <div className="shell hero-copy">
          <span className="eyebrow">EV SCOOTY PARTS SUPPLIER</span>
          <h1>
            E-scooter parts.
            <br />
            <em>Without the hunt.</em>
          </h1>
          <p>Search {items.length.toLocaleString("en-IN")} synced parts by name — quality spares for dealers and workshops across India.</p>
          <CatalogueSearch />
          <div className="hero-actions" style={{ marginTop: 24 }}>
            <Link className="btn btn-primary" href="/products">Browse all parts →</Link>
            <Link className="btn btn-secondary" href="/quote">View my quote →</Link>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-badge">Live from BUSY</div>
          <div className="hero-stat">
            <b>{items.length.toLocaleString("en-IN")}</b>
            <span>parts in catalog</span>
          </div>
        </div>
      </section>

      <section className="trust-band">
        <div className="shell trust">
          <div className="trust-item"><span className="trust-icon">◎</span><span><b>Pan-India dispatch</b><small>Reliable delivery across India.</small></span></div>
          <div className="trust-item"><span className="trust-icon">✓</span><span><b>Genuine parts</b><small>Sourced and checked before dispatch.</small></span></div>
          <div className="trust-item"><span className="trust-icon">⌁</span><span><b>Live stock &amp; pricing</b><small>Synced straight from our inventory.</small></span></div>
          <div className="trust-item"><span className="trust-icon">◔</span><span><b>Quick WhatsApp quotes</b><small>Talk straight to our parts team.</small></span></div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">SHOP BY CATEGORY</span>
              <h2 className="section-title">Find the right part,<br />without the hunt.</h2>
            </div>
            <Link href="/products">View all parts →</Link>
          </div>
          <div className="category-grid">
            {groups.map((group, index) => (
              <Link className="category-card" key={group.name} href={`/products?category=${encodeURIComponent(group.name)}`}>
                <span>0{index + 1}</span>
                <div>
                  <h3>{group.name}</h3>
                  <b>{group.count} parts →</b>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section products-bg">
        <div className="shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">READY TO SHIP</span>
              <h2 className="section-title">Well-stocked,<br />ready for your order.</h2>
            </div>
            <Link href="/products">Browse full catalogue →</Link>
          </div>
          {featured.length ? (
            <div className="product-grid">
              {featured.map((item, index) => (
                <ProductCard key={item.busy_code} item={item} index={index} />
              ))}
            </div>
          ) : (
            <div className="empty">No parts synced yet. Run the BUSY sync to populate the catalogue.</div>
          )}
        </div>
      </section>
    </>
  );
}
