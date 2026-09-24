"use client";
import { useState } from "react";
import type { Part } from "@/lib/catalog-types";
import { addToQuote, clampQty, MAX_QTY, MIN_QTY } from "@/lib/quote";
import { toast } from "./toast";

type QuotePart = Pick<Part, "code" | "name" | "price" | "gst" | "unit">;

function added(part: QuotePart, qty: number) {
  addToQuote(part, qty);
  toast(`Added ${qty} × ${part.name}`, { label: "View quote", href: "/quote" });
}

export function QtyStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper__btn" onClick={() => onChange(clampQty(value - 1))} disabled={value <= MIN_QTY} aria-label="Decrease quantity">−</button>
      <input
        className="stepper__input"
        type="number"
        inputMode="numeric"
        min={MIN_QTY}
        max={MAX_QTY}
        value={value}
        aria-label="Quantity"
        onChange={(e) => onChange(clampQty(e.target.valueAsNumber))}
      />
      <button type="button" className="stepper__btn" onClick={() => onChange(clampQty(value + 1))} disabled={value >= MAX_QTY} aria-label="Increase quantity">+</button>
    </div>
  );
}

// Detail page: stepper + big button.
export function AddToQuote({ part }: { part: QuotePart }) {
  const [qty, setQty] = useState(1);
  return (
    <div className="add-to-quote">
      <QtyStepper value={qty} onChange={setQty} label={`Quantity for ${part.name}`} />
      <button type="button" className="btn btn--primary btn--lg add-to-quote__btn" onClick={() => added(part, qty)}>
        Add to quote
      </button>
    </div>
  );
}

// Card: one-tap add of qty 1.
export function QuickAdd({ part }: { part: QuotePart }) {
  return (
    <button type="button" className="quick-add" onClick={() => added(part, 1)} aria-label={`Add ${part.name} to quote`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  );
}
