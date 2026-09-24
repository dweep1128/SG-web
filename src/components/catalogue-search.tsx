"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function CatalogueSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  function search(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/products?q=${encodeURIComponent(value)}` : "/products");
  }
  return (
    <form className="catalogue-search" onSubmit={search}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by part name…" aria-label="Search parts" />
      <button className="btn btn-primary" type="submit">Search →</button>
    </form>
  );
}
