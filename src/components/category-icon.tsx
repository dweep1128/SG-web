import type { CategorySlug } from "@/lib/categories";

// 24×24 stroke icons, drawn for this site. One path string per category keeps this a lookup, not a component zoo.
const PATHS: Record<CategorySlug, string> = {
  chargers: "M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0V8zM12 17v4",
  batteries: "M6 7h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM8 4v3M15 4v3M9 12.5h5M11.5 10v5",
  controllers: "M5 6h14v12H5zM8 3v3M12 3v3M16 3v3M8 18v3M12 18v3M16 18v3M9 10h6v4H9z",
  meters: "M4 16a8 8 0 1 1 16 0M12 16l4-5M4 19h16",
  lights: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  suspension: "M12 2v4M12 18v4M8 6h8M8 18h8M9 8l6 2-6 2 6 2-6 2",
  wheels: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v6M12 15v6M3 12h6M15 12h6",
  brakes: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM18 5l2.5 3-2 5.5",
  motors: "M4 8h12v8H4zM16 10h3v4h-3M7 8V6M13 8V6M7 11h6M7 13h6",
  controls: "M3 12h8M11 9h6a3 3 0 0 1 0 6h-6zM17 12h4",
  wiring: "M4 7h5v4H4zM15 13h5v4h-5zM9 9c4 0 2 6 6 6M5 7V4M8 7V4M16 17v3M19 17v3",
  body: "M3 15l3-6h7l4 3h3a1 1 0 0 1 1 1v2M3 15h18M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  hardware: "M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  other: "M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10",
};

export function CategoryIcon({ cat, size = 24, className }: { cat: CategorySlug; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[cat]} />
    </svg>
  );
}
