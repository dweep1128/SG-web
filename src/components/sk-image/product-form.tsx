"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CATEGORIES, isCategorySlug } from "@/lib/categories";
import { photosHref, refreshSite, type ManualProduct } from "@/lib/sk-image";
import { browserSupabase } from "@/lib/supabase";
import { toast, toastError } from "../toast";
import { Button, Input, Textarea } from "../ui";

const MAX_NAME = 200;
const MAX_SKU = 64;
const MAX_DESCRIPTION = 2000;

type Row = Omit<ManualProduct, "id">;

// Native constraints catch most of this before submit; this is the check that actually gates the write.
function parse(fd: FormData): Row | string {
  const text = (k: string) => String(fd.get(k) ?? "").trim();
  const num = (k: string) => (text(k) === "" ? null : Number(text(k)));
  const name = text("name");
  const displayName = text("display_name");
  const sku = text("sku");
  const price = num("price");
  const stock = num("stock");
  const category = text("category");
  const busyCode = num("busy_code");
  if (!name || name.length > MAX_NAME) return `Name is required (max ${MAX_NAME} characters).`;
  if (displayName.length > MAX_NAME) return `Display name: max ${MAX_NAME} characters.`;
  if (sku.length > MAX_SKU) return `SKU: max ${MAX_SKU} characters.`; // blank is fine: the database generates one (supabase/manual-sku-auto.sql)
  if (price != null && !(Number.isFinite(price) && price >= 0)) return "Price must be 0 or more.";
  if (stock != null && !(Number.isInteger(stock) && stock >= 0)) return "Stock must be a whole number, 0 or more.";
  if (busyCode != null && !(Number.isSafeInteger(busyCode) && busyCode > 0)) return "BUSY code must be a whole number.";
  return {
    name,
    display_name: displayName || null,
    sku,
    category: isCategorySlug(category) ? category : null,
    price,
    stock,
    in_stock: fd.get("in_stock") === "on",
    busy_code: busyCode,
    description: text("description").slice(0, MAX_DESCRIPTION) || null,
    is_active: fd.get("is_active") === "on",
  };
}

