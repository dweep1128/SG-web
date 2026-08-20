export type Category = { id: string; name: string; slug: string; description: string | null; sort_order: number };
export type ProductImage = { id: string; image_url: string; alt_text: string | null; sort_order: number };
export type ScooterModel = { id: string; brand: string; model: string; model_year: string | null };
export type Product = {
  id: string; category_id: string; name: string; slug: string; sku: string; short_description: string | null;
  description: string | null; voltage: string | null; connector_type: string | null; warranty: string | null;
  product_type: string | null; moq: number; stock: "in_stock" | "limited" | "out_of_stock"; available_quantity: number | null;
  dispatch_time: string | null; price_from: number | null; is_featured: boolean; is_active: boolean;
  categories?: Pick<Category, "name" | "slug"> | null; product_images?: ProductImage[];
  product_compatibility?: { scooter_models: ScooterModel | null }[];
};
