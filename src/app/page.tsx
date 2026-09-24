import { getParts } from "@/lib/catalog";
import { categoryLabel } from "@/lib/catalog-types";

export const revalidate = 300;

// Phase 1 stub — replaced by the real home page in Phase 3.
export default async function Home() {
  const parts = await getParts();
  return (
    <main>
      <h1>{parts.length} parts</h1>
      <ul>{parts.slice(0, 20).map((p) => <li key={p.code}>{p.code} {p.name} — {categoryLabel(p.cat)}</li>)}</ul>
    </main>
  );
}
