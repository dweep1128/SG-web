import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToQuote } from "@/components/add-to-quote";
import { PartGrid } from "@/components/part-card";
import { PartImage } from "@/components/part-image";
import { StockUpdated } from "@/components/stock-updated";
import { CodeTag, ExternalButton, StockBadge } from "@/components/ui";
import { getPart, getPartPhotos, getParts } from "@/lib/catalog";
import { categoryLabel, formatPrice, GST_NOTE, isInStock, priceWithGst, STOCK_LABEL, type Part } from "@/lib/catalog-types";
import { cld, DETAIL_IMAGE_WIDTH } from "@/lib/cloudinary";
import { SITE, whatsappLink } from "@/lib/site";

export const revalidate = 30; // = LIVE_REFRESH_SECONDS (route segment config must be a literal)
// Render on first request, then cache (ISR). 1,400+ pages at build time isn't worth it.
export function generateStaticParams() {
  return [];
}

const RELATED_COUNT = 8;
type Props = { params: Promise<{ code: string }> };

async function load(params: Props["params"]): Promise<Part | null> {
  const { code } = await params;
  return /^m?\d{1,18}$/.test(code) ? getPart(code) : null; // "1291" (BUSY) or "m12" (manual)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const part = await load(params);
  // notFound() here (metadata resolves before the loading shell streams) gives a real 404 status + page.
  if (!part) notFound();
  return {
    title: `${part.name} (#${part.sku})`,
    description: `${part.name} — item code ${part.sku}${part.hsn ? `, HSN ${part.hsn}` : ""}. ${formatPrice(part.price)}${part.price != null ? ` ${GST_NOTE}` : ""}. ${STOCK_LABEL[part.stock]}. Order via WhatsApp quote.`,
    alternates: { canonical: `/parts/${part.code}` },
  };
}

// Same category, in-stock first, excluding this part.
function related(all: Part[], part: Part): Part[] {
  return all
    .filter((p) => p.cat === part.cat && p.code !== part.code)
    .sort((a, b) => Number(isInStock(b.stock)) - Number(isInStock(a.stock)))
    .slice(0, RELATED_COUNT);
}

export default async function PartPage({ params }: Props) {
  const part = await load(params);
  if (!part) notFound();
  const [all, photos] = await Promise.all([getParts(), getPartPhotos(part)]);
  const rel = related(all, part);
  const withGst = priceWithGst(part);
  const wa = whatsappLink(`Hello ${SITE.name}, I'd like to ask about:\n${part.name}\nCode ${part.sku}`);
  const quotePart = { code: part.code, sku: part.sku, name: part.name, price: part.price, gst: part.gst, unit: part.unit };

  return (
    <div className="shell page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li><Link href="/parts">Parts</Link></li>
          <li><Link href={`/parts?cat=${part.cat}`}>{categoryLabel(part.cat)}</Link></li>
          <li aria-current="page">#{part.sku}</li>
        </ol>
      </nav>

      <div className="detail">
        <div className="detail__media">
          {photos.length === 0 ? (
            <PartImage part={part} sizes="(max-width: 900px) 100vw, 560px" priority />
          ) : (
            <>
              {/* Native scroll-snap carousel: swipe on phones, no JS. */}
              <div className="gallery" tabIndex={0} aria-label={`Photos of ${part.name}`}>
                {photos.map((url, i) => (
                  <div className="part-image" key={url}>
                    <Image src={cld(url, DETAIL_IMAGE_WIDTH)} alt={`${part.name}, photo ${i + 1} of ${photos.length}`} fill sizes="(max-width: 900px) 100vw, 560px" priority={i === 0} unoptimized className="part-image__photo" />
                  </div>
                ))}
              </div>
              {photos.length > 1 && <p className="gallery__hint">{photos.length} photos · swipe for more</p>}
            </>
          )}
        </div>

        <div className="detail__info">
          <div className="detail__tags">
            <CodeTag code={part.sku} />
            <StockBadge stock={part.stock} />
          </div>
          <h1 className="detail__name">{part.name}</h1>
          {part.description && <p className="detail__desc">{part.description}</p>}

          <div className="detail__price">
            <p className="detail__amount">
              {formatPrice(part.price)}
              {part.price != null && <span className="detail__gst"> {GST_NOTE}</span>}
            </p>
            {withGst != null && <p className="detail__incl">{formatPrice(withGst)} incl. {part.gst}% GST</p>}
          </div>

          <dl className="specs">
            <div><dt>Item code</dt><dd className="mono">{part.sku}</dd></div>
            <div><dt>GST</dt><dd>{part.gst != null ? `${part.gst}%` : "—"}</dd></div>
            <div><dt>HSN</dt><dd className="mono">{part.hsn ?? "—"}</dd></div>
            {part.unit && <div><dt>Unit</dt><dd>{part.unit}</dd></div>}
            <div>
              <dt>Stock</dt>
              <dd>{STOCK_LABEL[part.stock]}</dd>
            </div>
          </dl>
          {part.source === "busy" && <StockUpdated />}

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
