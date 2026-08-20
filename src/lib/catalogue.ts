import { createClient } from "@/lib/supabase/server";
import { Category, Product, ScooterModel } from "@/lib/types";

const productSelect = "*, categories(name,slug), product_images(id,image_url,alt_text,sort_order), product_compatibility(scooter_models(id,brand,model,model_year))";
export async function getCategories(): Promise<Category[]> { const supabase = await createClient(); const { data } = await supabase.from("categories").select("*").order("sort_order"); return data || []; }
export async function getFeaturedProducts(): Promise<Product[]> { const supabase = await createClient(); const { data } = await supabase.from("products").select(productSelect).eq("is_active", true).eq("is_featured", true).order("created_at", { ascending: false }).limit(8); return (data || []) as Product[]; }
export async function getProducts({ category, query, model }: { category?: string; query?: string; model?: string } = {}): Promise<Product[]> {
  const supabase = await createClient();
  let categoryId: string | undefined;
  if (category) { const { data } = await supabase.from("categories").select("id").eq("slug", category).maybeSingle(); categoryId = data?.id; if (!categoryId) return []; }
  let compatibleIds: string[] | undefined;
  if (model) { const { data } = await supabase.from("product_compatibility").select("product_id").eq("scooter_model_id", model); compatibleIds = (data || []).map(item => item.product_id); if (!compatibleIds.length) return []; }
  let request = supabase.from("products").select(productSelect).eq("is_active", true).order("is_featured", { ascending: false }).order("name");
  if (query) request = request.or(`name.ilike.%${query}%,sku.ilike.%${query}%,short_description.ilike.%${query}%`);
  if (categoryId) request = request.eq("category_id", categoryId);
  if (compatibleIds) request = request.in("id", compatibleIds);
  const { data } = await request; return (data || []) as Product[];
}
export async function getProduct(slug: string): Promise<Product | null> { const supabase = await createClient(); const { data } = await supabase.from("products").select(productSelect).eq("slug", slug).eq("is_active", true).maybeSingle(); return data as Product | null; }
export async function getModels(): Promise<ScooterModel[]> { const supabase = await createClient(); const { data } = await supabase.from("scooter_models").select("*").order("brand").order("model"); return data || []; }
