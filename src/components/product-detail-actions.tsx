"use client";
import { useState } from "react";
import { Product } from "@/lib/types";
import { useQuoteCart } from "./site-chrome";

export function ProductDetailActions({ product }: { product: Product }) {
  const { add } = useQuoteCart(); const [quantity, setQuantity] = useState(product.moq);
  return <div className="detail-actions"><div className="quantity"><button onClick={() => setQuantity(current => Math.max(product.moq, current - 1))}>−</button><output>{quantity}</output><button onClick={() => setQuantity(current => current + 1)}>+</button></div><button className="btn btn-primary" disabled={product.stock === "out_of_stock"} onClick={() => add({ product_id: product.id, name: product.name, sku: product.sku }, quantity)}>{product.stock === "out_of_stock" ? "Ask for availability" : "Add to quote list +"}</button></div>;
}
