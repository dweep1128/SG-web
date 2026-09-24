import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToQuote } from "@/components/add-to-quote";
import { PartGrid } from "@/components/part-card";
import { PartImage } from "@/components/part-image";
import { CodeTag, ExternalButton, StockBadge } from "@/components/ui";
import { getPart, getParts } from "@/lib/catalog";
import { categoryLabel, formatPrice, GST_NOTE, priceWithGst, STOCK_LABEL, updatedAgo, type Part } from "@/lib/catalog-types";
import { SITE, whatsappLink } from "@/lib/site";

export const revalidate = 300;
// Render on first request, then cache (ISR). 1,400+ pages at build time isn't worth it.
export function generateStaticParams() {
  return [];
}

const RELATED_COUNT = 8;
type Props = { params: Promise<{ code: string }> };

async function load(params: Props["params"]): Promise<Part | null> {
  const { code } = await params;
  return /^\d{1,9}$/.test(code) ? getPart(Number(code)) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const part = await load(params);
  // notFound() here (metadata resolves before the loading shell streams) gives a real 404 status + page.
  if (!part) notFound();
  return {
    title: `${part.name} (#${part.code})`,
    description: `${part.name} — item code ${part.code}${part.hsn ? `, HSN ${part.hsn}` : ""}. ${formatPrice(part.price)}${part.price != null ? ` ${GST_NOTE}` : ""}. ${STOCK_LABEL[part.stock]}. Order via WhatsApp quote.`,
    alternates: { canonical: `/parts/${part.code}` },
  };
}

// Same category, in-stock first, excluding this part.
function related(all: Part[], part: Part): Part[] {
  return all
    .filter((p) => p.cat === part.cat && p.code !== part.code)
    .sort((a, b) => Number(a.stock === "ask") - Number(b.stock === "ask"))
    .slice(0, RELATED_COUNT);
}

export default async function PartPage({ params }: Props) {
  const part = await load(params);
  if (!part) notFound();
  const rel = related(await getParts(), part);
  const withGst = priceWithGst(part);
  const wa = whatsappLink(`Hello ${SITE.name}, I'd like to ask about:\n${part.name}\nCode ${part.code}`);
  const quotePart = { code: part.code, name: part.name, price: part.price, gst: part.gst, unit: part.unit };

  return (
    <div className="shell page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li><Link href="/parts">Parts</Link></li>
          <li><Link href={`/parts?cat=${part.cat}`}>{categoryLabel(part.cat)}</Link></li>
          <li aria-current="page">#{part.code}</li>
        </ol>
      </nav>

      <div className="detail">
        <div className="detail__media">
          <PartImage part={part} sizes="(max-width: 900px) 100vw, 560px" priority />
        </div>

        <div className="detail__info">
          <div className="detail__tags">
            <CodeTag code={part.code} />
            <StockBadge stock={part.stock} />
          </div>
          <h1 className="detail__name">{part.name}</h1>

          <div className="detail__price">
            <p className="detail__amount">
              {formatPrice(part.price)}
              {part.price != null && <span className="detail__gst"> {GST_NOTE}</span>}
            </p>
            {withGst != null && <p className="detail__incl">{formatPrice(withGst)} incl. {part.gst}% GST</p>}
          </div>

          <dl className="specs">
            <div><dt>Item code</dt><dd className="mono">{part.code}</dd></div>
            <div><dt>GST</dt><dd>{part.gst != null ? `${part.gst}%` : "—"}</dd></div>
            <div><dt>HSN</dt><dd className="mono">{part.hsn ?? "—"}</dd></div>
            {part.unit && <div><dt>Unit</dt><dd>{part.unit}</dd></div>}
            <div>
              <dt>Stock</dt>
              <dd>
                {STOCK_LABEL[part.stock]}
                {part.syncedAt && <span className="specs__note"> · {updatedAgo(part.syncedAt, Date.now())}</span>}
              </dd>
            </div>
          </dl>

          <AddToQuote part={quotePart} />
          <ExternalButton href={wa} variant="whatsapp" block>Ask about this part on WhatsApp</ExternalButton>
        </div>
      </div>

      {rel.length > 0 && (
        <section className="section lazy-section" aria-labelledby="related-heading">
          <div className="section__head">
            <h2 id="related-heading">More {categoryLabel(part.cat).toLowerCase()}</h2>
            <Link href={`/parts?cat=${part.cat}`} className="section__more">See all →</Link>
          </div>
          <PartGrid parts={rel} label={`Related ${categoryLabel(part.cat)}`} />
        </section>
      )}
    </div>
  );
}
