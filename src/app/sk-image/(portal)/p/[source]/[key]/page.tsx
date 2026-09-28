import { notFound } from "next/navigation";
import { PhotoManager } from "@/components/sk-image/photo-manager";
import { partHref } from "@/lib/catalog-types";
import { isProductRef, type Media } from "@/lib/sk-image";
import { serverSupabase } from "@/lib/supabase-server";

type Props = { params: Promise<{ source: string; key: string }> };

export default async function ProductPhotosPage({ params }: Props) {
  const { source, key } = await params;
  if (!isProductRef(source, key)) notFound();
  const supabase = await serverSupabase();

  // Manual products are read from their table so a disabled one (hidden from catalog_view) can still get photos.
  const product =
    source === "busy"
      ? await supabase.from("catalog_view").select("name, sku").eq("source", "busy").eq("product_key", key).maybeSingle<{ name: string; sku: string }>()
      : await supabase.from("products_manual").select("name, sku").eq("id", key).maybeSingle<{ name: string; sku: string }>();
  if (product.error) throw new Error(product.error.message);
  if (!product.data) notFound();

  const media = await supabase.from("product_media").select("*").eq("source", source).eq("product_key", key).order("sort_order");
  if (media.error) throw new Error(media.error.message);

  return (
    <div className="shell page">
      <PhotoManager
        source={source}
        productKey={key}
        name={product.data.name.replace(/\s+/g, " ").trim()}
        sku={product.data.sku}
        siteHref={partHref(source === "manual" ? `m${key}` : key)}
        initialMedia={media.data as Media[]}
      />
    </div>
  );
}
