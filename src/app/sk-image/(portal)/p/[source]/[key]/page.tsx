import { notFound } from "next/navigation";
import { DisplayNameInput } from "@/components/sk-image/display-name-input";
import { PhotoManager } from "@/components/sk-image/photo-manager";
import { BusyItemForm, ToggleActive, type BusyEditable } from "@/components/sk-image/product-form";
import { ButtonLink } from "@/components/ui";
import { formatPrice, getDisplayName, partHref, updatedAgo } from "@/lib/catalog-types";
import { isProductRef, type ManualProduct, type Media } from "@/lib/sk-image";
import { serverSupabase } from "@/lib/supabase-server";

type Props = { params: Promise<{ source: string; key: string }> };
type BusyRow = BusyEditable & { busy_name: string; sale_price: number | null; stock_qty: number | null; last_synced_at: string | null; price_visible: boolean; stock_visible: boolean };

// One product: BUSY items get the presentation form (price/stock read-only from BUSY), portal products link to their
// full edit form. Photos for both. Hidden products open here too, so they can be fixed up before unhiding.
export default async function ProductPage({ params }: Props) {
  const { source, key } = await params;
  if (!isProductRef(source, key)) notFound();
  const supabase = await serverSupabase();

  const [product, media] = await Promise.all([
    source === "busy"
      ? supabase.from("busy_items").select("busy_code, busy_name, display_name, description, hidden, sale_price, stock_qty, last_synced_at, price_visible, stock_visible").eq("busy_code", key).maybeSingle<BusyRow>()
      : supabase.from("products_manual").select("*").eq("id", key).maybeSingle<ManualProduct>(),
    supabase.from("product_media").select("*").eq("source", source).eq("product_key", key).order("sort_order"),
  ]);
  if (product.error) throw new Error(product.error.message);
  if (media.error) throw new Error(media.error.message);
  if (!product.data) notFound();

  const busy = source === "busy" ? (product.data as BusyRow) : null;
  const manual = source === "manual" ? (product.data as ManualProduct) : null;
  const name = getDisplayName(busy ?? manual!);
  const sourceName = busy ? busy.busy_name : manual!.name;

  return (
    <div className="shell page">
      <DisplayNameInput id="dn-photo" source={source} productKey={key} value={(busy ?? manual!).display_name} sourceName={sourceName} />
      <PhotoManager
        source={source}
        productKey={key}
        name={name}
        sku={busy ? key : manual!.sku}
        siteHref={partHref(source === "manual" ? `m${key}` : key)}
        initialMedia={media.data as Media[]}
      />

      <section className="card sk-form-card sk-details" aria-labelledby="details-heading">
        <h2 id="details-heading" className="sk-subtitle">Details</h2>
        {busy ? (
          <>
            <dl className="specs">
              <div><dt>BUSY name</dt><dd>{busy.busy_name}</dd></div>
              <div><dt>Price</dt><dd>{formatPrice(busy.sale_price)}{!busy.price_visible && " (hidden on site until verified)"}</dd></div>
              <div><dt>Stock</dt><dd>{busy.stock_qty ?? "—"}{!busy.stock_visible && " (hidden on site until verified)"}</dd></div>
              <div><dt>Synced</dt><dd>{busy.last_synced_at ? updatedAgo(busy.last_synced_at, Date.now()) : "—"}</dd></div>
            </dl>
            <p className="sk-note">Price and stock come from BUSY. Change them in BUSY; the website follows within a minute.</p>
            <BusyItemForm item={busy} />
          </>
        ) : (
          <div className="sk-row__actions">
            <ButtonLink href={`/sk-image/add?edit=${key}`} variant="primary">Edit details</ButtonLink>
            <ToggleActive id={manual!.id} active={manual!.is_active} />
          </div>
        )}
      </section>
    </div>
  );
}
