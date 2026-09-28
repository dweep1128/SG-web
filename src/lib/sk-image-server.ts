// Server-only SK-image helpers shared by the API routes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag } from "next/cache";
import { destroyImage } from "./cloudinary-server";
import type { Media } from "./sk-image";

// Every upload is signed into sk-image/<source>/<key>/. Anything else is not ours to delete, even if a row points at it.
const OWN_ASSET = /^sk-image\/(busy|manual)\/\d{1,18}\/[\w-]{1,200}$/;

export function isOwnAsset(publicId: unknown): publicId is string {
  return typeof publicId === "string" && OWN_ASSET.test(publicId);
}

export const assetMatchesRow = (m: Pick<Media, "source" | "product_key" | "cloudinary_public_id">) =>
  isOwnAsset(m.cloudinary_public_id) && m.cloudinary_public_id.startsWith(`sk-image/${m.source}/${m.product_key}/`);

// Cloudinary first, then the row: a failed Cloudinary delete leaves the photo visible and retryable, never orphaned.
export async function removeMedia(supabase: SupabaseClient, row: Media): Promise<void> {
  if (!assetMatchesRow(row)) throw new Error("Photo does not belong to this product's folder");
  await destroyImage(row.cloudinary_public_id);
  const { error } = await supabase.from("product_media").delete().eq("id", row.id);
  if (error) throw new Error(error.message);
}

// Photo/product changes show on the site now instead of after the 5-minute cache: the catalog data cache, every
// (ISR) product page and the search index.
export function revalidateCatalog(): void {
  revalidateTag("catalog");
  revalidatePath("/parts/[code]", "page");
  revalidatePath("/api/search-index");
}

// Generic message for the browser; the detail goes to the server log only.
export function serverError(context: string, err: unknown, status = 500): Response {
  console.error(`[sk-image] ${context}:`, err);
  return Response.json({ error: `${context} failed. Please try again.` }, { status });
}
