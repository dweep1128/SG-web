import Link from "next/link";
import { categoryLabel, formatPrice, GST_NOTE, partHref, type Part } from "@/lib/catalog-types";
import { QuickAdd } from "./add-to-quote";
import { PartImage } from "./part-image";
import { CodeTag, StockBadge } from "./ui";

export function PartCard({ part, index = 0, highlight }: { part: Part; index?: number; highlight?: React.ReactNode }) {
  return (
    <article className="part-card reveal" style={{ "--i": index } as React.CSSProperties}>
      <PartImage part={part} />
      <div className="part-card__body">
        <div className="part-card__meta">
          <CodeTag code={part.code} />
          <span className="part-card__cat">{categoryLabel(part.cat)}</span>
        </div>
        <h3 className="part-card__name">
          {/* Stretched link: whole card is clickable, QuickAdd sits above it. */}
          <Link href={partHref(part.code)} className="part-card__link">{highlight ?? part.name}</Link>
        </h3>
        <div className="part-card__foot">
          <p className="part-card__price">
            {formatPrice(part.price)}
            {part.price != null && <span className="part-card__gst"> {GST_NOTE}</span>}
          </p>
          <StockBadge stock={part.stock} />
        </div>
      </div>
      <QuickAdd part={part} />
    </article>
  );
}

export function PartGrid({ parts, label }: { parts: Part[]; label: string }) {
  return (
    <ul className="part-grid" aria-label={label}>
      {parts.map((p, i) => (
        <li key={p.code}><PartCard part={p} index={i} /></li>
      ))}
    </ul>
  );
}

export function PartGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="part-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="part-card part-card--skeleton">
          <div className="skeleton" style={{ aspectRatio: "4 / 3" }} />
          <div className="part-card__body">
            <div className="skeleton" style={{ width: "40%", height: 14 }} />
            <div className="skeleton" style={{ width: "90%", height: 18 }} />
            <div className="skeleton" style={{ width: "60%", height: 18 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
