"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";

type Toast = { id: number; message: string; action?: { label: string; href: string }; error?: boolean };

const TOAST_MS = 3200;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, action?: Toast["action"], error = false) {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { id, message, action, error }]; // keep at most 3 on screen
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, TOAST_MS);
}

export const toastError = (message: string) => toast(message, undefined, true);

const subscribe =(l: () => void) => (listeners.add(l), () => listeners.delete(l));
const EMPTY: Toast[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {list.map((t) => (
        <div className={t.error ? "toast toast--error" : "toast"} key={t.id}>
          <span>{t.message}</span>
          {t.action && <Link href={t.action.href}>{t.action.label}</Link>}
        </div>
      ))}
    </div>
  );
}
