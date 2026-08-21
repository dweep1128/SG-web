"use client";
import Link from "next/link";
import { Product } from "@/lib/types";
import { useQuoteCart } from "./site-chrome";

function stockLabel(stock: Product["stock"]) { return stock === "in_stock" ? "In stock" : stock === "limited" ? "Limited stock" : "Out of stock"; }
export function ProductCard({ product }: { product: Product }) {
  const { add } = useQuoteCart(); const image = product.product_images?.[0]; const fits = product.product_compatibility?.map(entry => entry.scooter_models ? `${entry.scooter_models.brand} ${entry.scooter_models.model}` : null).filter(Boolean).slice(0, 2).join(", ");
  const price = product.price_from ? `From ₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(product.price_from)}` : "Request dealer price";
  return <article className="product-card"><Link className="product-img" href={`/products/${product.slug}`}><span className={`stock ${product.stock === "limited" ? "limited" : product.stock === "out_of_stock" ? "out" : ""}`}>{stockLabel(product.stock)}</span>{image ? <img src={image.image_url} alt={image.alt_text || product.name}/> : <span className="product-placeholder"><b>SK</b><small>PRODUCT IMAGE<br/>COMING SOON</small></span>}</Link><p className="sku">{product.sku}</p><Link href={`/products/${product.slug}`}><h3>{product.name}</h3></Link><div className="product-commercial"><b>{price}</b><span>MOQ: {product.moq}</span></div><p className="meta">{product.voltage || "Specification on request"}</p>{fits && <p className="fits">Fits: {fits}</p>}<button className="add-btn" disabled={product.stock === "out_of_stock"} onClick={() => add({ product_id: product.id, name: product.name, sku: product.sku })}>{product.stock === "out_of_stock" ? "Enquire for availability" : "Add to bulk quote +"}</button></article>;
}
