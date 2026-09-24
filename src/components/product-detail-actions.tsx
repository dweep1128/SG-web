"use client";
import { useState } from "react";
import { CatalogItem, stockLabel } from "@/lib/catalog-types";
import { useQuoteCart } from "./site-chrome";

export function ProductDetailActions({ item }: { item: CatalogItem }) {
  const { add } = useQuoteCart();
  const [quantity, setQuantity] = useState(1);
  const disabled = stockLabel(item) === "Check availability" && item.stock_status === null;
  return (
    <div className="detail-actions">
      <div className="quantity">
        <button onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Decrease quantity">−</button>
        <output>{quantity}</output>
        <button onClick={() => setQuantity((current) => current + 1)} aria-label="Increase quantity">+</button>
      </div>
      <button
        className="btn btn-primary"
        disabled={disabled}
        onClick={() => add({ busy_code: item.busy_code, busy_name: item.busy_name, price: item.price }, quantity)}
      >
        {disabled ? "Ask for availability" : "Add to Quote +"}
      </button>
    </div>
  );
}
