import type { NextConfig } from "next";

// Origins the browser may talk to. Supabase comes from env so a project move needs no code change.
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const CLOUDINARY_IMAGES = "https://res.cloudinary.com";
const CLOUDINARY_API = "https://api.cloudinary.com";
const isDev = process.env.NODE_ENV === "development";
// Vercel's comment/feedback toolbar is injected on preview deployments only.
const VERCEL_LIVE = process.env.VERCEL_ENV === "preview" ? "https://vercel.live" : "";

// 'unsafe-inline' scripts: Next's App Router streams inline <script> chunks. A nonce would force every page to
// render dynamically (no ISR), so it's the documented trade-off here — see AUDIT.md.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} ${VERCEL_LIVE}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${CLOUDINARY_IMAGES} ${VERCEL_LIVE && "https://vercel.live https://vercel.com"}`,
  `font-src 'self' ${VERCEL_LIVE && "https://vercel.live https://assets.vercel.com"}`,
  `connect-src 'self' ${SUPABASE} ${SUPABASE.replace(/^https:/, "wss:")} ${CLOUDINARY_API} ${VERCEL_LIVE && "https://vercel.live wss://ws-us3.pusher.com"}`,
  "media-src 'self' blob:",
  `frame-src ${VERCEL_LIVE || "'none'"}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
]
  .map((d) => d.replace(/\s+/g, " ").trim())
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera only for this site (SK-image); everything else off.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // Every photo is already resized by Cloudinary (f_auto,q_auto,w_…), so Next's own optimizer is switched off:
  // no /_next/image endpoint to attack, no sharp at runtime.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/products", destination: "/parts", statusCode: 301 },
      { source: "/products/:path*", destination: "/parts", statusCode: 301 },
    ];
  },
};

export default nextConfig;
