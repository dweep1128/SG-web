// Single source for brand + customer-facing business config. Brand name is NOT final (SK vs SG):
// change it here only — nothing else in the codebase may hardcode it.
export const SITE = {
  name: "S.K. Traders",
  shortName: "S.K.",
  tagline: "E-scooter spare parts for dealers and workshops",
  description: "Live-stock e-scooter spare parts for dealers and workshops across India. Search by part name or code, build a quote, send it on WhatsApp.",
  // Digits only, country code first (wa.me format). Empty string disables WhatsApp buttons.
  whatsappNumber: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, ""),
  // Absolute origin for sitemap / canonical URLs. Server-side only fallback to Vercel's production host.
  url:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
} as const;

// BUSY sale price (Master1.D3) is shown as-is. Unconfirmed whether it includes GST — see PROGRESS.md
// "Decisions to review". false = show "+ GST" and the computed incl. price, which never under-quotes.
export const PRICE_INCLUDES_GST = false;

// At or below this synced quantity an in-stock item shows "Low stock". Raw quantity never reaches the browser.
export const LOW_STOCK_THRESHOLD = 10;

export const PAGE_SIZE = 24;

// Catalog + detail data cache lifetime (seconds). Matches the stock sync cadence closely enough.
export const CATALOG_REVALIDATE_SECONDS = 300;

export function whatsappLink(message: string): string | null {
  return SITE.whatsappNumber ? `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(message)}` : null;
}
