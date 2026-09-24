import type { Metadata } from "next";
import { QuoteView } from "./quote-view";

export const metadata: Metadata = {
  title: "Your quote",
  description: "Review your parts list and send it to us on WhatsApp for a quote.",
  robots: { index: false },
};

export default function QuotePage() {
  return (
    <div className="shell page">
      <header className="page__head">
        <p className="eyebrow">Quote list</p>
        <h1>Your quote</h1>
      </header>
      <QuoteView />
    </div>
  );
}
