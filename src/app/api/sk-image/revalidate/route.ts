import { revalidateCatalog } from "@/lib/sk-image-server";
import { requireStaff } from "@/lib/supabase-server";

// Called by the portal after writes it makes straight to Supabase (upload saved, cover, reorder, product edits).
export async function POST() {
  if (!(await requireStaff())) return Response.json({ error: "Not signed in" }, { status: 401 });
  revalidateCatalog();
  return Response.json({ ok: true });
}
