"use client";
import Link from "next/link";
import { FormEvent, ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CartItem = { product_id: string; name: string; sku: string; quantity: number };
type CartContextType = { add: (item: Omit<CartItem, "quantity">, quantity?: number) => void; count: number };
const CartContext = createContext<CartContextType | null>(null);
export const useQuoteCart = () => { const value = useContext(CartContext); if (!value) throw new Error("Quote cart must be used inside SiteChrome"); return value; };

function ThemeButton() {
  // `mounted` prevents localStorage from changing the server-rendered first pass.
  const [dark, setDark] = useState(false); const [mounted, setMounted] = useState(false);
  useEffect(() => { const saved = localStorage.getItem("sk-theme") === "dark"; setDark(saved); document.documentElement.dataset.theme = saved ? "dark" : "light"; setMounted(true); }, []);
  const toggle = () => { const next = !dark; setDark(next); localStorage.setItem("sk-theme", next ? "dark" : "light"); document.documentElement.dataset.theme = next ? "dark" : "light"; };
  return <button className="theme-btn" onClick={toggle} aria-label="Toggle dark mode" suppressHydrationWarning>{mounted && dark ? "◐ Light" : "◐ Dark"}</button>;
}

function Header({ openCart }: { openCart: () => void }) {
  const [menu, setMenu] = useState(false); const { count } = useQuoteCart();
  return <><div className="topbar"><div className="shell"><span>WHOLESALE EV SPARE PARTS · PAN-INDIA DISPATCH</span><a href="#contact">Need help? Talk to an expert ↗</a></div></div><header className="site-header"><div className="shell nav-row"><Link className="brand" href="/"><span className="brand-mark"><i/><i/><i/></span><span>SK <small>TRADERS</small></span></Link><nav className="desktop-nav"><Link href="/">Home</Link><Link href="/products">Browse products</Link><Link href="/#find-part">Find my part</Link><Link href="/#wholesale">Wholesale</Link></nav><div className="nav-actions"><ThemeButton/><button className="cart-btn" onClick={openCart} aria-label="Open quote list">▢ Build bulk quote <b>{count}</b></button><button className="nav-menu" onClick={() => setMenu(!menu)} aria-label="Open navigation">☰</button></div></div>{menu && <nav className="mobile-menu shell open"><Link onClick={() => setMenu(false)} href="/">Home</Link><Link onClick={() => setMenu(false)} href="/products">Browse products</Link><Link onClick={() => setMenu(false)} href="/#find-part">Find my part</Link><Link onClick={() => setMenu(false)} href="/#wholesale">Wholesale</Link><Link onClick={() => setMenu(false)} href="/account/login">Login</Link></nav>}</header></>;
}

function CartDrawer({ open, close, items, setItems }: { open: boolean; close: () => void; items: CartItem[]; setItems: (items: CartItem[]) => void }) {
  const [sending, setSending] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const update = (productId: string, delta: number) => setItems(items.map(item => item.product_id === productId ? { ...item, quantity: item.quantity + delta } : item).filter(item => item.quantity > 0));
  async function sendQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!items.length) return; setSending(true); setMessage(null); const form = new FormData(event.currentTarget);
    const { data, error } = await createClient().rpc("create_quote_request", { customer_name: form.get("full_name"), customer_phone: form.get("phone"), customer_business: form.get("business_name") || "", customer_city: form.get("city") || "", customer_gst: form.get("gst_number") || "", customer_message: form.get("message") || "", items: items.map(({ product_id, quantity }) => ({ product_id, quantity })) });
    if (error) { setMessage(error.message); setSending(false); return; }
    const lines = items.map((item, index) => `${index + 1}. ${item.name} (${item.sku}) — Qty: ${item.quantity}`).join("%0A");
    const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919999999999";
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello SK Traders, I have submitted quote request ${data}.%0A%0A${lines}`)}`, "_blank", "noopener,noreferrer");
    setItems([]); setMessage("Quote saved. WhatsApp is opening with your selection."); setSending(false);
  }
  return <aside className={`cart-drawer ${open ? "open" : ""}`} aria-hidden={!open}><div className="cart-head"><div><span className="eyebrow">YOUR SELECTED PARTS</span><h2>Build bulk quote</h2></div><button className="cart-close" onClick={close}>×</button></div><div className="cart-items">{items.length ? items.map(item => <div className="cart-line" key={item.product_id}><div><b>{item.name}</b><small>{item.sku}</small></div><div className="quantity"><button onClick={() => update(item.product_id, -1)}>−</button><output>{item.quantity}</output><button onClick={() => update(item.product_id, 1)}>+</button></div></div>) : <p className="empty">Your quote is empty.<br/>Add parts and quantities to request dealer pricing.</p>}</div>{items.length > 0 && <form className="quote-form" onSubmit={sendQuote}><div className="compact-grid"><input required name="full_name" placeholder="Your name *"/><input required name="phone" placeholder="Phone / WhatsApp *"/></div><div className="compact-grid"><input name="business_name" placeholder="Business name"/><input name="city" placeholder="City"/></div><input name="gst_number" placeholder="GST number (optional)"/><textarea name="message" placeholder="Anything else we should know?"/><button className="btn btn-primary" disabled={sending} type="submit">{sending ? "Sending…" : "Request bulk quote on WhatsApp ↗"}</button>{message && <p className={message.includes("saved") ? "form-success" : "form-error"}>{message}</p>}</form>}</aside>;
}

function Footer() { return <footer id="contact" className="footer"><div className="shell footer-grid"><div><Link className="brand" href="/"><span className="brand-mark"><i/><i/><i/></span><span>SK <small>TRADERS</small></span></Link><p>Quality e-scooter spare parts for India&apos;s dealer and workshop network.</p></div><div><b>Need a part identified?</b><p>Build a quote list or speak directly with our team on WhatsApp.</p></div><small>© {new Date().getFullYear()} SK Traders</small></div></footer> }

export function SiteChrome({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]); const [open, setOpen] = useState(false);
  useEffect(() => { const saved = localStorage.getItem("sk-quote-list"); if (saved) setItems(JSON.parse(saved)); }, []);
  useEffect(() => localStorage.setItem("sk-quote-list", JSON.stringify(items)), [items]);
  const value = useMemo(() => ({ count: items.reduce((sum, item) => sum + item.quantity, 0), add: (item: Omit<CartItem, "quantity">, quantity = 1) => { setItems(current => { const exists = current.find(entry => entry.product_id === item.product_id); return exists ? current.map(entry => entry.product_id === item.product_id ? { ...entry, quantity: entry.quantity + quantity } : entry) : [...current, { ...item, quantity }]; }); setOpen(true); } }), [items]);
  return <CartContext.Provider value={value}><Header openCart={() => setOpen(true)}/><main>{children}</main><Footer/><CartDrawer open={open} close={() => setOpen(false)} items={items} setItems={setItems}/></CartContext.Provider>;
}
