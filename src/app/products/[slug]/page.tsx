import { notFound } from "next/navigation";
import { formatPrice, getCatalogItem, stockLabel } from "@/lib/catalog";
import { ProductDetailActions } from "@/components/product-detail-actions";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const busyCode = Number(slug);
  if (!Number.isInteger(busyCode)) notFound();
  const item = await getCatalogItem(busyCode);
  if (!item) notFound();

  return (
    <>
      <div className="shell breadcrumbs">Home / Parts / {item.busy_group_name || "Part"} / {item.busy_name}</div>
      <section className="shell detail">
        <div className="detail-image">
          <span className="product-placeholder">
            <span className="swatch">SK</span>
            <small>Photo coming soon</small>
          </span>
        </div>
        <div>
          <span className="eyebrow">{item.busy_group_name || "EV Spare Part"}</span>
          <h1>{item.busy_name}</h1>
          <p className="hsn">HSN {item.hsn_code || "—"}</p>
          <p className="detail-description">Genuine BUSY-synced spare part. Contact SK Traders for fitment confirmation or dealer pricing on bulk orders.</p>
          <div className="details-list">
            <div><small>Price</small><b>{formatPrice(item.price)}</b></div>
            <div><small>GST</small><b>{item.gst_pct != null ? `${item.gst_pct}%` : "—"}</b></div>
            <div><small>Stock</small><b>{stockLabel(item)}</b></div>
          </div>
          <ProductDetailActions item={item} />
        </div>
      </section>
    </>
  );
}
