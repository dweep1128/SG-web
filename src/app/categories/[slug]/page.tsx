import { notFound } from "next/navigation";
import { getCategories, getProducts } from "@/lib/catalogue";
import { ProductCard } from "@/components/product-card";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const categories = await getCategories(); const category = categories.find(item => item.slug === slug); if (!category) notFound(); const products = await getProducts({ category: slug }); return <><section className="shell page-header"><span className="eyebrow">CATEGORY</span><h1>{category.name}</h1><p>{category.description}</p></section><section className="shell section" style={{ paddingTop: 0 }}>{products.length ? <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product}/>)}</div> : <div className="empty">Products in this category will be added shortly.</div>}</section></>; }
