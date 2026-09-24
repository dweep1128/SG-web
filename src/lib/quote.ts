"use client";
// Quote list, persisted in localStorage and synced across tabs. Snapshots of name/price are stored so the
// quote page renders instantly without refetching the catalog; the dealer confirms final prices on WhatsApp anyway.
import { useSyncExternalStore } from "react";
import type { Part } from "./catalog-types";
import { SITE } from "./site";

export type QuoteLine = Pick<Part, "code" | "name" | "price" | "gst" | "unit"> & { qty: number };

export const MIN_QTY = 1;
export const MAX_QTY = 999;
const STORAGE_KEY = "parts-quote-v1";

let lines: QuoteLine[] | null = null; // null = not yet read from storage
const listeners = new Set<() => void>();
const EMPTY: QuoteLine[] = [];

export const clampQty = (n: number) => Math.min(MAX_QTY, Math.max(MIN_QTY, Math.round(Number.isFinite(n) ? n : MIN_QTY)));

function read(): QuoteLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l?.code === "number" && typeof l?.name === "string").map((l) => ({ ...l, qty: clampQty(l.qty) })) : [];
  } catch {
    return []; // private mode / corrupt JSON: start empty rather than crash
  }
}

function write(next: QuoteLine[]) {
  lines = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked — quote still works for this tab */
  }
  listeners.forEach((l) => l());
}

function snapshot(): QuoteLine[] {
  if (lines === null) lines = read();
  return lines;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      lines = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useQuote(): QuoteLine[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function addToQuote(part: Pick<Part, "code" | "name" | "price" | "gst" | "unit">, qty: number) {
  const current = snapshot();
  const existing = current.find((l) => l.code === part.code);
  write(
    existing
      ? current.map((l) => (l.code === part.code ? { ...l, qty: clampQty(l.qty + qty) } : l))
      : [...current, { code: part.code, name: part.name, price: part.price, gst: part.gst, unit: part.unit, qty: clampQty(qty) }],
  );
}

export const setQty = (code: number, qty: number) => write(snapshot().map((l) => (l.code === code ? { ...l, qty: clampQty(qty) } : l)));
export const removeLine = (code: number) => write(snapshot().filter((l) => l.code !== code));
export const clearQuote = () => write([]);

export type QuoteContact = { name: string; phone: string; notes: string };

export function buildQuoteMessage(quoteLines: QuoteLine[], contact: QuoteContact): string {
  const totalQty = quoteLines.reduce((sum, l) => sum + l.qty, 0);
  const items = quoteLines.map((l, i) => `${i + 1}. ${l.name}\n   Code ${l.code} · Qty ${l.qty}${l.unit ? ` ${l.unit}` : ""}`);
  return [
    `Hello ${SITE.name}, please send me a quote for:`,
    "",
    ...items,
    "",
    `Total: ${quoteLines.length} part${quoteLines.length === 1 ? "" : "s"}, ${totalQty} qty`,
    `Name / Shop: ${contact.name.trim()}`,
    ...(contact.phone.trim() ? [`Phone: ${contact.phone.trim()}`] : []),
    ...(contact.notes.trim() ? [`Notes: ${contact.notes.trim()}`] : []),
  ].join("\n");
}
