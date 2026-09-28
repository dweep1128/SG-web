// Client-safe Cloudinary helpers. Signing lives in cloudinary-server.ts (API secret never reaches the browser).

// Stored URLs are plain secure_url values; transforms are added at render time.
export function cld(url: string, width: number): string {
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${width}/`);
}

export const CARD_IMAGE_WIDTH = 600;
export const DETAIL_IMAGE_WIDTH = 1200;
