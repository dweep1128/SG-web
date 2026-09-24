"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/catalog-types";
import { useQuoteCart } from "@/components/site-chrome";

export default function QuotePage() {
  const { items, update, remove } = useQuoteCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  function sendOnWhatsApp(event: FormEvent) {
    event.preventDefault();
    const lines = items.map((item, index) => `${index + 1}. ${item.busy_name} — Qty: ${item.quantity}`).join("%0A");
    const greeting = `Hello SK Traders, I'd like a quote for the following parts:%0A%0A${lines}%0A%0AName: ${name || "-"}%0APhone: ${phone || "-"}`;
    const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919999999999";
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(greeting)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="shell quote-page">
      <span className="eyebrow">YOUR SELECTED PARTS</span>
      <h1>Build your quote</h1>
      {items.length ? (
        <>
          <div className="quote-list">
            {items.map((item) => (
              <div className="quote-line" key={item.busy_code}>
                <div>
                  <b>{item.busy_name}</b>
                  <small>{formatPrice(item.price)} · code {item.busy_code}</small>
                </div>
                <div className="quantity">
                  <button onClick={() => update(item.busy_code, -1)} aria-label="Decrease quantity">−</button>
                  <output>{item.quantity}</output>
                  <button onClick={() => update(item.busy_code, 1)} aria-label="Increase quantity">+</button>
                </div>
                <button className="remove" onClick={() => remove(item.busy_code)} aria-label={`Remove ${item.busy_name}`}>×</button>
              </div>
            ))}
          </div>
          <div className="quote-summary">
            <span>{items.length} part{items.length === 1 ? "" : "s"}</span>
            <b>{totalItems} item{totalItems === 1 ? "" : "s"} total</b>
          </div>
          <form className="whatsapp-form" onSubmit={sendOnWhatsApp}>
            <div className="compact-grid">
              <input placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} />
              <input placeholder="Phone / WhatsApp" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit">Send via WhatsApp ↗</button>
          </form>
        </>
      ) : (
        <div className="empty">
          Your quote is empty.
          <br />
          <Link className="btn btn-primary" href="/products" style={{ marginTop: 20 }}>Browse parts →</Link>
        </div>
      )}
    </section>
  );
}
