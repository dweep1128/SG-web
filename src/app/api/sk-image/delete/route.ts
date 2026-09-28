import { destroyImage } from "@/lib/cloudinary-server";
import type { Media } from "@/lib/sk-image";
import { requireStaff } from "@/lib/supabase-server";

// Cloudinary first, then the row: a failed Cloudinary delete leaves the photo visible and retryable, never orphaned.
// Responds with the product's remaining photos so the client doesn't have to guess the new primary.
export async function POST(req: Request) {
  const supabase = await requireStaff();
  if (!supabase) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!Number.isSafeInteger(id)) return Response.json({ error: "Bad id" }, { status: 400 });

  const { data: row } = await supabase.from("product_media").select("*").eq("id", id).maybeSingle<Media>();
  if (!row) return Response.json({ error: "Photo not found" }, { status: 404 });

  try {
    await destroyImage(row.cloudinary_public_id);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
  const del = await supabase.from("product_media").delete().eq("id", id);
  if (del.error) return Response.json({ error: del.error.message }, { status: 500 });

  const list = await supabase.from("product_media").select("*").eq("source", row.source).eq("product_key", row.product_key).order("sort_order");
  const media = (list.data ?? []) as Media[];
  // Deleting the primary promotes the first remaining photo, so a product with photos always has a cover.
  if (row.is_primary && media.length && !media.some((m) => m.is_primary)) {
    await supabase.from("product_media").update({ is_primary: true }).eq("id", media[0].id);
    media[0].is_primary = true;
  }
  return Response.json({ media });
}
