// SK-image shared types, limits and upload steps. Pure / browser-safe; also imported by the API routes for limits.
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_PHOTOS = 8;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_LONG_SIDE = 1600;
export const JPEG_QUALITY = 0.8;

// "manual" is the stored value for portal-added products (kept: Cloudinary folders and /parts/m<id> URLs use it).
export type Source = "busy" | "manual";
export const SOURCE_LABEL: Record<Source, string> = { busy: "BUSY", manual: "Portal" };

// Portal roles live in the user's app_metadata.role (only the service role can set it): owner or staff.
export type Role = "owner" | "staff";
export const roleOf = (claims: { app_metadata?: Record<string, unknown> } | null | undefined): Role | null => {
  const r = claims?.app_metadata?.role;
  return r === "owner" || r === "staff" ? r : null;
};
export type Media = { id: number; source: Source; product_key: string; cloudinary_public_id: string; url: string; is_primary: boolean; sort_order: number };
export type ManualProduct = { id: number; sku: string; name: string; display_name: string | null; category: string | null; price: number | null; stock: number | null; in_stock: boolean; busy_code: number | null; description: string | null; is_active: boolean };

// Both keys are numeric ids as text (busy_code / products_manual.id), so one strict check covers both.
export function isProductRef(source: unknown, key: unknown): source is Source {
  return (source === "busy" || source === "manual") && typeof key === "string" && /^\d{1,18}$/.test(key);
}

export const photosHref = (source: Source, key: string) => `/sk-image/p/${source}/${key}`;

// Downscale to MAX_LONG_SIDE and re-encode as JPEG, entirely in memory.
export function toJpeg(src: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))), "image/jpeg", JPEG_QUALITY));
}

// Throws a user-facing message for files that break the limits.
export async function fileToJpeg(file: File): Promise<Blob> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error(`${file.name}: only JPG, PNG or WebP`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: larger than 10 MB`);
  const bitmap = await createImageBitmap(file); // applies EXIF rotation
  try {
    return await toJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export type Uploaded = { public_id: string; secure_url: string };

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const json = await res.json().catch(() => null);
  return json?.error?.message ?? json?.error ?? fallback;
}

// Step 1: signed direct upload to Cloudinary. Kept separate from step 2 so a failed DB save retries without re-uploading.
export async function uploadToCloudinary(source: Source, key: string, blob: Blob): Promise<Uploaded> {
  const signRes = await fetch("/api/sk-image/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, key }) });
  if (!signRes.ok) throw new Error(await errorMessage(signRes, "Could not start upload"));
  const { cloud_name, ...fields } = (await signRes.json()) as Record<string, string>;
  const form = new FormData();
  form.append("file", blob, "photo.jpg");
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorMessage(res, "Upload failed"));
  return res.json();
}

// Step 2: record it. The DB trigger sets is_primary / sort_order and enforces the 8-photo limit.
export async function saveMedia(supabase: SupabaseClient, source: Source, key: string, up: Uploaded): Promise<Media> {
  const { data, error } = await supabase
    .from("product_media")
    .insert({ source, product_key: key, cloudinary_public_id: up.public_id, url: up.secure_url })
    .select()
    .single();
  // Unique violation on retry = an earlier attempt did save (its response was lost). Treat as success.
  if (error?.code === "23505") {
    const again = await supabase.from("product_media").select("*").eq("source", source).eq("product_key", key).eq("cloudinary_public_id", up.public_id).single();
    if (!again.error) return again.data as Media;
  }
  if (error) throw new Error(error.message);
  return data as Media;
}

async function postJson(url: string, body: unknown = {}): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

// Removes an uploaded file that never made it into product_media. true = gone (so a retry must upload again).
export async function discardUpload(publicId: string): Promise<boolean> {
  try {
    return (await postJson("/api/sk-image/delete", { publicId })).ok;
  } catch {
    return false; // offline: keep it, the retry can still save it
  }
}

// Makes the public site show a change now instead of after its 5-minute cache. Best effort: the cache expires anyway.
export function refreshSite(): void {
  postJson("/api/sk-image/revalidate").catch(() => {});
}
