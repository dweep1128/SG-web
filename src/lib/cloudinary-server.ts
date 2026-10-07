// Server-only Cloudinary signing + delete. Uses CLOUDINARY_API_SECRET, so never import this from a client component.
import { createHash } from "node:crypto";
import { MAX_LONG_SIDE } from "./sk-image";

function env() {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary env missing: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
  return { cloudName, apiKey, apiSecret };
}

// Cloudinary signature: sha1 of the sorted "k=v&k=v" params with the secret appended.
function sign(params: Record<string, string | number>, secret: string): string {
  const payload = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("sha1").update(payload + secret).digest("hex");
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

// Everything the browser needs to POST one file straight to Cloudinary. Every param is signed, so the browser can't
// change them: allowed_formats rejects anything that isn't jpg/png/webp; the incoming transformation caps what is
// stored at 1600 px / auto quality even if a client skips its own resize (upload bytes are capped by the Cloudinary plan).
export function signUpload(folder: string) {
  const { cloudName, apiKey, apiSecret } = env();
  const params = { allowed_formats: "jpg,png,webp", folder, timestamp: nowSeconds(), transformation: `c_limit,w_${MAX_LONG_SIDE},h_${MAX_LONG_SIDE},q_auto` };
  return { ...params, signature: sign(params, apiSecret), api_key: apiKey, cloud_name: cloudName };
}

// "not found" counts as success: the goal is that the asset is gone.
export async function destroyImage(publicId: string): Promise<void> {
  const { cloudName, apiKey, apiSecret } = env();
  const params = { invalidate: "true", public_id: publicId, timestamp: nowSeconds() };
  const body = new URLSearchParams({ ...params, timestamp: String(params.timestamp), api_key: apiKey, signature: sign(params, apiSecret) });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { result?: string; error?: { message?: string } };
  if (!res.ok || (json.result !== "ok" && json.result !== "not found")) {
    throw new Error(`Cloudinary delete failed: ${json.error?.message ?? json.result ?? res.status}`);
  }
}
