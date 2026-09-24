"use client";
import Link from "next/link";
import { useQuote } from "@/lib/quote";

export function QuoteLink() {
  const count = useQuote().length; // distinct parts, not total qty (50 bolts shouldn't read as "50")
  return (
    <Link href="/quote" className="quote-link" aria-label={`Quote list, ${count} part${count === 1 ? "" : "s"}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" />
      </svg>
      <span className="quote-link__label">Quote</span>
      <span className={count ? "quote-link__count" : "quote-link__count quote-link__count--empty"} aria-hidden="true">{count}</span>
    </Link>
  );
}
