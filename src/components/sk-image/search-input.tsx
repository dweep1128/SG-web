"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const DEBOUNCE_MS = 300;

// Writes ?q= to the URL (debounced); the server page does the actual query, so results are shareable and back-button safe.
export function SearchInput({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();

  function apply(v: string) {
    const next = new URLSearchParams(params);
    if (v.trim()) next.set("q", v.trim());
    else next.delete("q");
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `/sk-image?${qs}` : "/sk-image", { scroll: false }));
  }

  useEffect(() => {
    if (value.trim() === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => apply(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply only reads params/router, both listed
  }, [value, params, router]);

  return (
    <form
      role="search"
      className="search search--lg search-page__box sk-search"
      onSubmit={(e) => {
        e.preventDefault();
        apply(value);
        (document.activeElement as HTMLElement | null)?.blur(); // closes the phone keyboard
      }}
    >
      <label htmlFor="sk-q" className="visually-hidden">Search by name or SKU</label>
      <input id="sk-q" type="search" className="search__input" placeholder="Search name or SKU" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" enterKeyHint="search" />
      <button type="submit" className="search__submit" aria-label="Search">
        {pending ? (
          <span className="sk-spinner" aria-hidden="true" />
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        )}
      </button>
    </form>
  );
}
