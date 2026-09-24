"use client";
import { SORTS, type SortValue } from "@/lib/listing";

// Lives inside a GET <form>; submits itself on change. <noscript> button covers no-JS.
export function SortSelect({ value, withRelevance }: { value: SortValue; withRelevance: boolean }) {
  return (
    <>
      <label htmlFor="sort" className="visually-hidden">Sort by</label>
      <select id="sort" name="sort" className="input input--compact" defaultValue={value} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {SORTS.filter((s) => withRelevance || s.value !== "relevance").map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <noscript><button type="submit" className="btn btn--sm">Apply</button></noscript>
    </>
  );
}
