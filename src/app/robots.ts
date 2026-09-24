import type { MetadataRoute } from "next";
import { ALLOW_INDEXING, SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!ALLOW_INDEXING) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/quote", "/search"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
