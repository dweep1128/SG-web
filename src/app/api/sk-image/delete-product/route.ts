import type { Media } from "@/lib/sk-image";
import { removeMedia, revalidateCatalog, serverError } from "@/lib/sk-image-server";
import { requireStaff } from "@/lib/supabase-server";

// Permanent delete of a MANUAL product: each photo (Cloudinary, then its row), then the product row.
// Stops at the first failure, so whatever is left is still consistent and the delete can simply be retried.
// BUSY items can't be deleted here: they belong to the sync.
export async function POST(req: Request) {
  const supabase = await requireStaff();
  if (!supabase) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Bad id" }, { status: 400 });

  const product = await supabase.from("products_manual").select("id").eq("id", id).maybeSingle();
  if (product.error) return serverError("Loading the product", product.error);
  if (!product.data) return Response.json({ error: "Product not found" }, { status: 404 });

  const media = await supabase.from("product_media").select("*").eq("source", "manual").eq("product_key", String(id));
  if (media.error) return serverError("Loading the photos", media.error);
  try {
    for (const row of media.data as Media[]) await removeMedia(supabase, row);
  } catch (e) {
    return serverError("Deleting the product's photos", e, 502);
  }

  const del = await supabase.from("products_manual").delete().eq("id", id);
  if (del.error) return serverError("Deleting the product", del.error);
  revalidateCatalog();
  return Response.json({ ok: true });
}
