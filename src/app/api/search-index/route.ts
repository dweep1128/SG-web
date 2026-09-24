import { getParts } from "@/lib/catalog";
import { encodeSearchIndex } from "@/lib/search-index";

// Lean list for the header autocomplete, fetched lazily on first focus. Static + revalidated like the catalog.
export const revalidate = 300;

export async function GET() {
  return Response.json(encodeSearchIndex(await getParts()));
}
