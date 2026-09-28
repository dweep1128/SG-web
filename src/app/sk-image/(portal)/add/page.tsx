import Link from "next/link";
import { DeleteProduct, ProductForm, ToggleActive } from "@/components/sk-image/product-form";
import { Badge, ButtonLink, CodeTag, EmptyState } from "@/components/ui";
import { formatPrice } from "@/lib/catalog-types";
import { photosHref, type ManualProduct } from "@/lib/sk-image";
import { serverSupabase } from "@/lib/supabase-server";

type Props = { searchParams: Promise<{ edit?: string | string[] }> };

export default async function AddProductPage({ searchParams }: Props) {
  const { edit } = await searchParams;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.from("products_manual").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const products = (data ?? []) as ManualProduct[];
  const editing = products.find((p) => String(p.id) === edit) ?? null;

  return (
    <div className="shell page sk-add">
      <section className="card sk-form-card" aria-labelledby="form-heading">
        <h1 id="form-heading" className="sk-title">{editing ? "Edit product" : "Add product"}</h1>
        {/* key: switching ?edit= must reset the uncontrolled fields */}
        <ProductForm key={editing?.id ?? "new"} product={editing} />
        {editing && <Link href="/sk-image/add" className="section__more">Cancel edit</Link>}
      </section>

      <section aria-labelledby="manual-heading">
        <h2 id="manual-heading" className="sk-subtitle">Manual products</h2>
        {products.length === 0 ? (
          <EmptyState title="None yet">Products added here show on the website next to BUSY items.</EmptyState>
        ) : (
          <ul className="sk-rows">
            {products.map((p) => (
              <li key={p.id} className="sk-row card">
                <div className="sk-row__info">
                  <div className="detail__tags">
                    <CodeTag code={p.sku} />
                    {p.is_active ? <Badge tone="in">Active</Badge> : <Badge>Disabled</Badge>}
                  </div>
                  <p className="sk-row__name">{p.name}</p>
                  <p className="sk-row__meta">{formatPrice(p.price != null && p.price > 0 ? Number(p.price) : null)} · stock {p.stock ?? "—"}</p>
                </div>
                <div className="sk-row__actions">
                  <ButtonLink size="sm" href={`/sk-image/add?edit=${p.id}`}>Edit</ButtonLink>
                  <ButtonLink size="sm" href={photosHref("manual", String(p.id))}>Photos</ButtonLink>
                  <ToggleActive id={p.id} active={p.is_active} />
                  <DeleteProduct id={p.id} name={p.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
