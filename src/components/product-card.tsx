"use client";
import Link from "next/link";
import { CatalogItem, formatPrice, stockLabel } from "@/lib/catalog-types";
import { useQuoteCart } from "./site-chrome";

const BADGE_CLASS: Record<ReturnType<typeof stockLabel>, string> = { "In stock": "in", "Low stock": "low", "Check availability": "hold" };

export function ProductCard({ item, index = 0 }: { item: CatalogItem; index?: number }) {
  const { add } = useQuoteCart();
  const label = stockLabel(item);
  const disabled = label === "Check availability" && item.stock_status === null;
  return (
    <article className="product-card" style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}>
      <Link className="product-img" href={`/products/${item.busy_code}`}>
        <span className={`stock-badge ${BADGE_CLASS[label]}`}>{label}</span>
        <span className="product-placeholder">
          <span className="swatch">SK</span>
          <small>Photo coming soon</small>
        </span>
      </Link>
      <p className="hsn">HSN {item.hsn_code || "—"}</p>
      <Link href={`/products/${item.busy_code}`}>
        <h3>{item.busy_name}</h3>
      </Link>
      <div className="product-commercial">
        <b>{formatPrice(item.price)}</b>
        <span>{item.unit_name || "unit"}</span>
      </div>
      <button
        className="add-btn"
        disabled={disabled}
        onClick={() => add({ busy_code: item.busy_code, busy_name: item.busy_name, price: item.price })}
      >
        {disabled ? "Ask for availability" : "Add to Quote +"}
      </button>
    </article>
  );
}
