import { signUpload } from "@/lib/cloudinary-server";
import { isProductRef, MAX_PHOTOS } from "@/lib/sk-image";
import { serverError } from "@/lib/sk-image-server";
import { requireStaff } from "@/lib/supabase-server";

// Returns a one-off signature so the browser uploads straight to Cloudinary. The API secret stays here.
// Signed params pin the folder (sk-image/<source>/<key>) and formats (jpg/png/webp); file size is capped by the
// client (10 MB) and by the Cloudinary account's own upload limit.
export async function POST(req: Request) {
  const supabase = await requireStaff();
  if (!supabase) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { source, key } = await req.json().catch(() => ({}));
  if (!isProductRef(source, key)) return Response.json({ error: "Bad product" }, { status: 400 });

  // Only sign for products that exist, so the folder can't be filled with junk keys. admin_catalog includes hidden ones.
  const product = await supabase.from("admin_catalog").select("product_key", { count: "exact", head: true }).eq("source", source).eq("product_key", key);
  if (product.error) return serverError("Checking the product", product.error);
  if (!product.count) return Response.json({ error: "Product not found" }, { status: 404 });

  // Refuse before uploading so a full product doesn't leave orphan files in Cloudinary. The DB trigger is the hard stop.
  const { count, error } = await supabase.from("product_media").select("id", { count: "exact", head: true }).eq("source", source).eq("product_key", key);
  if (error) return serverError("Counting photos", error);
  if ((count ?? 0) >= MAX_PHOTOS) return Response.json({ error: `This product already has ${MAX_PHOTOS} photos` }, { status: 409 });

  try {
    return Response.json(signUpload(`sk-image/${source}/${key}`));
  } catch (e) {
    return serverError("Starting the upload", e);
  }
}
