import { ProductCard } from "@/components/product-card";
import { getCategories, getProducts } from "@/lib/catalogue";
import Link from "next/link";
import { CatalogueSearch } from "@/components/catalogue-search";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; model?: string; category?: string }> }) {
  const params = await searchParams; const [products, categories] = await Promise.all([getProducts({ query: params.q, model: params.model, category: params.category }), getCategories()]); const title = params.q ? `Results for “${params.q}”` : "All e-scooter parts";
  return <><section className="catalogue-hero"><div className="shell"><span className="eyebrow">SK TRADERS PARTS CATALOGUE</span><h1>{title}</h1><p>Find the part faster: search its name, SKU or part number, then add the items you need to one wholesale quote.</p><CatalogueSearch initialQuery={params.q || ""}/><div className="catalogue-proof"><b>✓ Pan-India dispatch</b><b>✓ Quality checked</b><b>✓ MOQ shown clearly</b><b>✓ WhatsApp quote support</b></div></div></section><section className="shell section" style={{ paddingTop: 42 }}><div className="category-pills">{categories.map(category => <Link className="btn btn-ghost" key={category.id} href={`/categories/${category.slug}`}>{category.name}</Link>)}</div>{products.length ? <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product}/>)}</div> : <div className="empty">No matching products yet. Try another search or contact SK Traders for help identifying the part.</div>}</section></>;
}
