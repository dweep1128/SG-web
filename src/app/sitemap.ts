import type { MetadataRoute } from "next";
import { getParts } from "@/lib/catalog";
import { CATEGORIES } from "@/lib/categories";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const parts = await getParts();
  const now = new Date();
  return [
    { url: SITE.url, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/parts`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE.url}/about`, changeFrequency: "monthly", priority: 0.3 },
    ...CATEGORIES.map((c) => ({ url: `${SITE.url}/parts?cat=${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...parts.map((p) => ({
      url: `${SITE.url}/parts/${p.code}`,
      lastModified: p.syncedAt ? new Date(p.syncedAt) : now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
