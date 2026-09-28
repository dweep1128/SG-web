import { destroyImage } from "@/lib/cloudinary-server";
import type { Media } from "@/lib/sk-image";
import { isOwnAsset, removeMedia, revalidateCatalog, serverError } from "@/lib/sk-image-server";
import { requireStaff } from "@/lib/supabase-server";

// Two jobs:
//  { id }       delete a saved photo (Cloudinary, then the row). Responds with the product's remaining photos.
//  { publicId } clean up an upload whose DB save failed. Refused if any row still uses it.
export async function POST(req: Request) {
  const supabase = await requireStaff();
  if (!supabase) return Response.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (body.publicId !== undefined) {
    if (!isOwnAsset(body.publicId)) return Response.json({ error: "Bad publicId" }, { status: 400 });
    const used = await supabase.from("product_media").select("id", { count: "exact", head: true }).eq("cloudinary_public_id", body.publicId);
    if (used.error) return serverError("Checking the photo", used.error);
    if (used.count) return Response.json({ error: "Photo is saved; delete it from the gallery instead" }, { status: 409 });
    try {
      await destroyImage(body.publicId);
    } catch (e) {
      return serverError("Removing the upload", e, 502);
    }
    return Response.json({ ok: true });
  }

  const { id } = body;
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Bad id" }, { status: 400 });
  const { data: row, error } = await supabase.from("product_media").select("*").eq("id", id).maybeSingle<Media>();
  if (error) return serverError("Loading the photo", error);
  if (!row) return Response.json({ error: "Photo not found" }, { status: 404 });

  try {
    await removeMedia(supabase, row);
  } catch (e) {
    return serverError("Deleting the photo", e, 502);
  }

  const list = await supabase.from("product_media").select("*").eq("source", row.source).eq("product_key", row.product_key).order("sort_order");
  const media = (list.data ?? []) as Media[];
  // Deleting the cover promotes the first remaining photo, so a product with photos always has one.
  if (row.is_primary && media.length && !media.some((m) => m.is_primary)) {
    await supabase.from("product_media").update({ is_primary: true }).eq("id", media[0].id);
    media[0].is_primary = true;
  }
  revalidateCatalog();
  return Response.json({ media });
}
