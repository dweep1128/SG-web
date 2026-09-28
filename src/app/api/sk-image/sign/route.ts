import { signUpload } from "@/lib/cloudinary-server";
import { isProductRef, MAX_PHOTOS } from "@/lib/sk-image";
import { requireStaff } from "@/lib/supabase-server";

// Returns a one-off signature so the browser uploads straight to Cloudinary. The API secret stays here.
export async function POST(req: Request) {
  const supabase = await requireStaff();
  if (!supabase) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { source, key } = await req.json().catch(() => ({}));
  if (!isProductRef(source, key)) return Response.json({ error: "Bad product" }, { status: 400 });

  // Refuse before uploading so a full product doesn't leave orphan files in Cloudinary. The DB trigger is the hard stop.
  const { count, error } = await supabase.from("product_media").select("id", { count: "exact", head: true }).eq("source", source).eq("product_key", key);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if ((count ?? 0) >= MAX_PHOTOS) return Response.json({ error: `This product already has ${MAX_PHOTOS} photos` }, { status: 409 });

  try {
    return Response.json(signUpload(`sk-image/${source}/${key}`));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
