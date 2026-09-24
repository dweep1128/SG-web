"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { CATEGORIES } from "@/lib/categories";
import { CategoryIcon } from "./category-icon";

// Native <details> dropdown: works without JS; JS only closes it on navigation, Esc and outside click.
export function CategoriesMenu() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) {
        el.open = false;
        if (e instanceof KeyboardEvent) el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, []);

  return (
    <details className="cat-menu" ref={ref}>
      <summary className="btn btn--ghost cat-menu__toggle">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        <span>Categories</span>
      </summary>
      <nav className="cat-menu__panel" aria-label="Part categories" onClick={() => ref.current && (ref.current.open = false)}>
        <Link href="/parts" className="cat-menu__all">All parts →</Link>
        <ul>
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/parts?cat=${c.slug}`}>
                <CategoryIcon cat={c.slug} size={20} />
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
