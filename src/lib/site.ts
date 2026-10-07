// Single source for brand + customer-facing business config. Brand name is NOT final (SK vs SG):
// change it here only — nothing else in the codebase may hardcode it.
export const SITE = {
  name: "S.K. Traders",
  shortName: "S.K.",
  tagline: "E-scooter spare parts for dealers and workshops",
  description: "E-scooter spare parts for dealers and workshops across India, with stock from our billing system. Search by part name or code, build a quote, send it on WhatsApp.",
  // Digits only, country code first (wa.me format). Empty string disables WhatsApp buttons.
  whatsappNumber: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, ""),
  // Absolute origin for sitemap / canonical URLs. Server-side only fallback to Vercel's production host.
  url: siteUrl(),
} as const;

// A malformed NEXT_PUBLIC_SITE_URL must not crash the build (metadataBase does `new URL()`): ignore it and fall back.
function siteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  ];
  for (const c of candidates) {
    if (c && URL.canParse(c)) return c.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

// Business details. Empty string = not shown anywhere (no placeholders on the live site). Fill in to publish.
export const CONTACT = {
  address: "", // shop address, city, state, PIN
  phone: "",
  hours: "", // e.g. "Mon–Sat, 10:00–19:00"
  gstin: "",
  email: "",
  paymentTerms: "", // e.g. "UPI or bank transfer; credit for regular dealers"
  about: [] as string[], // 1–2 short paragraphs for /about
};

// BUSY sale price (Master1.D3) is shown as-is. Unconfirmed whether it includes GST — see PROGRESS.md
// "Decisions to review". false = show "+ GST" and the computed incl. price, which never under-quotes.
export const PRICE_INCLUDES_GST = false;

export const PAGE_SIZE = 24;

// Search engines are kept out unless explicitly enabled ("true" exactly): robots.txt disallows all + noindex meta.
export const ALLOW_INDEXING = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";

// Catalog data cache lifetime (seconds). Stock changes don't wait for it: the cache is keyed by the sync's
// last_change_at (see getParts), so a BUSY change shows on the next render after the sync writes it.
export const CATALOG_REVALIDATE_SECONDS = 300;

// Launch gate. "true" exactly: only products with BOTH a staff display name and a photo appear on the public site
// (listing, search, product pages, sitemap). Default off. Server-only (no NEXT_PUBLIC_): the catalog is built server-side.
export const REQUIRE_DISPLAY_NAME_AND_PHOTO = process.env.REQUIRE_DISPLAY_NAME_AND_PHOTO === "true";

// Listing / product pages check the sync status this often (a one-row read) and re-render only when data changed,
// so a BUSY change shows within ~sync interval (60 s) + this. Product pages are also ISR-cached for 60 s.
export const LIVE_REFRESH_SECONDS = 30;
// Past this without a successful BUSY sync the site shows "data may be out of date".
export const STALE_AFTER_MINUTES = 15;
// Shop time for "Stock updated at …", identical on server and browser.
export const SHOP_TIME_ZONE = "Asia/Kolkata";

export function whatsappLink(message: string): string | null {
  return SITE.whatsappNumber ? `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(message)}` : null;
}
