"use client";
import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { QtyStepper } from "@/components/add-to-quote";
import { toast } from "@/components/toast";
import { Button, ButtonLink, CodeTag, EmptyState, Input, Skeleton, Textarea } from "@/components/ui";
import { formatPrice, GST_NOTE, partHref } from "@/lib/catalog-types";
import { buildQuoteMessage, clearQuote, removeLine, setQty, useQuote } from "@/lib/quote";
import { whatsappLink } from "@/lib/site";

// Indian mobile/landline with optional +91 / spaces. Loose on purpose: WhatsApp is the real verification.
const PHONE_PATTERN = "[+]?[0-9 ]{10,15}";
const noop = () => () => {};

export function QuoteView() {
  const lines = useQuote();
  const mounted = useSyncExternalStore(noop, () => true, () => false); // avoid flashing "empty" before localStorage is read
  const [contact, setContact] = useState({ name: "", phone: "", notes: "" });

  if (!mounted) return <Skeleton height={240} />;

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Your quote is empty"
        actions={<ButtonLink href="/parts" variant="primary">Browse parts</ButtonLink>}
      >
        Add parts from the catalog, then send the list to us on WhatsApp. We reply with final prices and dispatch time.
      </EmptyState>
    );
  }

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const priced = lines.filter((l) => l.price != null);
  const subtotal = priced.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
  const message = buildQuoteMessage(lines, contact);
  const waUrl = whatsappLink(message);

  function send(e: FormEvent) {
    e.preventDefault();
    if (!waUrl) return;
    window.open(waUrl, "_blank", "noopener,noreferrer");
    toast("Opening WhatsApp: just press send there.");
  }

  const field = (key: keyof typeof contact) => ({
    value: contact[key],
    onChange: (e: { target: { value: string } }) => setContact((c) => ({ ...c, [key]: e.target.value })),
  });

  return (
    <div className="quote">
      <section aria-label="Parts in your quote">
        <ul className="quote__lines">
          {lines.map((l) => (
            <li key={l.code} className="quote-line">
              <div className="quote-line__info">
                <CodeTag code={l.code} />
                <Link href={partHref(l.code)} className="quote-line__name">{l.name}</Link>
                <p className="quote-line__price">
                  {formatPrice(l.price)}
                  {l.price != null && <span> {GST_NOTE}{l.unit ? ` / ${l.unit}` : ""}</span>}
                </p>
              </div>
              <div className="quote-line__actions">
                <QtyStepper value={l.qty} onChange={(n) => setQty(l.code, n)} label={`Quantity for ${l.name}`} />
                <Button variant="ghost" size="sm" onClick={() => removeLine(l.code)} aria-label={`Remove ${l.name}`}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="quote__summary">
          <p><strong>{lines.length}</strong> part{lines.length === 1 ? "" : "s"} · <strong>{totalQty}</strong> total qty</p>
          {priced.length > 0 && (
            <p className="quote__subtotal">
              Indicative subtotal {formatPrice(subtotal)} {GST_NOTE}
              {priced.length < lines.length && ` (${lines.length - priced.length} on request)`}
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={clearQuote}>Clear quote</Button>
        </div>
      </section>

      <form className="quote__form card" onSubmit={send} aria-labelledby="send-heading">
        <h2 id="send-heading" className="quote__form-title">Send for quote</h2>
        <Input id="q-name" label="Your name / shop name" required autoComplete="name" {...field("name")} />
        <Input id="q-phone" label="Phone" type="tel" required inputMode="tel" autoComplete="tel" pattern={PHONE_PATTERN} hint="10-digit mobile, +91 optional" {...field("phone")} />
        <Textarea id="q-notes" label="Notes (optional)" placeholder="Delivery city, model, urgency…" rows={3} {...field("notes")} />
        <button type="submit" className="btn btn--whatsapp btn--lg btn--block" disabled={!waUrl}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3a.4.4 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z" /></svg>
          Send via WhatsApp
        </button>
        {!waUrl && <p className="field__hint">WhatsApp number isn&apos;t configured yet (NEXT_PUBLIC_WHATSAPP_NUMBER).</p>}
        <p className="field__hint">Opens WhatsApp with your list filled in. Nothing is sent until you press send.</p>
      </form>
    </div>
  );
}