export function ProductForm({ product }: { product: ManualProduct | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const row = parse(new FormData(e.currentTarget));
    if (typeof row === "string") return setError(row);
    setError(null);
    setSaving(true);
    const table = browserSupabase().from("products_manual");
    const res = await (product ? table.update(row).eq("id", product.id) : table.insert(row)).select("id").single<{ id: number }>();
    if (res.error) {
      setSaving(false);
      const msg =
        res.error.code === "23505" ? "That SKU is already used by another manual product."
        : res.error.code === "23503" ? "No BUSY item has that code."
        : res.error.message;
      setError(msg);
      toastError(msg);
      return;
    }
    refreshSite();
    toast(product ? "Product saved" : "Product added");
    router.push(photosHref("manual", String(res.data.id)));
  }

  return (
    <form className="sk-form" onSubmit={onSubmit}>
      <Input id="pf-name" name="name" label="Name" required maxLength={MAX_NAME} defaultValue={product?.name} autoComplete="off" />
      <Input id="pf-display" name="display_name" label="Display name" maxLength={MAX_NAME} defaultValue={product?.display_name ?? ""} autoComplete="off" hint="Optional. Shown on the website instead of the name." />
      <Input id="pf-sku" name="sku" label="SKU" maxLength={MAX_SKU} defaultValue={product?.sku} autoComplete="off" autoCapitalize="characters" hint="Your own code for this item. Leave blank to auto-generate." />
      <div className="field">
        <label className="field__label" htmlFor="pf-category">Category</label>
        <select id="pf-category" name="category" className="input" defaultValue={product?.category ?? ""}>
          <option value="">Auto (from the name)</option>
          {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
        </select>
      </div>
      <div className="sk-form__row">
        <Input id="pf-price" name="price" label="Price (₹)" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={product?.price ?? ""} hint="Empty = price on request" />
        <Input id="pf-stock" name="stock" label="Stock" type="number" inputMode="numeric" min={0} step={1} defaultValue={product?.stock ?? ""} hint="Empty = use the switch below" />
      </div>
      <label className="toggle sk-toggle">
        <input type="checkbox" name="in_stock" defaultChecked={product?.in_stock ?? false} className="visually-hidden" />
        <span className="toggle__track" aria-hidden="true" />
        In stock (when no stock count is entered)
      </label>
      <Input id="pf-busy" name="busy_code" label="Same item as BUSY code" type="number" inputMode="numeric" min={1} step={1} defaultValue={product?.busy_code ?? ""} hint="Optional. Set only if this is the same product as a BUSY item: it is then not listed separately, and its stock is added to that item's stock on the website." />
      <Textarea id="pf-description" name="description" label="Description" maxLength={MAX_DESCRIPTION} defaultValue={product?.description ?? ""} />
      <label className="toggle sk-toggle">
        <input type="checkbox" name="is_active" defaultChecked={product?.is_active ?? true} className="visually-hidden" />
        <span className="toggle__track" aria-hidden="true" />
        Visible on website
      </label>
      {error && <p className="sk-form__error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" size="lg" block disabled={saving}>
        {saving ? "Saving…" : product ? "Save and manage photos" : "Save and add photos"}
      </Button>
    </form>
  );
}

// Hide/unhide is a soft toggle: photos and the row stay, the product just leaves catalog_view.
export function ToggleActive({ id, active }: { id: number; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    const { error } = await browserSupabase().from("products_manual").update({ is_active: !active }).eq("id", id);
    setBusy(false);
    if (error) return toastError(error.message);
    refreshSite();
    toast(active ? "Product hidden" : "Product visible again");
    router.refresh();
  }
  return <Button size="sm" onClick={flip} disabled={busy}>{active ? "Hide" : "Unhide"}</Button>;
}

// Permanent (owner only): removes the product's photos from Cloudinary, their rows, then the product. Hide is the undoable option.
export function DeleteProduct({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`Delete "${name}" permanently?

Its photos are deleted too. This cannot be undone. (To just hide it from the website, use Hide.)`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sk-image/delete-product", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      toast("Product deleted");
      router.replace("/sk-image/add");
      router.refresh();
    } catch (e) {
      toastError((e as Error).message);
      setBusy(false);
    }
  }
  return <Button size="sm" className="sk-danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete"}</Button>;
}

export type BusyEditable = { busy_code: number; display_name: string | null; description: string | null; hidden: boolean };

// BUSY items: staff may change only how the item is presented. Price and stock come from BUSY and are shown
// read-only by the page; the database only grants UPDATE on display_name / description / hidden, so nothing else can be written.
// display_name is edited by DisplayNameInput at the top of the same page.
export function BusyItemForm({ item }: { item: BusyEditable }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = (k: string) => String(fd.get(k) ?? "").trim();
    setError(null);
    setSaving(true);
    const { error } = await browserSupabase()
      .from("busy_items")
      .update({ description: text("description").slice(0, MAX_DESCRIPTION) || null, hidden: fd.get("visible") !== "on" })
      .eq("busy_code", item.busy_code);
    setSaving(false);
    if (error) {
      setError(error.message);
      return toastError(error.message);
    }
    refreshSite();
    toast("Saved");
    router.refresh();
  }

  return (
    <form className="sk-form" onSubmit={onSubmit}>
      <Textarea id="bf-description" name="description" label="Description" maxLength={MAX_DESCRIPTION} defaultValue={item.description ?? ""} />
      <label className="toggle sk-toggle">
        <input type="checkbox" name="visible" defaultChecked={!item.hidden} className="visually-hidden" />
        <span className="toggle__track" aria-hidden="true" />
        Visible on website
      </label>
      {error && <p className="sk-form__error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" size="lg" block disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
    </form>
  );
}
